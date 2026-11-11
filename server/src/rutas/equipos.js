import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { errorHttp } from '../errores.js';
import { requiereSesion } from '../auth/sesion.js';
import { ACCIONES, exige } from '../auth/permisos.js';
import { enTransaccion, movimiento } from '../util/transaccion.js';
import { validar, envolver } from '../util/http.js';
import { ESTADOS_ESCRITURA, identificarEquipo, camposModificados } from '../util/equipos.js';

const texto = z.string().max(255).nullable();
const fecha = z.string().regex(/^\d{4}-\d\d-\d\d$/, 'La fecha debe tener el formato AAAA-MM-DD')
  .refine((s) => { const t = new Date(`${s}T00:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(s); }, 'La fecha no es válida').nullable();
const estado = z.enum(ESTADOS_ESCRITURA, { error: `El estado debe ser uno de: ${ESTADOS_ESCRITURA.join(', ')}` });

// Exactamente las columnas que escribe el formulario (Equipos.jsx handleSave).
const CAMPOS = {
  numero_inventario: texto, id_red: texto, marca: texto, modelo: texto, numero_serie: texto,
  procesador: texto, ram: texto, disco: texto, tipo_disco: texto, sistema_operativo: texto,
  ubicacion: texto, sector: texto, usuario: texto,
  fecha_adquisicion: fecha, garantia_hasta: fecha,
  observaciones: z.string().max(65535).nullable(),
};
const tipo = z.string().min(1, 'El tipo es obligatorio').max(255);
const opcionales = Object.fromEntries(Object.entries(CAMPOS).map(([k, v]) => [k, v.optional()]));
const crearSchema = z.strictObject({ ...opcionales, tipo, estado: estado.optional() });
const editarSchema = z.strictObject({
  ...opcionales, tipo: tipo.optional(), estado: estado.optional(),
}).refine((o) => Object.keys(o).length > 0, 'No hay datos para modificar');

// camposModificados recorre las claves en el orden en que las mandó el cliente (zod las reordena según el schema).
const enOrdenDelCliente = (req) => Object.fromEntries(Object.keys(req.body).filter((k) => k in req.datos).map((k) => [k, req.datos[k]]));

const actor = (req) => req.usuario.nombre || 'Sistema';
const leer = async (db, id) => (await db.query('SELECT * FROM equipos WHERE id = ?', [id]))[0][0];

// Dentro de la transacción: bloquea la fila (decisiones sobre su estado actual) o 404.
async function bloquear(conn, id) {
  const [[f]] = await conn.query('SELECT * FROM equipos WHERE id = ? FOR UPDATE', [id]);
  if (!f) throw errorHttp(404, 'No encontrado');
  return f;
}

const BOOL = z.enum(['true', 'false']);
const listarSchema = z.object({ sede: z.string().min(1).optional(), ordenado: BOOL.optional() });
const consulta = (schema, msg) => (req) => {
  const r = schema.safeParse(req.query);
  if (!r.success) throw errorHttp(400, msg);
  return r.data;
};

export function crearRutasEquipos() {
  const r = Router();
  r.use(requiereSesion);

  // equipos.listar({ sede, ordenado }): sin 'Baja Definitiva'. NULL al final al ordenar (como Postgres ASC).
  r.get('/', exige(ACCIONES.EQUIPOS_LEER), envolver(async (req, res) => {
    const { sede, ordenado } = consulta(listarSchema, 'Parámetros inválidos')(req);
    const params = [];
    let sql = "SELECT * FROM equipos WHERE estado <> 'Baja Definitiva'";
    if (sede) { sql += ' AND ubicacion = ?'; params.push(sede); }
    if (ordenado === 'true') sql += ' ORDER BY numero_inventario IS NULL, numero_inventario ASC';
    res.json((await req.app.locals.db.query(sql, params))[0]);
  }));

  // equipos.listarBajasDefinitivas(): más reciente primero (NULL primero, como Postgres DESC).
  r.get('/bajas-definitivas', exige(ACCIONES.EQUIPOS_LEER), envolver(async (req, res) => {
    const [filas] = await req.app.locals.db.query(
      "SELECT * FROM equipos WHERE estado = 'Baja Definitiva' ORDER BY fecha_baja_definitiva IS NULL DESC, fecha_baja_definitiva DESC");
    res.json(filas);
  }));

  r.get('/:id', exige(ACCIONES.EQUIPOS_LEER), envolver(async (req, res) => {
    const e = await leer(req.app.locals.db, req.params.id);
    if (!e) throw errorHttp(404, 'No encontrado');
    res.json(e);
  }));

  // movimientos.listarPorEquipo(equipoId)
  r.get('/:id/movimientos', exige(ACCIONES.EQUIPOS_LEER), exige(ACCIONES.MOVIMIENTOS_LEER), envolver(async (req, res) => {
    const { db } = req.app.locals;
    if (!(await leer(db, req.params.id))) throw errorHttp(404, 'No encontrado');
    const [filas] = await db.query(
      'SELECT * FROM movimientos WHERE equipo_id = ? ORDER BY fecha IS NULL DESC, fecha DESC', [req.params.id]);
    res.json(filas);
  }));

  // equipos.crear(datos, actor): alta + movimiento 'Alta'.
  r.post('/', exige(ACCIONES.EQUIPOS_ESCRIBIR), validar(crearSchema), envolver(async (req, res) => {
    const { db } = req.app.locals;
    const d = enOrdenDelCliente(req);
    const id = randomUUID();
    const cols = ['id', ...Object.keys(d)];
    await enTransaccion(db, async (conn) => {
      await conn.query(`INSERT INTO equipos (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, [id, ...Object.values(d)]);
      await movimiento(conn, 'Alta', `Equipo dado de alta: ${identificarEquipo(d)}`, actor(req), id);
    });
    res.status(201).json(await leer(db, id));
  }));

  // equipos.actualizar(id, datos, anterior, actor): el "anterior" es la fila bloqueada, no lo que mande el cliente.
  r.patch('/:id', exige(ACCIONES.EQUIPOS_ESCRIBIR), validar(editarSchema), envolver(async (req, res) => {
    const { db } = req.app.locals;
    const d = enOrdenDelCliente(req);
    const cols = Object.keys(d);
    await enTransaccion(db, async (conn) => {
      const f = await bloquear(conn, req.params.id);
      if (f.estado === 'Baja Definitiva') throw errorHttp(409, 'El equipo está dado de baja definitivamente');
      await conn.query(`UPDATE equipos SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...Object.values(d), f.id]);
      const cambios = camposModificados(f, d);
      await movimiento(conn, 'Modificación',
        `Equipo modificado: ${identificarEquipo({ ...f, ...d })}${cambios.length ? ` — ${cambios.join('; ')}` : ''}`, actor(req), f.id);
    });
    res.json(await leer(db, req.params.id));
  }));

  // Transición de estado con precondición sobre el estado actual (fila bloqueada) + su movimiento.
  const transicion = ({ permitido, conflicto, set, tipoMov, desc }) => envolver(async (req, res) => {
    const { db } = req.app.locals;
    await enTransaccion(db, async (conn) => {
      const f = await bloquear(conn, req.params.id);
      if (!permitido(f.estado)) throw errorHttp(409, conflicto);
      await conn.query(`UPDATE equipos SET ${set.sql} WHERE id = ?`, [...set.params(req), f.id]);
      await movimiento(conn, tipoMov, `${desc}: ${identificarEquipo(f)}`, actor(req), f.id);
    });
    res.json(await leer(db, req.params.id));
  });

  // equipos.darDeBaja(equipo, actor)
  r.post('/:id/baja', exige(ACCIONES.EQUIPOS_ESCRIBIR), transicion({
    permitido: (e) => e !== 'Baja Definitiva', // como el frontend: sobre 'De baja' actualiza y registra de nuevo
    conflicto: 'El equipo está dado de baja definitivamente',
    set: { sql: "estado = 'De baja'", params: () => [] },
    tipoMov: 'Baja', desc: 'Equipo dado de baja',
  }));

  // equipos.bajaDefinitiva(equipo, actor): no borra; solo desde 'De baja' (como el botón de la UI).
  r.post('/:id/baja-definitiva', exige(ACCIONES.EQUIPOS_ESCRIBIR), transicion({
    permitido: (e) => e === 'De baja',
    conflicto: 'Solo se puede dar de baja definitiva un equipo que está de baja',
    set: { sql: "estado = 'Baja Definitiva', fecha_baja_definitiva = UTC_TIMESTAMP(3), dado_de_baja_definitiva_por = ?", params: (req) => [actor(req)] },
    tipoMov: 'Baja Definitiva', desc: 'Equipo dado de baja definitiva',
  }));

  // equipos.restaurar(equipo, actor): solo desde 'Baja Definitiva'. Deja fecha/por de la baja como hoy.
  r.post('/:id/restaurar', exige(ACCIONES.EQUIPOS_RESTAURAR), transicion({
    permitido: (e) => e === 'Baja Definitiva',
    conflicto: 'El equipo no está en Bajas Definitivas',
    set: { sql: "estado = 'Activo'", params: () => [] },
    tipoMov: 'Modificación', desc: 'Equipo restaurado desde Bajas Definitivas',
  }));

  return r;
}
