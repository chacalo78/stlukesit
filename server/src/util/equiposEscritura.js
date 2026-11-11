import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { errorHttp } from '../errores.js';
import { movimiento } from './transaccion.js';
import { ESTADOS_ESCRITURA, identificarEquipo, camposModificados } from './equipos.js';

// Schemas de escritura de equipos (Equipos.jsx handleSave). Los usan las rutas de equipos y de solicitudes.
const texto = z.string().max(255).nullable();
const fecha = z.string().regex(/^\d{4}-\d\d-\d\d$/, 'La fecha debe tener el formato AAAA-MM-DD')
  .refine((s) => { const t = new Date(`${s}T00:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(s); }, 'La fecha no es válida').nullable();
const estado = z.enum(ESTADOS_ESCRITURA, { error: `El estado debe ser uno de: ${ESTADOS_ESCRITURA.join(', ')}` });

const CAMPOS = {
  numero_inventario: texto, id_red: texto, marca: texto, modelo: texto, numero_serie: texto,
  procesador: texto, ram: texto, disco: texto, tipo_disco: texto, sistema_operativo: texto,
  ubicacion: texto, sector: texto, usuario: texto,
  fecha_adquisicion: fecha, garantia_hasta: fecha,
  observaciones: z.string().max(65535).nullable(),
};
const tipo = z.string().min(1, 'El tipo es obligatorio').max(255);
const opcionales = Object.fromEntries(Object.entries(CAMPOS).map(([k, v]) => [k, v.optional()]));
export const crearSchema = z.strictObject({ ...opcionales, tipo, estado: estado.optional() });
export const editarSchema = z.strictObject({
  ...opcionales, tipo: tipo.optional(), estado: estado.optional(),
}).refine((o) => Object.keys(o).length > 0, 'No hay datos para modificar');

// camposModificados recorre las claves en el orden en que las mandó el cliente (zod las reordena según el schema).
export const enOrden = (original, validados) =>
  Object.fromEntries(Object.keys(original).filter((k) => k in validados).map((k) => [k, validados[k]]));

// Dentro de la transacción: bloquea la fila (decisiones sobre su estado actual) o 404.
export async function bloquearEquipo(conn, id) {
  const [[f]] = await conn.query('SELECT * FROM equipos WHERE id = ? FOR UPDATE', [id]);
  if (!f) throw errorHttp(404, 'No encontrado');
  return f;
}

// Escrituras de equipo + movimiento, compartidas por las rutas directas (admin) y por aprobar solicitudes.
// `sufijo` (p. ej. " (solicitado por X)") y `ident`/`anterior` permiten reproducir los textos que arma el
// frontend al aprobar; sin opciones dan los textos de la edición directa.
export async function aplicarAlta(conn, datos, actor, { sufijo = '' } = {}) {
  const id = randomUUID();
  const cols = ['id', ...Object.keys(datos)];
  await conn.query(`INSERT INTO equipos (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, [id, ...Object.values(datos)]);
  await movimiento(conn, 'Alta', `Equipo dado de alta: ${identificarEquipo(datos)}${sufijo}`, actor, id);
  return id;
}

export async function aplicarModificacion(conn, id, datos, actor, { anterior, ident, sufijo = '' } = {}) {
  const f = await bloquearEquipo(conn, id);
  if (f.estado === 'Baja Definitiva') throw errorHttp(409, 'El equipo está dado de baja definitivamente');
  const cols = Object.keys(datos);
  await conn.query(`UPDATE equipos SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...Object.values(datos), f.id]);
  const cambios = camposModificados(anterior ?? f, datos);
  await movimiento(conn, 'Modificación',
    `Equipo modificado: ${identificarEquipo(ident ?? { ...f, ...datos })}${cambios.length ? ` — ${cambios.join('; ')}` : ''}${sufijo}`, actor, f.id);
  return f;
}

export async function aplicarBaja(conn, id, actor, { ident, sufijo = '' } = {}) {
  const f = await bloquearEquipo(conn, id);
  if (f.estado === 'Baja Definitiva') throw errorHttp(409, 'El equipo está dado de baja definitivamente');
  await conn.query("UPDATE equipos SET estado = 'De baja' WHERE id = ?", [f.id]);
  await movimiento(conn, 'Baja', `Equipo dado de baja: ${identificarEquipo(ident ?? f)}${sufijo}`, actor, f.id);
  return f;
}
