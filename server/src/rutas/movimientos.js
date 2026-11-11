import { Router } from 'express';
import { z } from 'zod';
import { errorHttp } from '../errores.js';
import { requiereSesion } from '../auth/sesion.js';
import { ACCIONES, exige } from '../auth/permisos.js';
import { envolver } from '../util/http.js';

const consultaSchema = z.object({ limite: z.string().regex(/^[1-9]\d{0,5}$/).optional() });

export function crearRutasMovimientos() {
  const r = Router();
  r.use(requiereSesion);

  // movimientos.listar({ limite }): más recientes primero, con el equipo completo anidado (o null).
  // El Dashboard pedía solo `equipos(ubicacion)`: recibe el objeto completo y usa solo ubicacion.
  r.get('/', exige(ACCIONES.MOVIMIENTOS_LEER), envolver(async (req, res) => {
    const q = consultaSchema.safeParse(req.query);
    if (!q.success) throw errorHttp(400, 'El límite debe ser un número entero positivo');
    const sql = 'SELECT * FROM movimientos m LEFT JOIN equipos e ON e.id = m.equipo_id ORDER BY m.fecha IS NULL DESC, m.fecha DESC'
      + (q.data.limite ? ' LIMIT ?' : '');
    const [filas] = await req.app.locals.db.query({ sql, nestTables: true }, q.data.limite ? [Number(q.data.limite)] : []);
    res.json(filas.map(({ m, e }) => ({ ...m, equipos: e.id === null ? null : e })));
  }));

  return r;
}
