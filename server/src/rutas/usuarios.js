import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { errorHttp } from '../errores.js';
import { requiereSesion, cerrarSesionesDe } from '../auth/sesion.js';
import { ACCIONES, exige, alcanceUsuarios } from '../auth/permisos.js';
import { crearToken } from '../auth/tokens.js';
import * as plantillas from '../mail/plantillas.js';
import { ROLES, ROLE_LABELS } from '../util/roles.js';

const COSTO = 12;
const COLUMNAS = 'id, email, nombre, rol, sede, habilitado, created_at, (password_hash IS NOT NULL) AS tieneLogin';

const publico = (u) => ({
  id: u.id, email: u.email, rol: u.rol, nombre: u.nombre, sede: u.sede,
  habilitado: !!u.habilitado, created_at: u.created_at, tieneLogin: !!u.tieneLogin,
});

const rol = z.enum(ROLES);
const nombre = z.string().trim().min(1).max(255);
const sede = z.string().trim().max(255).nullish().transform((v) => v || null);
// Mismas reglas que /api/auth/password (límite de bcrypt: 72 bytes).
const claveNueva = z.string()
  .min(6, 'La nueva contraseña debe tener al menos 6 caracteres')
  .refine((p) => Buffer.byteLength(p) <= 72, 'La nueva contraseña es demasiado larga');

const crearSchema = z.strictObject({ email: z.string().trim().toLowerCase().max(255).pipe(z.email()), nombre, rol, sede });
// R23: ni habilitado ni claves por acá; el email no se edita (el modal actual lo deshabilita).
const editarSchema = z.strictObject({ nombre: nombre.optional(), rol: rol.optional(), sede: sede.optional() })
  .refine((o) => Object.keys(o).length > 0);
const habilitadoSchema = z.strictObject({ habilitado: z.boolean() });
const passwordSchema = z.strictObject({ passwordNueva: claveNueva });

const validar = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) {
    const m = r.error.issues[0]?.message;
    return next(errorHttp(400, m?.startsWith('La ') ? m : 'Datos inválidos'));
  }
  req.datos = r.data;
  next();
};
const envolver = (fn) => (req, res, next) => fn(req, res).catch(next);
const actor = (req) => req.usuario.nombre || 'Sistema';

async function enTransaccion(db, fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

const movimiento = (conn, tipo, descripcion, usuario) => conn.query(
  'INSERT INTO movimientos (id, equipo_id, tipo_movimiento, descripcion, usuario) VALUES (?, NULL, ?, ?, ?)',
  [randomUUID(), tipo, descripcion, usuario],
);

const leer = async (db, id) => (await db.query(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`, [id]))[0][0];

// Carga el objetivo (404 si no existe) y lo deja en req.objetivo; el recurso para permisos es { id, rol (+ rolNuevo) }.
const cargarObjetivo = (req) => (async () => {
  const o = await leer(req.app.locals.db, req.params.id);
  if (!o) return null;
  req.objetivo = o;
  const recurso = { id: o.id, rol: o.rol };
  if (req.datos?.rol) recurso.rolNuevo = req.datos.rol;
  return recurso;
})();

async function mandarMail(mailer, msg) {
  try {
    if (!mailer) throw new Error('Mail no configurado');
    await mailer.enviar(msg);
    return undefined;
  } catch (e) {
    return String(e?.message || 'No se pudo enviar el mail');
  }
}

async function enviarInvitacion(req, u) {
  const { db, mailer, config } = req.app.locals;
  const token = await crearToken(db, u.id, 'invitacion');
  const link = `${String(config.appUrl).replace(/\/+$/, '')}/?token=${encodeURIComponent(token)}&tipo=invitacion`;
  return mandarMail(mailer, { para: u.email, ...plantillas.invitacion(link, u.nombre) });
}

const conMailError = (base, mailError) => (mailError === undefined ? base : { ...base, mailError });

export function crearRutasUsuarios() {
  const r = Router();
  r.use(requiereSesion);

  r.get('/', envolver(async (req, res) => {
    const { db } = req.app.locals;
    const alcance = alcanceUsuarios(req.usuario);
    if (alcance === 'ninguno') throw errorHttp(403, 'No tenés permiso para realizar esta acción');
    const [filas] = alcance === 'todos'
      ? await db.query(`SELECT ${COLUMNAS} FROM usuarios ORDER BY nombre ASC`)
      : await db.query(`SELECT ${COLUMNAS} FROM usuarios WHERE id = ?`, [req.usuario.id]);
    res.json(filas.map(publico));
  }));

  r.post('/', validar(crearSchema), exige(ACCIONES.USUARIOS_GESTIONAR, async (req) => ({ rol: req.datos.rol })), envolver(async (req, res) => {
    const { db } = req.app.locals;
    const d = req.datos;
    const id = randomUUID();
    try {
      await enTransaccion(db, async (conn) => {
        await conn.query(
          'INSERT INTO usuarios (id, email, password_hash, nombre, rol, sede, habilitado) VALUES (?, ?, NULL, ?, ?, ?, 1)',
          [id, d.email, d.nombre, d.rol, d.sede],
        );
        await movimiento(conn, 'Alta usuario', `Usuario dado de alta: ${d.nombre} (${d.email}) — Rol: ${ROLE_LABELS[d.rol]}`, actor(req));
      });
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') throw errorHttp(409, 'Ya existe un usuario con ese email');
      throw e;
    }
    const u = await leer(db, id);
    const mailError = await enviarInvitacion(req, u);
    res.status(201).json(conMailError({ usuario: publico(u) }, mailError));
  }));

  r.patch('/:id', validar(editarSchema), exige(ACCIONES.USUARIOS_GESTIONAR, cargarObjetivo), envolver(async (req, res) => {
    const { db } = req.app.locals;
    const o = req.objetivo;
    const d = req.datos;
    const nuevo = {
      nombre: d.nombre ?? o.nombre,
      rol: d.rol ?? o.rol,
      sede: d.sede !== undefined ? d.sede : o.sede,
    };
    await enTransaccion(db, async (conn) => {
      await conn.query('UPDATE usuarios SET nombre = ?, rol = ?, sede = ? WHERE id = ?', [nuevo.nombre, nuevo.rol, nuevo.sede, o.id]);
      await movimiento(
        conn, 'Modificación usuario',
        `Usuario modificado: ${nuevo.nombre} (${o.email}) — Rol: ${ROLE_LABELS[nuevo.rol]}${nuevo.sede ? `, Sede: ${nuevo.sede}` : ''}`,
        actor(req),
      );
    });
    res.json(publico(await leer(db, o.id)));
  }));

  r.delete('/:id', exige(ACCIONES.USUARIOS_BORRAR, cargarObjetivo), envolver(async (req, res) => {
    const { db } = req.app.locals;
    const o = req.objetivo;
    await enTransaccion(db, async (conn) => {
      await conn.query('DELETE FROM usuarios WHERE id = ?', [o.id]); // tokens_password: ON DELETE CASCADE
      await movimiento(conn, 'Baja usuario', `Usuario dado de baja: ${o.nombre || o.email}`, actor(req));
    });
    await cerrarSesionesDe(db, o.id);
    res.json({ ok: true });
  }));

  // Inhabilitar -> USUARIOS_INHABILITAR; rehabilitar -> USUARIOS_GESTIONAR (ver matriz de permisos).
  const permisoHabilitado = (req, res, next) =>
    exige(req.datos.habilitado ? ACCIONES.USUARIOS_GESTIONAR : ACCIONES.USUARIOS_INHABILITAR, cargarObjetivo)(req, res, next);
  r.post('/:id/habilitado', validar(habilitadoSchema), permisoHabilitado, envolver(async (req, res) => {
    const { db } = req.app.locals;
    const o = req.objetivo;
    const { habilitado } = req.datos;
    await enTransaccion(db, async (conn) => {
      await conn.query('UPDATE usuarios SET habilitado = ? WHERE id = ?', [habilitado ? 1 : 0, o.id]);
      await movimiento(
        conn, habilitado ? 'Habilitado' : 'Inhabilitado',
        `Usuario ${habilitado ? 'habilitado' : 'inhabilitado'}: ${o.nombre || o.email}`, actor(req),
      );
    });
    if (!habilitado) await cerrarSesionesDe(db, o.id);
    res.json(publico(await leer(db, o.id)));
  }));

  r.post('/:id/password', validar(passwordSchema), exige(ACCIONES.USUARIOS_GESTIONAR, cargarObjetivo), envolver(async (req, res) => {
    const { db, mailer } = req.app.locals;
    const o = req.objetivo;
    const hash = await bcrypt.hash(req.datos.passwordNueva, COSTO); // fuera de la transacción
    await enTransaccion(db, async (conn) => {
      await conn.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, o.id]);
      await movimiento(conn, 'Restablecimiento de contraseña', `Contraseña restablecida para: ${o.nombre || o.email}`, actor(req));
    });
    // Si el objetivo es el propio actor (super_admin), se conserva la sesión actual.
    await cerrarSesionesDe(db, o.id, o.id === req.usuario.id ? req.sessionID : null);
    const mailError = await mandarMail(mailer, { para: o.email, ...plantillas.passwordRestablecida() });
    res.json(conMailError({ ok: true }, mailError));
  }));

  r.post('/:id/invitacion', exige(ACCIONES.USUARIOS_GESTIONAR, cargarObjetivo), envolver(async (req, res) => {
    const { db } = req.app.locals;
    const [[f]] = await db.query('SELECT password_hash FROM usuarios WHERE id = ?', [req.objetivo.id]);
    if (f?.password_hash) throw errorHttp(409, 'El usuario ya tiene contraseña');
    const mailError = await enviarInvitacion(req, req.objetivo);
    res.json(conMailError({ ok: true }, mailError));
  }));

  return r;
}
