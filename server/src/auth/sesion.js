import { errorHttp } from '../errores.js';

export const NOMBRE_COOKIE = 'sid';
export const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function opcionesCookie(config) {
  return { httpOnly: true, secure: true, sameSite: 'lax', domain: config.cookieDomain, path: '/' };
}

export const promesa = (fn) => new Promise((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));

export function limpiarCookie(res, config) {
  res.clearCookie(NOMBRE_COOKIE, opcionesCookie(config));
}

// Carga el usuario desde la base en CADA request (rol/habilitado nunca se confían de la sesión).
export function requiereSesion(req, res, next) {
  const { db, config } = req.app.locals;
  (async () => {
    const id = req.session?.usuarioId;
    if (!id) throw errorHttp(401, 'No autenticado');
    const [filas] = await db.query(
      'SELECT id, email, nombre, rol, sede, habilitado FROM usuarios WHERE id = ?',
      [id],
    );
    const u = filas[0];
    if (!u || !u.habilitado) {
      await promesa((cb) => req.session.destroy(cb));
      limpiarCookie(res, config);
      throw errorHttp(401, 'Sesión no válida');
    }
    req.usuario = { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, sede: u.sede, habilitado: !!u.habilitado };
  })().then(() => next(), next);
}
