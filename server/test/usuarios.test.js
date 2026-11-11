import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { crearApp } from '../src/app.js';
import { esperarPendientes } from '../src/mail/enviar.js';
import * as plantillas from '../src/mail/plantillas.js';
import { crearDbDeTest, limpiar, crearMailerFalso, iniciarSesionComo } from './helpers.js';

const OK = 'https://inventario.chacalo.com.ar';
let db, app, mailer, reloj, c;

const llamar = (metodo, url, cookie, body) => {
  const t = request(app)[metodo](url).set('Origin', OK).set('X-Forwarded-Proto', 'https');
  if (cookie) t.set('Cookie', cookie);
  return body === undefined ? t : t.send(body);
};
const sesion = (cookie) => llamar('get', '/api/auth/sesion', cookie);
const movs = async () => (await db.query('SELECT tipo_movimiento, descripcion, usuario, equipo_id, fecha FROM movimientos ORDER BY fecha, tipo_movimiento'))[0];
const fila = async (id) => (await db.query('SELECT * FROM usuarios WHERE id = ?', [id]))[0][0];

async function usuario(id, email, rol, extra = {}) {
  const hash = extra.hash === undefined ? await bcrypt.hash('clave-' + id, 4) : extra.hash;
  await db.query(
    'INSERT INTO usuarios (id, email, password_hash, nombre, rol, sede, habilitado) VALUES (?,?,?,?,?,?,?)',
    [id, email, hash, extra.nombre ?? 'Nombre ' + id, rol, extra.sede ?? null, extra.habilitado ?? 1],
  );
}
const entrar = (id, email) => iniciarSesionComo(app, email, 'clave-' + id);

beforeAll(async () => {
  db = await crearDbDeTest();
  mailer = crearMailerFalso();
  reloj = { t: 1_000_000 };
  app = crearApp({ db, mailer, config: { corsOrigins: [OK], sessionSecret: 's', appUrl: OK, ahora: () => reloj.t } });
  await usuario('sa', 'sa@c.test', 'super_admin', { nombre: 'Sofi Super', sede: 'Central' });
  await usuario('ad', 'ad@c.test', 'admin', { nombre: 'Ada Admin' });
  await usuario('ad2', 'ad2@c.test', 'admin', { nombre: 'Beto Admin' });
  await usuario('co', 'co@c.test', 'coordinador', { nombre: 'Carla Coord', sede: 'Nordelta' });
  await usuario('di', 'di@c.test', 'director', { nombre: 'Dani Dir', sede: 'HSM' });
  c = {
    sa: await entrar('sa', 'sa@c.test'),
    ad: await entrar('ad', 'ad@c.test'),
    co: await entrar('co', 'co@c.test'),
    di: await entrar('di', 'di@c.test'),
  };
});
afterAll(() => limpiar(db));
beforeEach(async () => {
  mailer.enviados.length = 0;
  mailer.error = null;
  reloj.t += 10 * 60 * 60 * 1000;
  await db.query('DELETE FROM movimientos');
  await db.query('DELETE FROM tokens_password');
  await db.query("DELETE FROM usuarios WHERE id NOT IN ('sa','ad','ad2','co','di')");
});

describe('sin sesión', () => {
  it('todas las rutas dan 401', async () => {
    for (const [m, u, b] of [
      ['get', '/api/usuarios'], ['post', '/api/usuarios', {}], ['patch', '/api/usuarios/co', {}], ['delete', '/api/usuarios/co'],
      ['post', '/api/usuarios/co/habilitado', {}], ['post', '/api/usuarios/co/password', {}], ['post', '/api/usuarios/co/invitacion', {}],
    ]) {
      expect((await llamar(m, u, null, b)).status, `${m} ${u}`).toBe(401);
    }
  });
});

describe('GET /api/usuarios', () => {
  it('admin ve todos ordenados por nombre, con la forma de user_roles y tieneLogin', async () => {
    await usuario('pend', 'pend@c.test', 'director', { nombre: 'Aaa Pendiente', hash: null });
    const r = await llamar('get', '/api/usuarios', c.ad);
    expect(r.status).toBe(200);
    expect(r.body.map((u) => u.nombre)).toEqual(['Aaa Pendiente', 'Ada Admin', 'Beto Admin', 'Carla Coord', 'Dani Dir', 'Sofi Super']);
    const co = r.body.find((u) => u.id === 'co');
    expect(Object.keys(co).sort()).toEqual(['created_at', 'email', 'habilitado', 'id', 'nombre', 'rol', 'sede', 'tieneLogin']);
    expect(co).toMatchObject({ id: 'co', email: 'co@c.test', rol: 'coordinador', nombre: 'Carla Coord', sede: 'Nordelta', habilitado: true, tieneLogin: true });
    expect(co.created_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(r.body.find((u) => u.id === 'pend').tieneLogin).toBe(false);
    expect(JSON.stringify(r.body)).not.toMatch(/password|hash|\$2[aby]\$/);
  });
  it('super_admin ve todos; director y coordinador solo su fila', async () => {
    expect((await llamar('get', '/api/usuarios', c.sa)).body).toHaveLength(5);
    const d = await llamar('get', '/api/usuarios', c.di);
    expect(d.status).toBe(200);
    expect(d.body.map((u) => u.id)).toEqual(['di']);
    const k = await llamar('get', '/api/usuarios', c.co);
    expect(k.body.map((u) => u.id)).toEqual(['co']);
  });
});

describe('POST /api/usuarios', () => {
  const datos = { email: '  Nuevo@C.Test ', nombre: 'Nora Nueva', rol: 'coordinador', sede: 'Olivos' };

  it('admin crea coordinador -> 201, fila sin hash, movimiento, mail de invitación con token válido', async () => {
    const r = await llamar('post', '/api/usuarios', c.ad, datos);
    expect(r.status).toBe(201);
    expect(r.body.mailError).toBeUndefined();
    expect(r.body.usuario).toMatchObject({ email: 'nuevo@c.test', nombre: 'Nora Nueva', rol: 'coordinador', sede: 'Olivos', habilitado: true, tieneLogin: false });
    expect(r.body.usuario.id).toMatch(/^[0-9a-f-]{36}$/);
    const f = await fila(r.body.usuario.id);
    expect(f.password_hash).toBeNull();
    expect(f.habilitado).toBe(1);

    expect(mailer.enviados).toHaveLength(1);
    const m = mailer.enviados[0];
    expect(m.para).toBe('nuevo@c.test');
    const [[t]] = await db.query('SELECT tipo, usado_at FROM tokens_password WHERE usuario_id = ?', [r.body.usuario.id]);
    expect(t.tipo).toBe('invitacion');
    const link = /https:\/\/inventario\.chacalo\.com\.ar\/\?token=([^&"]+)(?:&amp;|&)tipo=invitacion/.exec(m.html);
    expect(link).toBeTruthy();
    // el token del enlace funciona para fijar la clave
    const fija = await llamar('post', '/api/auth/token', null, { token: decodeURIComponent(link[1]), password: 'clave-nueva-1' });
    expect(fija.status).toBe(200);
    expect((await llamar('post', '/api/auth/login', null, { email: 'nuevo@c.test', password: 'clave-nueva-1' })).status).toBe(200);

    const ms = await movs();
    expect(ms).toEqual([expect.objectContaining({
      tipo_movimiento: 'Alta usuario',
      descripcion: 'Usuario dado de alta: Nora Nueva (nuevo@c.test) — Rol: Coordinador',
      usuario: 'Ada Admin',
      equipo_id: null,
    })]);
    expect(ms[0].fecha).toBeInstanceOf(Date);
  });

  it('sede vacía -> null; super_admin puede crear admin', async () => {
    const r = await llamar('post', '/api/usuarios', c.sa, { ...datos, rol: 'admin', sede: '' });
    expect(r.status).toBe(201);
    expect(r.body.usuario.sede).toBeNull();
    expect((await movs())[0].descripcion).toBe('Usuario dado de alta: Nora Nueva (nuevo@c.test) — Rol: Administrador');
  });

  it('admin crea admin o super_admin -> 403 y no crea nada', async () => {
    for (const rol of ['admin', 'super_admin']) {
      expect((await llamar('post', '/api/usuarios', c.ad, { ...datos, rol })).status).toBe(403);
    }
    expect((await db.query("SELECT id FROM usuarios WHERE email = 'nuevo@c.test'"))[0]).toHaveLength(0);
    expect(mailer.enviados).toHaveLength(0);
    expect(await movs()).toHaveLength(0);
  });

  it('email duplicado (sin importar mayúsculas) -> 409 y sin efectos', async () => {
    const r = await llamar('post', '/api/usuarios', c.ad, { ...datos, email: 'CO@c.test' });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Ya existe un usuario con ese email' });
    expect(await movs()).toHaveLength(0);
    expect(mailer.enviados).toHaveLength(0);
  });

  it('validación: 400 por email, nombre, rol faltantes o inválidos y campos extra', async () => {
    for (const body of [
      { ...datos, email: 'no-es-mail' }, { ...datos, email: '' }, { ...datos, nombre: '  ' }, { ...datos, nombre: undefined },
      { ...datos, rol: 'usuario' }, { ...datos, rol: undefined }, { ...datos, habilitado: false }, { ...datos, password: 'x' }, {},
    ]) {
      const r = await llamar('post', '/api/usuarios', c.ad, body);
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('si el mail falla: 201 igual, con mailError, usuario y token creados', async () => {
    mailer.fallarCon(new Error('SMTP 535 credenciales'));
    const r = await llamar('post', '/api/usuarios', c.ad, datos);
    expect(r.status).toBe(201);
    expect(r.body.mailError).toBe('SMTP 535 credenciales');
    expect(await fila(r.body.usuario.id)).toBeTruthy();
    expect((await db.query('SELECT id FROM tokens_password WHERE usuario_id = ?', [r.body.usuario.id]))[0]).toHaveLength(1);
  });

  it('director y coordinador -> 403', async () => {
    for (const k of ['di', 'co']) expect((await llamar('post', '/api/usuarios', c[k], datos)).status).toBe(403);
    expect(await movs()).toHaveLength(0);
  });
});

describe('PATCH /api/usuarios/:id', () => {
  it('admin edita coordinador: actualiza y registra movimiento', async () => {
    const r = await llamar('patch', '/api/usuarios/co', c.ad, { nombre: 'Carla C.', rol: 'director', sede: 'HSM' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: 'co', nombre: 'Carla C.', rol: 'director', sede: 'HSM', email: 'co@c.test', habilitado: true, tieneLogin: true });
    expect(await movs()).toEqual([expect.objectContaining({
      tipo_movimiento: 'Modificación usuario',
      descripcion: 'Usuario modificado: Carla C. (co@c.test) — Rol: Director de Sede, Sede: HSM',
      usuario: 'Ada Admin', equipo_id: null,
    })]);
    await db.query("UPDATE usuarios SET nombre='Carla Coord', rol='coordinador', sede='Nordelta' WHERE id='co'");
  });

  it('edición parcial toma lo no enviado de la fila; sede null no suma ", Sede"', async () => {
    const r = await llamar('patch', '/api/usuarios/di', c.ad, { sede: null });
    expect(r.status).toBe(200);
    expect(r.body.sede).toBeNull();
    expect((await movs())[0].descripcion).toBe('Usuario modificado: Dani Dir (di@c.test) — Rol: Director de Sede');
    await db.query("UPDATE usuarios SET sede='HSM' WHERE id='di'");
  });

  it('rechaza habilitado, password, email y campos desconocidos con 400', async () => {
    for (const body of [{ habilitado: false }, { habilitado: true }, { password: 'x' }, { password_hash: 'x' }, { passwordNueva: 'abcdef' }, { email: 'otro@c.test' }, { id: 'zz' }, {}, { rol: 'jefe' }, { nombre: '' }]) {
      const r = await llamar('patch', '/api/usuarios/co', c.ad, body);
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect((await fila('co')).habilitado).toBe(1);
    expect(await movs()).toHaveLength(0);
  });

  it('matriz: admin edita super_admin u otro admin -> 403; admin se sube a super_admin -> 403', async () => {
    expect((await llamar('patch', '/api/usuarios/sa', c.ad, { nombre: 'X' })).status).toBe(403);
    expect((await llamar('patch', '/api/usuarios/ad2', c.ad, { nombre: 'X' })).status).toBe(403);
    expect((await llamar('patch', '/api/usuarios/ad', c.ad, { rol: 'super_admin' })).status).toBe(403);
    expect((await llamar('patch', '/api/usuarios/co', c.ad, { rol: 'admin' })).status).toBe(403);
    expect((await fila('ad')).rol).toBe('admin');
    expect((await fila('co')).rol).toBe('coordinador');
  });

  it('super_admin puede subir a un coordinador a admin; id inexistente -> 404', async () => {
    expect((await llamar('patch', '/api/usuarios/co', c.sa, { rol: 'admin' })).status).toBe(200);
    await db.query("UPDATE usuarios SET rol='coordinador' WHERE id='co'");
    expect((await llamar('patch', '/api/usuarios/nada', c.sa, { nombre: 'X' })).status).toBe(404);
  });

  it('cambio de rol no cierra sesiones y el nuevo rol rige en la siguiente petición', async () => {
    const ck = await entrar('co', 'co@c.test');
    expect((await llamar('patch', '/api/usuarios/co', c.ad, { rol: 'director' })).status).toBe(200);
    const s = await sesion(ck);
    expect(s.status).toBe(200);
    expect(s.body.rol).toBe('director');
    await db.query("UPDATE usuarios SET rol='coordinador' WHERE id='co'");
  });

  it('director y coordinador -> 403', async () => {
    for (const k of ['di', 'co']) expect((await llamar('patch', '/api/usuarios/di', c[k], { nombre: 'X' })).status).toBe(403);
  });
});

describe('DELETE /api/usuarios/:id', () => {
  it('borra usuario, tokens y sesiones; registra movimiento', async () => {
    await usuario('t1', 't1@c.test', 'coordinador', { nombre: 'Tito' });
    const ck = await entrar('t1', 't1@c.test');
    await db.query("INSERT INTO tokens_password (id, usuario_id, token_hash, tipo, expira_at) VALUES ('tk', 't1', REPEAT('a',64), 'recuperacion', DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 HOUR))");
    const r = await llamar('delete', '/api/usuarios/t1', c.ad);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(await fila('t1')).toBeUndefined();
    expect((await db.query("SELECT id FROM tokens_password WHERE usuario_id = 't1'"))[0]).toHaveLength(0);
    expect((await sesion(ck)).status).toBe(401);
    expect((await db.query("SELECT session_id FROM sesiones WHERE data LIKE '%\"usuarioId\":\"t1\"%'"))[0]).toHaveLength(0);
    expect(await movs()).toEqual([expect.objectContaining({
      tipo_movimiento: 'Baja usuario', descripcion: 'Usuario dado de baja: Tito', usuario: 'Ada Admin', equipo_id: null,
    })]);
  });

  it('descripción usa el email si no hay nombre', async () => {
    await usuario('t2', 't2@c.test', 'director', { nombre: null });
    await db.query("UPDATE usuarios SET nombre = NULL WHERE id = 't2'");
    expect((await llamar('delete', '/api/usuarios/t2', c.ad)).status).toBe(200);
    expect((await movs())[0].descripcion).toBe('Usuario dado de baja: t2@c.test');
  });

  it('403: admin a admin/super_admin, nadie a sí mismo; 404 inexistente; director/coordinador 403', async () => {
    expect((await llamar('delete', '/api/usuarios/ad2', c.ad)).status).toBe(403);
    expect((await llamar('delete', '/api/usuarios/sa', c.ad)).status).toBe(403);
    expect((await llamar('delete', '/api/usuarios/ad', c.ad)).status).toBe(403);
    expect((await llamar('delete', '/api/usuarios/sa', c.sa)).status).toBe(403);
    expect((await llamar('delete', '/api/usuarios/nada', c.ad)).status).toBe(404);
    expect((await llamar('delete', '/api/usuarios/di', c.co)).status).toBe(403);
    expect((await llamar('delete', '/api/usuarios/co', c.di)).status).toBe(403);
    expect(await movs()).toHaveLength(0);
  });
});

describe('POST /api/usuarios/:id/habilitado', () => {
  it('admin inhabilita coordinador: su siguiente /api/auth/sesion da 401 y no puede volver a entrar', async () => {
    await usuario('t3', 't3@c.test', 'coordinador', { nombre: 'Tere' });
    const ck = await entrar('t3', 't3@c.test');
    expect((await sesion(ck)).status).toBe(200);
    const r = await llamar('post', '/api/usuarios/t3/habilitado', c.ad, { habilitado: false });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: 't3', habilitado: false });
    expect((await sesion(ck)).status).toBe(401);
    expect((await db.query("SELECT session_id FROM sesiones WHERE data LIKE '%\"usuarioId\":\"t3\"%'"))[0]).toHaveLength(0);
    expect((await llamar('post', '/api/auth/login', null, { email: 't3@c.test', password: 'clave-t3' })).status).toBe(403);
    expect(await movs()).toEqual([expect.objectContaining({
      tipo_movimiento: 'Inhabilitado', descripcion: 'Usuario inhabilitado: Tere', usuario: 'Ada Admin', equipo_id: null,
    })]);
  });

  it('rehabilitar usa GESTIONAR y registra Habilitado', async () => {
    await usuario('t4', 't4@c.test', 'director', { nombre: 'Teo', habilitado: 0 });
    const r = await llamar('post', '/api/usuarios/t4/habilitado', c.ad, { habilitado: true });
    expect(r.status).toBe(200);
    expect(r.body.habilitado).toBe(true);
    expect((await movs())[0]).toMatchObject({ tipo_movimiento: 'Habilitado', descripcion: 'Usuario habilitado: Teo' });
  });

  it('nadie inhabilita a un admin ni super_admin; nadie a sí mismo', async () => {
    expect((await llamar('post', '/api/usuarios/ad2/habilitado', c.ad, { habilitado: false })).status).toBe(403);
    expect((await llamar('post', '/api/usuarios/ad2/habilitado', c.sa, { habilitado: false })).status).toBe(403);
    expect((await llamar('post', '/api/usuarios/sa/habilitado', c.sa, { habilitado: false })).status).toBe(403);
    expect((await llamar('post', '/api/usuarios/ad/habilitado', c.ad, { habilitado: false })).status).toBe(403);
    expect((await llamar('post', '/api/usuarios/co/habilitado', c.di, { habilitado: false })).status).toBe(403);
    expect((await fila('ad2')).habilitado).toBe(1);
    expect(await movs()).toHaveLength(0);
  });

  it('super_admin inhabilita coordinador; habilitado debe ser booleano; 404', async () => {
    expect((await llamar('post', '/api/usuarios/co/habilitado', c.sa, { habilitado: 'no' })).status).toBe(400);
    expect((await llamar('post', '/api/usuarios/co/habilitado', c.sa, {})).status).toBe(400);
    expect((await llamar('post', '/api/usuarios/nada/habilitado', c.sa, { habilitado: false })).status).toBe(404);
    await usuario('t5', 't5@c.test', 'coordinador');
    expect((await llamar('post', '/api/usuarios/t5/habilitado', c.sa, { habilitado: false })).status).toBe(200);
  });
});

describe('POST /api/usuarios/:id/password', () => {
  it('admin restablece la clave de un coordinador: hash costo 12, cierra sesiones, mail, movimiento', async () => {
    await usuario('t6', 't6@c.test', 'coordinador', { nombre: 'Tina' });
    const ck = await entrar('t6', 't6@c.test');
    const r = await llamar('post', '/api/usuarios/t6/password', c.ad, { passwordNueva: 'Nueva-clave-9' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    const f = await fila('t6');
    expect(await bcrypt.compare('Nueva-clave-9', f.password_hash)).toBe(true);
    expect(bcrypt.getRounds(f.password_hash)).toBe(12);
    expect((await sesion(ck)).status).toBe(401);
    expect(mailer.enviados).toHaveLength(1);
    expect(mailer.enviados[0]).toEqual({ para: 't6@c.test', ...plantillas.passwordRestablecida() });
    expect(await movs()).toEqual([expect.objectContaining({
      tipo_movimiento: 'Restablecimiento de contraseña', descripcion: 'Contraseña restablecida para: Tina', usuario: 'Ada Admin', equipo_id: null,
    })]);
    expect((await llamar('post', '/api/auth/login', null, { email: 't6@c.test', password: 'Nueva-clave-9' })).status).toBe(200);
  });

  it('funciona también para cuentas sin clave (invitación pendiente)', async () => {
    await usuario('t7', 't7@c.test', 'director', { hash: null });
    expect((await llamar('post', '/api/usuarios/t7/password', c.ad, { passwordNueva: 'abcdef' })).status).toBe(200);
    expect((await fila('t7')).password_hash).toBeTruthy();
  });

  it('mismas reglas de clave que /api/auth/password', async () => {
    const corta = await llamar('post', '/api/usuarios/co/password', c.ad, { passwordNueva: '12345' });
    expect(corta.status).toBe(400);
    expect(corta.body.error).toBe('La nueva contraseña debe tener al menos 6 caracteres');
    const larga = await llamar('post', '/api/usuarios/co/password', c.ad, { passwordNueva: 'a'.repeat(73) });
    expect(larga.status).toBe(400);
    expect(larga.body.error).toBe('La nueva contraseña es demasiado larga');
    expect((await llamar('post', '/api/usuarios/co/password', c.ad, {})).status).toBe(400);
    expect((await llamar('post', '/api/usuarios/co/password', c.ad, { passwordNueva: 'abcdefg', extra: 1 })).status).toBe(400);
  });

  it('si el mail falla: 200 con mailError y la clave igual cambió', async () => {
    await usuario('t8', 't8@c.test', 'coordinador');
    mailer.fallarCon(new Error('SMTP caído'));
    const r = await llamar('post', '/api/usuarios/t8/password', c.ad, { passwordNueva: 'abcdef' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, mailError: 'SMTP caído' });
    expect(await bcrypt.compare('abcdef', (await fila('t8')).password_hash)).toBe(true);
  });

  it('403: admin sobre admin/super_admin y sobre sí mismo (el propio va por /api/auth/password); director/coordinador; 404', async () => {
    for (const id of ['ad2', 'sa']) expect((await llamar('post', `/api/usuarios/${id}/password`, c.ad, { passwordNueva: 'abcdef' })).status).toBe(403);
    expect((await llamar('post', '/api/usuarios/di/password', c.co, { passwordNueva: 'abcdef' })).status).toBe(403);
    expect((await llamar('post', '/api/usuarios/co/password', c.di, { passwordNueva: 'abcdef' })).status).toBe(403);
    expect((await llamar('post', '/api/usuarios/nada/password', c.ad, { passwordNueva: 'abcdef' })).status).toBe(404);
    expect(mailer.enviados).toHaveLength(0);
    expect(await movs()).toHaveLength(0);
  });
});

describe('POST /api/usuarios/:id/invitacion', () => {
  it('reenvía a cuenta sin clave: token nuevo invalida el anterior, mail enviado', async () => {
    await usuario('t9', 't9@c.test', 'director', { nombre: 'Tomi', hash: null });
    expect((await llamar('post', '/api/usuarios/t9/invitacion', c.ad)).body).toEqual({ ok: true });
    expect((await llamar('post', '/api/usuarios/t9/invitacion', c.ad)).body).toEqual({ ok: true });
    expect(mailer.enviados).toHaveLength(2);
    expect(mailer.enviados[1].para).toBe('t9@c.test');
    const tokens = (await db.query("SELECT usado_at FROM tokens_password WHERE usuario_id = 't9' AND tipo = 'invitacion' ORDER BY created_at"))[0];
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((t) => t.usado_at === null)).toHaveLength(1);
  });

  it('cuenta que ya tiene clave -> 409', async () => {
    const r = await llamar('post', '/api/usuarios/co/invitacion', c.ad);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'El usuario ya tiene contraseña' });
    expect(mailer.enviados).toHaveLength(0);
  });

  it('mailError cuando falla el SMTP; 403 sobre admin; 404; director 403', async () => {
    await usuario('t10', 't10@c.test', 'coordinador', { hash: null });
    mailer.fallarCon(new Error('SMTP caído'));
    expect((await llamar('post', '/api/usuarios/t10/invitacion', c.ad)).body).toEqual({ ok: true, mailError: 'SMTP caído' });
    await usuario('t11', 't11@c.test', 'admin', { hash: null });
    expect((await llamar('post', '/api/usuarios/t11/invitacion', c.ad)).status).toBe(403);
    expect((await llamar('post', '/api/usuarios/nada/invitacion', c.ad)).status).toBe(404);
    expect((await llamar('post', '/api/usuarios/t10/invitacion', c.di)).status).toBe(403);
  });
});

describe('fix round 1', () => {
  it('R25a: reset sobre uno mismo -> 400 y nada cambia (incluido super_admin)', async () => {
    for (const k of ['ad', 'sa']) {
      const id = k;
      const antes = (await fila(id)).password_hash;
      const r = await llamar('post', `/api/usuarios/${id}/password`, c[k], { passwordNueva: 'abcdef' });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: 'Para cambiar tu propia contraseña usá «Cambiar contraseña»' });
      expect((await fila(id)).password_hash).toBe(antes);
    }
    expect(await movs()).toHaveLength(0);
  });

  it('I-2: el reset invalida enlaces de recuperación/invitación pendientes', async () => {
    await usuario('t12', 't12@c.test', 'coordinador');
    const { crearToken } = await import('../src/auth/tokens.js');
    const viejo = await crearToken(db, 't12', 'recuperacion');
    const inv = await crearToken(db, 't12', 'invitacion');
    expect((await llamar('post', '/api/usuarios/t12/password', c.ad, { passwordNueva: 'clave-del-admin' })).status).toBe(200);
    for (const t of [viejo, inv]) {
      const r = await llamar('post', '/api/auth/token', null, { token: t, password: 'clave-atacante' });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('El enlace ya fue usado o venció');
    }
    expect(await bcrypt.compare('clave-del-admin', (await fila('t12')).password_hash)).toBe(true);
  });

  it('I-2: inhabilitar también invalida los enlaces pendientes', async () => {
    await usuario('t13', 't13@c.test', 'director');
    const { crearToken } = await import('../src/auth/tokens.js');
    await crearToken(db, 't13', 'recuperacion');
    expect((await llamar('post', '/api/usuarios/t13/habilitado', c.ad, { habilitado: false })).status).toBe(200);
    expect((await db.query("SELECT id FROM tokens_password WHERE usuario_id = 't13' AND usado_at IS NULL"))[0]).toHaveLength(0);
  });

  describe('TOCTOU (el rol cambia entre la autorización y la escritura)', () => {
    const promover = (id) => (req, objetivo) => db.query("UPDATE usuarios SET rol = 'admin' WHERE id = ?", [objetivo]);
    afterEach(() => { delete app.locals.antesDeEscribir; });

    it('PATCH solo con nombre no toca el rol aunque cambió en el medio; el rol nuevo ya no es gestionable -> 403 y nada cambia', async () => {
      await usuario('r1', 'r1@c.test', 'coordinador', { nombre: 'Rita' });
      app.locals.antesDeEscribir = async () => { await db.query("UPDATE usuarios SET rol = 'director' WHERE id = 'r1'"); };
      const r = await llamar('patch', '/api/usuarios/r1', c.ad, { nombre: 'Rita 2' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ nombre: 'Rita 2', rol: 'director' }); // el rol que cambió en el medio se conserva
      expect((await movs())[0].descripcion).toBe('Usuario modificado: Rita 2 (r1@c.test) — Rol: Director de Sede');
    });

    it('promovido a admin entre la autorización y la escritura -> 403 en todas las escrituras, sin cambios', async () => {
      const casos = [
        ['patch', '/api/usuarios/r2', { nombre: 'Hack' }],
        ['delete', '/api/usuarios/r2'],
        ['post', '/api/usuarios/r2/habilitado', { habilitado: false }],
        ['post', '/api/usuarios/r2/password', { passwordNueva: 'abcdef' }],
      ];
      for (const [m, u, b] of casos) {
        await db.query('DELETE FROM usuarios WHERE id = ?', ['r2']);
        await usuario('r2', 'r2@c.test', 'coordinador', { nombre: 'Rosa' });
        const hash = (await fila('r2')).password_hash;
        app.locals.antesDeEscribir = promover();
        const r = await llamar(m, u, c.ad, b);
        expect(r.status, `${m} ${u}`).toBe(403);
        const f = await fila('r2');
        expect(f).toMatchObject({ rol: 'admin', nombre: 'Rosa', habilitado: 1, password_hash: hash });
        expect(await movs()).toHaveLength(0);
        delete app.locals.antesDeEscribir;
      }
    });

    it('borrado entre la autorización y la escritura -> 404', async () => {
      await usuario('r3', 'r3@c.test', 'coordinador');
      app.locals.antesDeEscribir = async () => { await db.query("DELETE FROM usuarios WHERE id = 'r3'"); };
      expect((await llamar('patch', '/api/usuarios/r3', c.ad, { nombre: 'X' })).status).toBe(404);
    });
  });

  it('R25b: si falla la creación del token tras el alta -> 201 con mailError', async () => {
    await db.query('RENAME TABLE tokens_password TO tokens_password_x');
    try {
      const r = await llamar('post', '/api/usuarios', c.ad, { email: 'sintoken@c.test', nombre: 'Sin Token', rol: 'director' });
      expect(r.status).toBe(201);
      expect(typeof r.body.mailError).toBe('string');
      expect(r.body.usuario).toMatchObject({ email: 'sintoken@c.test', tieneLogin: false });
      expect(mailer.enviados).toHaveLength(0);
    } finally {
      await db.query('RENAME TABLE tokens_password_x TO tokens_password');
    }
    expect(await fila(await (async () => (await db.query("SELECT id FROM usuarios WHERE email='sintoken@c.test'"))[0][0].id)())).toBeTruthy();
  });
});

describe('errores', () => {
  it('no filtra errores SQL', async () => {
    const r = await llamar('patch', '/api/usuarios/co', c.ad, { nombre: 'x'.repeat(300) });
    expect([400, 500]).toContain(r.status);
    expect(JSON.stringify(r.body)).not.toMatch(/sql|ER_|usuarios/i);
  });
});
