import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { errorHttp } from '../errores.js';
import { crearLimiteIntentos } from './limiteIntentos.js';
import { requiereSesion, promesa, limpiarCookie, cerrarSesionesDe } from './sesion.js';
import { crearToken, consumirToken, tokenUsable, MSG_ENLACE } from './tokens.js';
import { enSegundoPlano, enviarSinEsperar } from '../mail/enviar.js';
import * as plantillas from '../mail/plantillas.js';

const COSTO = 12;
const MAX_FALLOS_IP = 30;
// Hash de relleno: se compara cuando el usuario no existe o no tiene hash, para igualar tiempos.
const HASH_DUMMY = bcrypt.hashSync('relleno-no-es-una-clave-real', COSTO);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(255),
  password: z.string().min(1).max(1000),
});
// bcrypt solo usa los primeros 72 bytes.
const claveNueva = z.string()
  .min(6, 'La nueva contraseña debe tener al menos 6 caracteres')
  .refine((p) => Buffer.byteLength(p) <= 72, 'La nueva contraseña es demasiado larga');
const passwordSchema = z.object({
  passwordActual: z.string().min(1).max(1000),
  passwordNueva: claveNueva,
});
const recuperarSchema = z.object({ email: z.string().trim().toLowerCase().min(1).max(255) });
const tokenSchema = z.object({ token: z.string().min(1).max(200), password: claveNueva });

const MAX_FALLOS_TOKEN_IP = 10;
const MAX_MAILS_EMAIL = 3;
const MAX_PEDIDOS_IP = 20;
const HORA_MS = 60 * 60 * 1000;

function validar(schema, body) {
  const r = schema.safeParse(body);
  if (!r.success) throw errorHttp(400, r.error.issues[0]?.message?.startsWith('La ') ? r.error.issues[0].message : 'Datos inválidos');
  return r.data;
}

const publico = (u) => ({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, sede: u.sede, habilitado: !!u.habilitado });
const envolver = (fn) => (req, res, next) => fn(req, res).catch(next);

export function crearRutasAuth({ ahora } = {}) {
  const limite = crearLimiteIntentos({ ahora });
  const limiteIp = crearLimiteIntentos({ ahora, maxFallos: MAX_FALLOS_IP });
  const limitePwd = crearLimiteIntentos({ ahora });
  // R20: /recuperar -> 3 mails por email y 20 pedidos por IP, por hora.
  const limiteRecEmail = crearLimiteIntentos({ ahora, maxFallos: MAX_MAILS_EMAIL, ventanaMs: HORA_MS });
  const limiteRecIp = crearLimiteIntentos({ ahora, maxFallos: MAX_PEDIDOS_IP, ventanaMs: HORA_MS });
  // /token: fallos (token inválido) por IP.
  const limiteTokenIp = crearLimiteIntentos({ ahora, maxFallos: MAX_FALLOS_TOKEN_IP });
  const MSG_429 = 'Demasiados intentos. Probá de nuevo en unos minutos.';
  const r = Router();

  r.post('/login', envolver(async (req, res) => {
    const { email, password } = validar(loginSchema, req.body);
    const clave = `${req.ip}|${email}`;
    const claveIp = `ip|${req.ip}`;
    if (limite.bloqueado(clave) || limiteIp.bloqueado(claveIp)) throw errorHttp(429, MSG_429);

    const { db } = req.app.locals;
    const [filas] = await db.query(
      'SELECT id, email, password_hash, nombre, rol, sede, habilitado FROM usuarios WHERE LOWER(email) = ?',
      [email],
    );
    const u = filas[0];
    const ok = await bcrypt.compare(password, u?.password_hash || HASH_DUMMY);
    if (!u || !u.password_hash || !ok) {
      limite.registrarFallo(clave);
      limiteIp.registrarFallo(claveIp);
      throw errorHttp(401, 'Email o contraseña incorrectos');
    }
    limite.reiniciar(clave);
    if (!u.habilitado) throw errorHttp(403, 'Tu usuario está inhabilitado');

    // Hashes migrados (costo 10) -> costo 12, para que todas las cuentas tarden igual que el hash de relleno.
    if (bcrypt.getRounds(u.password_hash) < COSTO) {
      try {
        const nuevo = await bcrypt.hash(password, COSTO);
        await db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [nuevo, u.id]);
      } catch {
        console.warn('No se pudo actualizar el costo del hash de un usuario');
      }
    }

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
    const clavePwd = `pwd|${req.usuario.id}`;
    if (limitePwd.bloqueado(clavePwd)) throw errorHttp(429, MSG_429);
    const { db } = req.app.locals;
    const [filas] = await db.query('SELECT password_hash FROM usuarios WHERE id = ?', [req.usuario.id]);
    const hash = filas[0]?.password_hash;
    const ok = await bcrypt.compare(passwordActual, hash || HASH_DUMMY);
    if (!hash || !ok) {
      limitePwd.registrarFallo(clavePwd);
      throw errorHttp(400, 'La contraseña actual es incorrecta');
    }
    limitePwd.reiniciar(clavePwd);

    const nuevo = await bcrypt.hash(passwordNueva, COSTO);
    await db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [nuevo, req.usuario.id]);
    await promesa((cb) => req.session.regenerate(cb));
    req.session.usuarioId = req.usuario.id;
    await promesa((cb) => req.session.save(cb));
    await cerrarSesionesDe(db, req.usuario.id, req.sessionID); // las demás sesiones del usuario
    enviarSinEsperar(req.app.locals.mailer, { para: req.usuario.email, ...plantillas.passwordCambiada(plantillas.MOTIVO_CAMBIO_PROPIO) });
    res.json({ ok: true });
  }));

  // Siempre 200 { ok: true }: no revela si el email existe. Todo el trabajo (consulta, token, mail) va en segundo
  // plano para que el tiempo de respuesta sea el mismo exista o no la cuenta.
  r.post('/recuperar', envolver(async (req, res) => {
    const p = recuperarSchema.safeParse(req.body);
    res.json({ ok: true });
    if (!p.success) return;
    const { email } = p.data;
    const claveEmail = `rec|${email}`;
    const claveIp = `rec-ip|${req.ip}`;
    const excedido = limiteRecEmail.bloqueado(claveEmail) || limiteRecIp.bloqueado(claveIp);
    if (excedido) return; // bloqueado: no se registra nada (memoria acotada y el bloqueo no se extiende)
    limiteRecEmail.registrarFallo(claveEmail); // cuenta pedidos, existan o no
    limiteRecIp.registrarFallo(claveIp);
    const { db, mailer, config } = req.app.locals;
    enSegundoPlano(async () => {
      const [filas] = await db.query('SELECT id, email FROM usuarios WHERE LOWER(email) = ? AND habilitado = 1', [email]);
      const u = filas[0];
      if (!u) return;
      const token = await crearToken(db, u.id, 'recuperacion');
      const link = `${String(config.appUrl).replace(/\/+$/, '')}/?token=${encodeURIComponent(token)}&tipo=recuperacion`;
      await mailer.enviar({ para: u.email, ...plantillas.recuperacion(link) });
    });
  }));

  // Fija la contraseña con un token (recuperación o invitación). No inicia sesión.
  r.post('/token', envolver(async (req, res) => {
    const { token, password } = validar(tokenSchema, req.body);
    const { db, mailer } = req.app.locals;
    const claveIp = `tok|${req.ip}`;
    if (limiteTokenIp.bloqueado(claveIp)) throw errorHttp(429, MSG_429);
    // Chequeo barato antes de bcrypt: un token inexistente/vencido/usado no debe costar un hash de costo 12.
    if (!(await tokenUsable(db, token))) {
      limiteTokenIp.registrarFallo(claveIp);
      throw errorHttp(400, MSG_ENLACE);
    }
    const hash = await bcrypt.hash(password, COSTO); // antes de abrir la transacción
    // Consumir el token y cambiar la clave en una sola transacción: si algo falla, el token no se gasta.
    const conn = await db.getConnection();
    let u;
    try {
      await conn.beginTransaction();
      const { usuarioId } = await consumirToken(conn, token);
      const [filas] = await conn.query('SELECT id, email, habilitado FROM usuarios WHERE id = ?', [usuarioId]);
      u = filas[0];
      if (!u || !u.habilitado) throw errorHttp(400, MSG_ENLACE);
      await conn.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, usuarioId]);
      await conn.commit();
    } catch (e) {
      await conn.rollback().catch(() => {});
      if (e?.status === 400) limiteTokenIp.registrarFallo(claveIp); // perdió la carrera por el token
      throw e;
    } finally {
      conn.release();
    }
    await cerrarSesionesDe(db, u.id);
    enviarSinEsperar(mailer, { para: u.email, ...plantillas.passwordCambiada(plantillas.MOTIVO_CAMBIO_PROPIO) });
    res.json({ ok: true });
  }));

  return r;
}
