import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { errorHttp } from '../errores.js';
import { requiereSesion } from '../auth/sesion.js';
import { ACCIONES, exige } from '../auth/permisos.js';
import { validar, envolver } from '../util/http.js';

const OBLIGATORIOS = 'El tipo, la sección, el asunto y la descripción son obligatorios';
const requerido = z.string({ error: OBLIGATORIOS });
// z.object descarta el resto (reportado_por, reportado_por_email, estado, id, created_at: los fija el servidor).
const crearBody = z.object({
  tipo: z.enum(['Error', 'Falla', 'Mejora'], { error: 'El tipo debe ser Error, Falla o Mejora' }),
  seccion: requerido.trim().min(1, OBLIGATORIOS).max(255),
  asunto: requerido.trim().min(1, OBLIGATORIOS).max(65535),
  descripcion: requerido.trim().min(1, OBLIGATORIOS).max(65535),
});
// feedback.actualizar solo cambia el estado (FeedbackDev.jsx).
const editarBody = z.strictObject({ estado: z.enum(['Nuevo', 'Resuelto'], { error: 'El estado debe ser Nuevo o Resuelto' }) });

const leer = async (db, id) => (await db.query('SELECT * FROM feedback_desarrollador WHERE id = ?', [id]))[0][0];

// No hay DELETE: el frontend nunca llama feedback.eliminar.
export function crearRutasFeedback() {
  const r = Router();
  r.use(requiereSesion);

  r.get('/', exige(ACCIONES.FEEDBACK_VER), envolver(async (req, res) => {
    res.json((await req.app.locals.db.query('SELECT * FROM feedback_desarrollador ORDER BY created_at DESC, id'))[0]);
  }));

  r.post('/', exige(ACCIONES.FEEDBACK_CREAR), validar(crearBody), envolver(async (req, res) => {
    const { db } = req.app.locals;
    const { tipo, seccion, asunto, descripcion } = req.datos;
    const id = randomUUID();
    await db.query(
      `INSERT INTO feedback_desarrollador (id, tipo, seccion, asunto, descripcion, estado, reportado_por, reportado_por_email)
       VALUES (?, ?, ?, ?, ?, 'Nuevo', ?, ?)`,
      [id, tipo, seccion, asunto, descripcion, req.usuario.nombre || req.usuario.email, req.usuario.email]);
    res.status(201).json(await leer(db, id));
  }));

  r.patch('/:id', exige(ACCIONES.FEEDBACK_MODIFICAR), validar(editarBody), envolver(async (req, res) => {
    const { db } = req.app.locals;
    const [r1] = await db.query('UPDATE feedback_desarrollador SET estado = ? WHERE id = ?', [req.datos.estado, req.params.id]);
    if (!r1.affectedRows) throw errorHttp(404, 'No encontrado');
    res.json(await leer(db, req.params.id));
  }));

  return r;
}
