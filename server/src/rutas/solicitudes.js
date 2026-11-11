import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { errorHttp } from '../errores.js';
import { requiereSesion } from '../auth/sesion.js';
import { ACCIONES, exige, alcanceSolicitudes } from '../auth/permisos.js';
import { enTransaccion } from '../util/transaccion.js';
import { validar, envolver } from '../util/http.js';
import { crearSchema, editarSchema, enOrden, aplicarAlta, aplicarModificacion, aplicarBaja } from '../util/equiposEscritura.js';

const actor = (req) => req.usuario.nombre || 'Sistema';

// R12: JSON de MariaDB llega como string, el de MySQL 8 como objeto. Siempre devolvemos objetos.
const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v ?? null);
const normalizar = (f) => ({ ...f, datos_propuestos: json(f.datos_propuestos), datos_anteriores: json(f.datos_anteriores) });
const leer = async (db, id) => {
  const [[f]] = await db.query('SELECT * FROM solicitudes_cambio WHERE id = ?', [id]);
  return f && normalizar(f);
};

const crearBody = z.object({
  tipo_accion: z.enum(['Alta', 'Modificación', 'Baja'], { error: 'El tipo de acción debe ser Alta, Modificación o Baja' }),
  equipo_id: z.string().max(36).nullish(),
  datos_propuestos: z.record(z.string(), z.unknown(), { error: 'Los datos propuestos son obligatorios' }).optional(),
});
const rechazarBody = z.object({ comentario: z.string().max(65535).nullish() });

// Misma validación (y mismos mensajes) que las escrituras directas de equipos.
function validarPropuestos(schema, datos) {
  const r = schema.safeParse(datos);
  if (r.success) return enOrden(datos, r.data);
  const i = r.error.issues[0];
  if (i?.code === 'unrecognized_keys') throw errorHttp(400, `Campos no permitidos: ${i.keys.join(', ')}`);
  throw errorHttp(400, /^(La|El|Los|Las) /.test(i?.message ?? '') ? i.message : 'Datos inválidos');
}

// Bloquea la solicitud (serializa aprobaciones/rechazos concurrentes) y exige que siga Pendiente.
async function bloquearPendiente(conn, id) {
  const [[s]] = await conn.query('SELECT * FROM solicitudes_cambio WHERE id = ? FOR UPDATE', [id]);
  if (!s) throw errorHttp(404, 'No encontrado');
  if (s.estado !== 'Pendiente') throw errorHttp(409, 'La solicitud ya fue resuelta');
  return normalizar(s);
}

export function crearRutasSolicitudes() {
  const r = Router();
  r.use(requiereSesion);

  // solicitudes.listar(email?): coordinador solo las propias. equipos anidado (o null) como supabase-js.
  r.get('/', exige(ACCIONES.SOLICITUDES_VER), envolver(async (req, res) => {
    const propias = alcanceSolicitudes(req.usuario) === 'propias';
    const [filas] = await req.app.locals.db.query(
      `SELECT s.*, e.numero_inventario AS e_numero_inventario, e.tipo AS e_tipo, e.marca AS e_marca, e.modelo AS e_modelo
       FROM solicitudes_cambio s LEFT JOIN equipos e ON e.id = s.equipo_id
       ${propias ? 'WHERE s.solicitado_por_email = ?' : ''}
       ORDER BY s.fecha_solicitud DESC, s.id`, propias ? [req.usuario.email] : []);
    res.json(filas.map(({ e_numero_inventario, e_tipo, e_marca, e_modelo, ...s }) => ({
      ...normalizar(s),
      equipos: s.equipo_id ? { numero_inventario: e_numero_inventario, tipo: e_tipo, marca: e_marca, modelo: e_modelo } : null,
    })));
  }));

  // solicitudes.equiposConPendientes(): ids de equipos con solicitud Pendiente (misma visibilidad que listar).
  r.get('/equipos-pendientes', exige(ACCIONES.SOLICITUDES_VER), envolver(async (req, res) => {
    const propias = alcanceSolicitudes(req.usuario) === 'propias';
    const [filas] = await req.app.locals.db.query(
      `SELECT equipo_id FROM solicitudes_cambio WHERE estado = 'Pendiente' AND equipo_id IS NOT NULL
       ${propias ? 'AND solicitado_por_email = ?' : ''}`, propias ? [req.usuario.email] : []);
    res.json(filas.map((f) => f.equipo_id));
  }));

  // solicitudes.crear(datos): el servidor fija solicitante, estado y datos_anteriores.
  r.post('/', exige(ACCIONES.SOLICITUDES_CREAR), validar(crearBody), envolver(async (req, res) => {
    const { db } = req.app.locals;
    const { tipo_accion, equipo_id, datos_propuestos } = req.datos;
    let equipoId = null;
    let propuestos;
    let anteriores = null;
    if (tipo_accion === 'Alta') {
      propuestos = validarPropuestos(crearSchema, datos_propuestos ?? {});
    } else {
      if (!equipo_id) throw errorHttp(400, 'El equipo es obligatorio');
      const [[e]] = await db.query('SELECT * FROM equipos WHERE id = ?', [equipo_id]);
      if (!e) throw errorHttp(404, 'No encontrado');
      equipoId = e.id;
      anteriores = e;
      propuestos = tipo_accion === 'Baja' ? { estado: 'De baja' } : validarPropuestos(editarSchema, datos_propuestos ?? {});
    }
    const id = randomUUID();
    await db.query(
      `INSERT INTO solicitudes_cambio (id, tipo_accion, equipo_id, datos_propuestos, datos_anteriores, estado, solicitado_por, solicitado_por_email)
       VALUES (?, ?, ?, ?, ?, 'Pendiente', ?, ?)`,
      [id, tipo_accion, equipoId, JSON.stringify(propuestos), anteriores && JSON.stringify(anteriores), actor(req), req.usuario.email]);
    res.status(201).json(await leer(db, id));
  }));

  // solicitudes.aprobar(solicitud, actor): aplica el cambio, registra el movimiento (textos del frontend) y marca Aprobado.
  r.post('/:id/aprobar', exige(ACCIONES.SOLICITUDES_RESOLVER), envolver(async (req, res) => {
    const { db } = req.app.locals;
    await enTransaccion(db, async (conn) => {
      const s = await bloquearPendiente(conn, req.params.id);
      const usuario = actor(req);
      const sufijo = ` (solicitado por ${s.solicitado_por})`;
      if (s.tipo_accion === 'Alta') {
        await aplicarAlta(conn, validarPropuestos(crearSchema, s.datos_propuestos), usuario, { sufijo });
      } else if (s.tipo_accion === 'Modificación') {
        await aplicarModificacion(conn, s.equipo_id, validarPropuestos(editarSchema, s.datos_propuestos), usuario,
          { anterior: s.datos_anteriores, ident: s.datos_propuestos, sufijo });
      } else {
        await aplicarBaja(conn, s.equipo_id, usuario, { ident: s.datos_anteriores, sufijo });
      }
      await conn.query("UPDATE solicitudes_cambio SET estado = 'Aprobado', resuelto_por = ?, fecha_resolucion = UTC_TIMESTAMP(3) WHERE id = ?", [usuario, s.id]);
    });
    res.json(await leer(db, req.params.id));
  }));

  // solicitudes.rechazar(id, comentario, actor): no toca equipos.
  r.post('/:id/rechazar', exige(ACCIONES.SOLICITUDES_RESOLVER), validar(rechazarBody), envolver(async (req, res) => {
    const { db } = req.app.locals;
    await enTransaccion(db, async (conn) => {
      const s = await bloquearPendiente(conn, req.params.id);
      await conn.query("UPDATE solicitudes_cambio SET estado = 'Rechazado', resuelto_por = ?, fecha_resolucion = UTC_TIMESTAMP(3), comentario_resolucion = ? WHERE id = ?",
        [actor(req), req.datos.comentario ?? null, s.id]);
    });
    res.json(await leer(db, req.params.id));
  }));

  return r;
}
