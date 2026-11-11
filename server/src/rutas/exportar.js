import { Router } from 'express';
import { requiereSesion } from '../auth/sesion.js';
import { ACCIONES, exige } from '../auth/permisos.js';
import { envolver } from '../util/http.js';

export function crearRutasExportar() {
  const r = Router();
  r.use(requiereSesion);

  // exportar.todo(): todos los equipos (incluida la Baja Definitiva) por n° de inventario, NULL al final.
  r.get('/', exige(ACCIONES.EXPORTAR), envolver(async (req, res) => {
    const [equipos] = await req.app.locals.db.query('SELECT * FROM equipos ORDER BY numero_inventario IS NULL, numero_inventario ASC, id');
    res.json({ equipos });
  }));

  return r;
}
