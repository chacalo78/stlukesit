import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { errorHttp } from '../errores.js';
import { crearLimiteIntentos } from './limiteIntentos.js';
import { requiereSesion, promesa, limpiarCookie } from './sesion.js';

const COSTO = 12;
// Hash de relleno: se compara cuando el usuario no existe o no tiene hash, para igualar tiempos.
const HASH_DUMMY = bcrypt.hashSync('relleno-no-es-una-clave-real', COSTO);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(255),
  password: z.string().min(1).max(1000),
});
const passwordSchema = z.object({
  passwordActual: z.string().min(1).max(1000),
  // bcrypt solo usa los primeros 72 bytes.
  passwordNueva: z.string()
    .min(6, 'La nueva contraseña debe tener al menos 6 caracteres')
    .refine((p) => Buffer.byteLength(p) <= 72, 'La nueva contraseña es demasiado larga'),
});

function validar(schema, body) {
  const r = schema.safeParse(body);
  if (!r.success) throw errorHttp(400, r.error.issues[0]?.message?.startsWith('La ') ? r.error.issues[0].message : 'Datos inválidos');
  return r.data;
}

const publico = (u) => ({ email: u.email, nombre: u.nombre, rol: u.rol, sede: u.sede, habilitado: !!u.habilitado });
const envolver = (fn) => (req, res, next) => fn(req, res).catch(next);

export function crearRutasAuth({ ahora } = {}) {
  const limite = crearLimiteIntentos({ ahora });
  const r = Router();

  r.post('/login', envolver(async (req, res) => {
    const { email, password } = validar(loginSchema, req.body);
    const clave = `${req.ip}|${email}`;
    if (limite.bloqueado(clave)) throw errorHttp(429, 'Demasiados intentos. Probá de nuevo en unos minutos.');

    const { db } = req.app.locals;
    const [filas] = await db.query(
      'SELECT id, email, password_hash, nombre, rol, sede, habilitado FROM usuarios WHERE LOWER(email) = ?',
      [email],
    );
    const u = filas[0];
    const ok = await bcrypt.compare(password, u?.password_hash || HASH_DUMMY);
    if (!u || !u.password_hash || !ok) {
      limite.registrarFallo(clave);
      throw errorHttp(401, 'Email o contraseña incorrectos');
    }
    limite.reiniciar(clave);
    if (!u.habilitado) throw errorHttp(403, 'Tu usuario está inhabilitado');

    await promesa((cb) => req.session.regenerate(cb)); // anti session-fixation
    req.session.usuarioId = u.id;
    await promesa((cb) => req.session.save(cb));
    res.json(publico(u));
  }));

  r.get('/sesion', requiereSesion, (req, res) => res.json(publico(req.usuario)));

  r.post('/logout', envolver(async (req, res) => {
    if (req.session) await promesa((cb) => req.session.destroy(cb));
    limpiarCookie(res, req.app.locals.config);
    res.json({ ok: true });
  }));

  r.post('/password', requiereSesion, envolver(async (req, res) => {
    const { passwordActual, passwordNueva } = validar(passwordSchema, req.body);
    const { db } = req.app.locals;
    const [filas] = await db.query('SELECT password_hash FROM usuarios WHERE id = ?', [req.usuario.id]);
    const hash = filas[0]?.password_hash;
    const ok = await bcrypt.compare(passwordActual, hash || HASH_DUMMY);
    if (!hash || !ok) throw errorHttp(400, 'La contraseña actual es incorrecta');

    const nuevo = await bcrypt.hash(passwordNueva, COSTO);
    await db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [nuevo, req.usuario.id]);
    await promesa((cb) => req.session.regenerate(cb));
    req.session.usuarioId = req.usuario.id;
    await promesa((cb) => req.session.save(cb));
    // TODO(Tarea 8): aquí se enviará el mail "contraseña cambiada" (hook: app.locals.mailer).
    res.json({ ok: true });
  }));

  return r;
}
