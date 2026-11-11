import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { errorHttp } from '../errores.js';
import { requiereSesion } from '../auth/sesion.js';
import { ACCIONES, exige } from '../auth/permisos.js';
import { validar, envolver } from '../util/http.js';

// Mismos campos que Repuestos.jsx handleSave. Vacío -> NULL ('' -> 'Otro' en categoría); cantidad entera >= 0.
const nulo = (max) => z.string().max(max).nullish().transform((v) => v || null);
const campos = {
  categoria: z.string().max(255).nullish().transform((v) => v || 'Otro'),
  marca: nulo(255), modelo: nulo(255), ubicacion: nulo(255), observaciones: nulo(65535),
  cantidad: z.number({ error: 'La cantidad debe ser un número entero mayor o igual a 0' })
    .int('La cantidad debe ser un número entero mayor o igual a 0').min(0, 'La cantidad debe ser un número entero mayor o igual a 0').max(2147483647),
};
const crearBody = z.strictObject({ ...campos, cantidad: campos.cantidad.default(1) });
const editarBody = z.strictObject(Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v.optional()])))
  .refine((o) => Object.keys(o).length > 0, 'No hay datos para modificar');

const leer = async (db, id) => (await db.query('SELECT * FROM repuestos WHERE id = ?', [id]))[0][0];

export function crearRutasRepuestos() {
  const r = Router();
  r.use(requiereSesion, exige(ACCIONES.REPUESTOS_GESTIONAR));

  r.get('/', envolver(async (req, res) => {
    res.json((await req.app.locals.db.query('SELECT * FROM repuestos ORDER BY categoria ASC, created_at, id'))[0]);
  }));

  r.post('/', validar(crearBody), envolver(async (req, res) => {
    const { db } = req.app.locals;
    const id = randomUUID();
    const d = req.datos;
    await db.query('INSERT INTO repuestos (id, categoria, marca, modelo, cantidad, ubicacion, observaciones) VALUES (?,?,?,?,?,?,?)',
      [id, d.categoria, d.marca, d.modelo, d.cantidad, d.ubicacion, d.observaciones]);
    res.status(201).json(await leer(db, id));
  }));

  r.patch('/:id', validar(editarBody), envolver(async (req, res) => {
    const { db } = req.app.locals;
    const cols = Object.keys(req.datos);
    const [r1] = await db.query(`UPDATE repuestos SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...Object.values(req.datos), req.params.id]);
    if (!r1.affectedRows) throw errorHttp(404, 'No encontrado');
    res.json(await leer(db, req.params.id));
  }));

  r.delete('/:id', envolver(async (req, res) => {
    const [r1] = await req.app.locals.db.query('DELETE FROM repuestos WHERE id = ?', [req.params.id]);
    if (!r1.affectedRows) throw errorHttp(404, 'No encontrado');
    res.json({ ok: true });
  }));

  return r;
}
