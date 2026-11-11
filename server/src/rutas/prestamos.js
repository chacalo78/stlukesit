import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { errorHttp } from '../errores.js';
import { requiereSesion } from '../auth/sesion.js';
import { ACCIONES, exige } from '../auth/permisos.js';
import * as plantillas from '../mail/plantillas.js';
import { enTransaccion, movimiento } from '../util/transaccion.js';
import { validar, envolver } from '../util/http.js';
import { mandarMail } from '../util/mail.js';

const actor = (req) => req.usuario.nombre || 'Sistema';

// Port verbatim de Prestamos.jsx.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBLIGATORIOS = 'El equipo, la persona, la fecha de devolución y el correo electrónico son obligatorios';
const requerido = z.string({ error: OBLIGATORIOS });
const fecha = requerido.regex(/^\d{4}-\d\d-\d\d$/, 'La fecha de devolución debe tener el formato AAAA-MM-DD')
  .refine((s) => { const t = new Date(`${s}T00:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(s); }, 'La fecha de devolución no es válida');
// Valores vacíos se guardan NULL (el frontend manda `|| null`).
const opcional = (max) => z.string().max(max).nullish().transform((v) => v || null);

const crearBody = z.object({
  equipo_id: requerido.min(1, OBLIGATORIOS).max(36),
  persona: requerido.trim().min(1, OBLIGATORIOS).max(255),
  email_destinatario: requerido.trim().min(1, OBLIGATORIOS).max(255)
    .refine((e) => e.length >= 6 && EMAIL_REGEX.test(e), 'El correo electrónico no es válido'),
  sector: opcional(255),
  fecha_devolucion_estimada: fecha,
  observaciones_entrega: opcional(65535),
}); // z.object descarta el resto (registrado_por, id, fechas, etc.: los fija el servidor)
const devolverBody = z.object({ observaciones: opcional(65535) });

// Mismo select que prestamos.listar (equipos anidado). `extra` agrega columnas de equipos para el POST/devolver.
const SELECT = `SELECT p.*, e.id AS e_id, e.numero_inventario AS e_numero_inventario, e.tipo AS e_tipo, e.marca AS e_marca,
  e.modelo AS e_modelo, e.ubicacion AS e_ubicacion FROM prestamos p LEFT JOIN equipos e ON e.id = p.equipo_id`;
const anidar = ({ e_id, e_numero_inventario, e_tipo, e_marca, e_modelo, e_ubicacion, ...p }) => ({
  ...p,
  equipos: e_id === null ? null : { id: e_id, numero_inventario: e_numero_inventario, tipo: e_tipo, marca: e_marca, modelo: e_modelo, ubicacion: e_ubicacion },
});
const leer = async (db, id) => {
  const [[f]] = await db.query(`${SELECT} WHERE p.id = ?`, [id]);
  return f && anidar(f);
};

export function crearRutasPrestamos() {
  const r = Router();
  r.use(requiereSesion);

  // prestamos.listar(): más recientes primero.
  r.get('/', exige(ACCIONES.PRESTAMOS_LEER), envolver(async (req, res) => {
    const [filas] = await req.app.locals.db.query(`${SELECT} ORDER BY p.fecha_prestamo DESC, p.created_at DESC, p.id`);
    res.json(filas.map(anidar));
  }));

  // prestamos.listarActivos() (Dashboard): sin devolver, con equipos(ubicacion). Debe ir antes de /:id.
  r.get('/activos', exige(ACCIONES.PRESTAMOS_LEER), envolver(async (req, res) => {
    const [filas] = await req.app.locals.db.query(
      `SELECT p.*, e.ubicacion AS e_ubicacion FROM prestamos p LEFT JOIN equipos e ON e.id = p.equipo_id
       WHERE p.fecha_devolucion_real IS NULL ORDER BY p.created_at, p.id`);
    res.json(filas.map(({ e_ubicacion, ...p }) => ({ ...p, equipos: p.equipo_id ? { ubicacion: e_ubicacion } : null })));
  }));

  // prestamos.crear(datos, equipo, actor): préstamo + equipo 'Prestado' + movimiento en una transacción; después el mail.
  r.post('/', exige(ACCIONES.PRESTAMOS_CREAR), validar(crearBody), envolver(async (req, res) => {
    const { db, mailer } = req.app.locals;
    const d = req.datos;
    const id = randomUUID();
    const eq = await enTransaccion(db, async (conn) => {
      const [[e]] = await conn.query('SELECT * FROM equipos WHERE id = ? FOR UPDATE', [d.equipo_id]);
      if (!e) throw errorHttp(404, 'No encontrado');
      // Prestamos.jsx ofrece solo equipos operativos (sin 'Prestado', 'De baja' ni 'Baja Definitiva').
      if (['Prestado', 'De baja', 'Baja Definitiva'].includes(e.estado)) {
        throw errorHttp(409, `El equipo no está disponible para prestar (estado: ${e.estado})`);
      }
      await conn.query(
        `INSERT INTO prestamos (id, equipo_id, persona, sector, fecha_devolucion_estimada, observaciones_entrega, registrado_por, email_destinatario)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, e.id, d.persona, d.sector, d.fecha_devolucion_estimada, d.observaciones_entrega, actor(req), d.email_destinatario]);
      await conn.query("UPDATE equipos SET estado = 'Prestado', usuario = ? WHERE id = ?", [d.persona, e.id]);
      await movimiento(conn, 'Préstamo', `Equipo prestado a ${d.persona} (${e.numero_inventario})`, actor(req), e.id);
      return e;
    });
    const mailError = await mandarMail(mailer, {
      para: d.email_destinatario,
      ...plantillas.prestamo({
        persona: d.persona, numeroInventario: eq.numero_inventario || '', tipo: eq.tipo || '', marca: eq.marca || '',
        modelo: eq.modelo || '', fechaDevolucion: d.fecha_devolucion_estimada,
      }),
    });
    res.status(201).json({ prestamo: await leer(db, id), ...(mailError && { mailError }) });
  }));

  // prestamos.devolver(prestamo, observaciones, actor): fecha real (UTC), equipo 'Activo' sin usuario, movimiento; después el mail.
  r.post('/:id/devolver', exige(ACCIONES.PRESTAMOS_DEVOLVER), validar(devolverBody), envolver(async (req, res) => {
    const { db, mailer } = req.app.locals;
    const { observaciones } = req.datos;
    await enTransaccion(db, async (conn) => {
      const [[f]] = await conn.query('SELECT * FROM prestamos WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!f) throw errorHttp(404, 'No encontrado');
      if (f.fecha_devolucion_real) throw errorHttp(409, 'El préstamo ya fue devuelto');
      await conn.query('UPDATE prestamos SET fecha_devolucion_real = UTC_TIMESTAMP(3), observaciones_devolucion = ? WHERE id = ?', [observaciones, f.id]);
      // Un equipo dado de baja definitiva mientras estaba prestado no se reactiva.
      await conn.query("UPDATE equipos SET estado = 'Activo', usuario = NULL WHERE id = ? AND estado <> 'Baja Definitiva'", [f.equipo_id]);
      const [[e]] = await conn.query('SELECT numero_inventario FROM equipos WHERE id = ?', [f.equipo_id]);
      await movimiento(conn, 'Devolución', `Equipo devuelto por ${f.persona}${e ? ` (${e.numero_inventario})` : ''}`, actor(req), f.equipo_id);
    });
    const prestamo = await leer(db, req.params.id);
    let mailError;
    if (prestamo.email_destinatario) {
      const eq = prestamo.equipos;
      mailError = await mandarMail(mailer, {
        para: prestamo.email_destinatario,
        ...plantillas.devolucion({
          persona: prestamo.persona, numeroInventario: eq?.numero_inventario || '', tipo: eq?.tipo || '', marca: eq?.marca || '',
          modelo: eq?.modelo || '', fechaDevolucion: prestamo.fecha_devolucion_real.toISOString(), observaciones: observaciones || '',
        }),
      });
    }
    res.json({ prestamo, ...(mailError && { mailError }) });
  }));

  return r;
}
