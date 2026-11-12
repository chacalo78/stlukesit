import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { leerConfig } from '../src/config.js';
import { crearApp } from '../src/app.js';
import { crearToken, consumirToken } from '../src/auth/tokens.js';
import { esperarPendientes, enviarSinEsperar } from '../src/mail/enviar.js';
import * as plantillas from '../src/mail/plantillas.js';
import { crearDbDeTest, limpiar, crearMailerFalso, iniciarSesionComo } from './helpers.js';

const OK = 'https://inventario.chacalo.com.ar';
const MSG_USADO = 'El enlace ya fue usado o venció';
let db, app, mailer, reloj;

const post = (url, body) => request(app).post(url).set('Origin', OK).set('X-Forwarded-Proto', 'https').send(body);
const recuperar = async (email) => { const r = await post('/api/auth/recuperar', { email }); await esperarPendientes(); return r; };
const sha = (s) => createHash('sha256').update(s).digest('hex');
const tokenDeLink = (html) => decodeURIComponent(/\?token=([^&"]+)&amp;tipo=|\?token=([^&"]+)&tipo=/.exec(html).slice(1).find(Boolean));
const nuevoToken = async (id, tipo) => crearToken(db, id, tipo);

async function usuario(id, email, hash, habilitado = 1) {
  await db.query(
    'INSERT INTO usuarios (id, email, password_hash, nombre, rol, sede, habilitado) VALUES (?,?,?,?,?,?,?)',
    [id, email, hash, 'Nombre ' + id, 'admin', 'Sede 1', habilitado],
  );
}

beforeAll(async () => {
  db = await crearDbDeTest();
  mailer = crearMailerFalso();
  reloj = { t: 1_000_000 };
  app = crearApp({ db, mailer, config: { corsOrigins: [OK], sessionSecret: 's', appUrl: OK, ahora: () => reloj.t } });
  await usuario('u-1', 'ana@colegio.test', await bcrypt.hash('clave-ana', 4));
  await usuario('u-2', 'dis@colegio.test', await bcrypt.hash('x', 4), 0);
  await usuario('u-3', 'sinclave@colegio.test', null);
});
afterAll(() => limpiar(db));
beforeEach(async () => {
  mailer.enviados.length = 0;
  mailer.error = null;
  reloj.t += 10 * 60 * 60 * 1000; // ventana de rate limit vacía
  await db.query('DELETE FROM tokens_password');
});

describe('tokens', () => {
  it('crea token >=43 chars base64url y guarda solo sha256', async () => {
    const t = await nuevoToken('u-1', 'recuperacion');
    expect(t).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    const [f] = await db.query('SELECT * FROM tokens_password');
    expect(f).toHaveLength(1);
    expect(f[0].token_hash).toBe(sha(t));
    expect(JSON.stringify(f)).not.toContain(t);
  });
  it('recuperación vence a la hora, invitación a las 72 h', async () => {
    await nuevoToken('u-1', 'recuperacion');
    const [[r]] = await db.query("SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(3), expira_at) m FROM tokens_password WHERE tipo='recuperacion'");
    expect(r.m).toBeGreaterThanOrEqual(58); expect(r.m).toBeLessThanOrEqual(60);
    await nuevoToken('u-1', 'invitacion');
    const [[i]] = await db.query("SELECT TIMESTAMPDIFF(HOUR, UTC_TIMESTAMP(3), expira_at) h FROM tokens_password WHERE tipo='invitacion'");
    expect([71, 72]).toContain(i.h); // 72 h menos unos ms: según el instante del SELECT da 71 o 72
  });
  it('consumir devuelve usuarioId y tipo, y es de un solo uso', async () => {
    const t = await nuevoToken('u-1', 'invitacion');
    expect(await consumirToken(db, t)).toEqual({ usuarioId: 'u-1', tipo: 'invitacion' });
    await expect(consumirToken(db, t)).rejects.toMatchObject({ status: 400, message: MSG_USADO });
  });
  it('consumo concurrente: solo uno gana', async () => {
    const t = await nuevoToken('u-1', 'recuperacion');
    const r = await Promise.allSettled([consumirToken(db, t), consumirToken(db, t), consumirToken(db, t)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  });
  it('token inexistente -> 400', async () => {
    await expect(consumirToken(db, 'no-existe')).rejects.toMatchObject({ status: 400, message: MSG_USADO });
  });
  it('un token nuevo del mismo tipo invalida el anterior; el de otro tipo no', async () => {
    const a = await nuevoToken('u-1', 'recuperacion');
    const inv = await nuevoToken('u-1', 'invitacion');
    const b = await nuevoToken('u-1', 'recuperacion');
    await expect(consumirToken(db, a)).rejects.toMatchObject({ status: 400 });
    expect((await consumirToken(db, b)).tipo).toBe('recuperacion');
    expect((await consumirToken(db, inv)).tipo).toBe('invitacion');
  });
  it('invitación válida a las 71 h e inválida a las 73 h', async () => {
    const a = await nuevoToken('u-1', 'invitacion');
    await db.query('UPDATE tokens_password SET expira_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE token_hash = ?', [sha(a)]); // creado hace 71 h
    expect((await consumirToken(db, a)).tipo).toBe('invitacion');
    const b = await nuevoToken('u-1', 'invitacion');
    await db.query('UPDATE tokens_password SET expira_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE token_hash = ?', [sha(b)]); // creado hace 73 h
    await expect(consumirToken(db, b)).rejects.toMatchObject({ status: 400, message: MSG_USADO });
  });
  it('recuperación vencida (61 min) -> 400', async () => {
    const t = await nuevoToken('u-1', 'recuperacion');
    await db.query('UPDATE tokens_password SET expira_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE)');
    await expect(consumirToken(db, t)).rejects.toMatchObject({ status: 400, message: MSG_USADO });
  });
});

describe('POST /api/auth/recuperar', () => {
  it('email existente -> 200 y 1 mail con link con el token', async () => {
    const r = await recuperar('  ANA@Colegio.test ');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(mailer.enviados).toHaveLength(1);
    const m = mailer.enviados[0];
    expect(m.para).toBe('ana@colegio.test');
    expect(m.html).toContain(`${OK}/?token=`);
    expect(m.html).toContain('tipo=recuperacion');
    const t = tokenDeLink(m.html);
    expect((await consumirToken(db, t)).usuarioId).toBe('u-1');
  });
  it('email inexistente -> 200 y 0 mails', async () => {
    const r = await recuperar('nadie@colegio.test');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(mailer.enviados).toHaveLength(0);
  });
  it('usuario inhabilitado -> 200, sin mail ni token', async () => {
    const r = await recuperar('dis@colegio.test');
    expect(r.body).toEqual({ ok: true });
    expect(mailer.enviados).toHaveLength(0);
    const [f] = await db.query('SELECT 1 FROM tokens_password');
    expect(f).toHaveLength(0);
  });
  it('usuario sin contraseña (nunca activado) recibe el mail', async () => {
    await recuperar('sinclave@colegio.test');
    expect(mailer.enviados).toHaveLength(1);
  });
  it('un pedido nuevo invalida el token anterior', async () => {
    await recuperar('ana@colegio.test');
    await recuperar('ana@colegio.test');
    const [t1, t2] = mailer.enviados.map((m) => tokenDeLink(m.html));
    await expect(consumirToken(db, t1)).rejects.toMatchObject({ status: 400 });
    expect((await consumirToken(db, t2)).usuarioId).toBe('u-1');
  });
  it('la respuesta no espera al mail (SMTP lento o caído no cambia la respuesta)', async () => {
    mailer.fallarCon(new Error('boom secreto'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await recuperar('ana@colegio.test');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('boom secreto'); // log genérico
    warn.mockRestore();
  });
  it('R20: máx 3 mails por email por hora; el cuarto sigue dando 200 sin mail; vuelve tras la hora', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await recuperar('ana@colegio.test');
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: true });
    }
    expect(mailer.enviados).toHaveLength(3);
    reloj.t += 61 * 60 * 1000;
    await recuperar('ana@colegio.test');
    expect(mailer.enviados).toHaveLength(4);
  });
  it('R20: máx 20 pedidos por IP por hora', async () => {
    for (let i = 0; i < 20; i++) await recuperar(`x${i}@colegio.test`);
    await recuperar('ana@colegio.test'); // pedido 21 desde la misma IP
    expect(mailer.enviados).toHaveLength(0);
  });
  it('email vacío o inválido -> 200 sin mail (no revela nada)', async () => {
    const r = await recuperar('');
    expect(r.status).toBe(200);
    expect(mailer.enviados).toHaveLength(0);
  });
});

describe('POST /api/auth/token', () => {
  it('token válido cambia la contraseña, manda "cambiada" y no inicia sesión', async () => {
    const t = await nuevoToken('u-1', 'recuperacion');
    const r = await post('/api/auth/token', { token: t, password: 'nueva-clave-1' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(r.headers['set-cookie']).toBeUndefined();
    await esperarPendientes();
    expect(mailer.enviados).toHaveLength(1);
    expect(mailer.enviados[0].para).toBe('ana@colegio.test');
    expect(mailer.enviados[0].asunto).toBe('Tu contraseña fue actualizada');
    const [[u]] = await db.query('SELECT password_hash FROM usuarios WHERE id = ?', ['u-1']);
    expect(await bcrypt.compare('nueva-clave-1', u.password_hash)).toBe(true);
    expect(bcrypt.getRounds(u.password_hash)).toBe(12);
    await db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash('clave-ana', 4), 'u-1']);
  });
  it('token de invitación activa a un usuario sin contraseña', async () => {
    const t = await nuevoToken('u-3', 'invitacion');
    expect((await post('/api/auth/token', { token: t, password: 'mi-clave-nueva' })).status).toBe(200);
    expect((await post('/api/auth/login', { email: 'sinclave@colegio.test', password: 'mi-clave-nueva' })).status).toBe(200);
    await db.query('UPDATE usuarios SET password_hash = NULL WHERE id = ?', ['u-3']);
  });
  it('reusar el token -> 400', async () => {
    const t = await nuevoToken('u-1', 'recuperacion');
    await post('/api/auth/token', { token: t, password: 'otra-clave-1' });
    const r = await post('/api/auth/token', { token: t, password: 'otra-clave-2' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: MSG_USADO });
    await db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash('clave-ana', 4), 'u-1']);
  });
  it('token vencido -> 400', async () => {
    const t = await nuevoToken('u-1', 'invitacion');
    await db.query('UPDATE tokens_password SET expira_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)');
    const r = await post('/api/auth/token', { token: t, password: 'otra-clave-1' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: MSG_USADO });
  });
  it('contraseña corta o larga -> 400 con el mensaje de /password y el token NO se consume', async () => {
    const t = await nuevoToken('u-1', 'recuperacion');
    const corta = await post('/api/auth/token', { token: t, password: '123' });
    expect(corta.status).toBe(400);
    expect(corta.body.error).toBe('La nueva contraseña debe tener al menos 6 caracteres');
    const larga = await post('/api/auth/token', { token: t, password: 'a'.repeat(73) });
    expect(larga.body.error).toBe('La nueva contraseña es demasiado larga');
    expect((await consumirToken(db, t)).usuarioId).toBe('u-1');
  });
  it('usuario inhabilitado -> 400 mismo mensaje y sin cambio', async () => {
    const t = await nuevoToken('u-2', 'recuperacion');
    const r = await post('/api/auth/token', { token: t, password: 'nueva-clave-1' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: MSG_USADO });
    const [[u]] = await db.query('SELECT password_hash FROM usuarios WHERE id = ?', ['u-2']);
    expect(await bcrypt.compare('x', u.password_hash)).toBe(true);
  });
  it('token inexistente o cuerpo inválido -> 400', async () => {
    expect((await post('/api/auth/token', { token: 'zzz', password: 'nueva-clave-1' })).body).toEqual({ error: MSG_USADO });
    expect((await post('/api/auth/token', {})).status).toBe(400);
  });
  it('si el mail falla, la contraseña igual cambió y responde 200', async () => {
    mailer.fallarCon();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await nuevoToken('u-1', 'recuperacion');
    const r = await post('/api/auth/token', { token: t, password: 'nueva-clave-9' });
    await esperarPendientes();
    expect(r.status).toBe(200);
    warn.mockRestore();
    await db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash('clave-ana', 4), 'u-1']);
  });
});

describe('POST /api/auth/token: antes de bcrypt y límite por IP (m-3)', () => {
  it('token inexistente, vencido o usado no llama a bcrypt.hash', async () => {
    const spy = vi.spyOn(bcrypt, 'hash');
    const usado = await nuevoToken('u-1', 'recuperacion');
    await db.query('UPDATE tokens_password SET usado_at = UTC_TIMESTAMP(3)');
    const vencido = await nuevoToken('u-1', 'invitacion');
    await db.query("UPDATE tokens_password SET expira_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE tipo='invitacion'");
    for (const t of ['no-existe', usado, vencido]) {
      const r = await post('/api/auth/token', { token: t, password: 'nueva-clave-1' });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: MSG_USADO });
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('token válido sigue usando bcrypt y cambia la clave', async () => {
    const spy = vi.spyOn(bcrypt, 'hash');
    const t = await nuevoToken('u-1', 'recuperacion');
    expect((await post('/api/auth/token', { token: t, password: 'nueva-clave-1' })).status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    await esperarPendientes();
    await db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash('clave-ana', 4), 'u-1']);
  });
  it('tras 10 fallos desde la misma IP responde 429, incluso con un token válido', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await post('/api/auth/token', { token: 'malo-' + i, password: 'nueva-clave-1' })).status).toBe(400);
    }
    const t = await nuevoToken('u-1', 'recuperacion');
    const r = await post('/api/auth/token', { token: t, password: 'nueva-clave-1' });
    expect(r.status).toBe(429);
    expect((await consumirToken(db, t)).usuarioId).toBe('u-1'); // no se consumió
  });
});

describe('POST /api/auth/password manda "contraseña cambiada"', () => {
  it('mail con el motivo de cambio propio', async () => {
    const cookie = await iniciarSesionComo(app, 'ana@colegio.test', 'clave-ana');
    const r = await request(app).post('/api/auth/password').set('Origin', OK).set('X-Forwarded-Proto', 'https')
      .set('Cookie', cookie).send({ passwordActual: 'clave-ana', passwordNueva: 'clave-nueva-7' });
    expect(r.status).toBe(200);
    await esperarPendientes();
    expect(mailer.enviados).toHaveLength(1);
    expect(mailer.enviados[0].para).toBe('ana@colegio.test');
    expect(mailer.enviados[0].html).toContain('Este cambio lo hiciste vos mismo desde el sistema.');
    await db.query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash('clave-ana', 4), 'u-1']);
  });
});

describe('enviarSinEsperar', () => {
  it('no rechaza si el mailer falla y loguea sin el detalle', async () => {
    mailer.fallarCon(new Error('detalle-sensible'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(enviarSinEsperar(mailer, { para: 'a@b.c', asunto: 's', html: 'h' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('detalle-sensible');
    warn.mockRestore();
  });
  it('mailer nulo no rompe', async () => {
    await expect(enviarSinEsperar(null, { para: 'a@b.c', asunto: 's', html: 'h' })).resolves.toBeUndefined();
  });
});

describe('plantillas', () => {
  const XSS = '<script>alert(1)</script>';
  it('recuperación e invitación: link con botón, escapado', () => {
    const rec = plantillas.recuperacion(`${OK}/?token=a%2Bb&tipo=recuperacion`);
    expect(rec.asunto).toBe('Restablecer Contraseña');
    expect(rec.html).toContain('Restablecer contraseña');
    expect(rec.html).toContain('logo.png');
    expect(rec.html).not.toContain('{{');
    const inv = plantillas.invitacion(`${OK}/?token=abc&tipo=invitacion`, XSS);
    expect(inv.html).toContain('Te damos la bienvenida al Sistema de IT');
    expect(inv.html).toContain('Crear mi contraseña');
    expect(inv.html).toContain('72 horas');
    expect(inv.html).not.toContain('<script>');
    expect(inv.html).toContain('&lt;script&gt;');
    expect(inv.html).toContain('tipo=invitacion');
  });
  it('link con comillas no rompe el atributo href', () => {
    const r = plantillas.recuperacion('https://x/?a="><script>1</script>');
    expect(r.html).not.toContain('<script>');
  });
  it('préstamo y devolución: asuntos exactos, datos y escapado', () => {
    const d = { persona: XSS, numeroInventario: XSS, tipo: 'Notebook', marca: 'HP', modelo: XSS, fechaDevolucion: '2026-12-01', observaciones: XSS };
    const p = plantillas.prestamo(d);
    expect(p.asunto).toBe('Préstamo de equipo registrado');
    expect(p.html).toContain('Se registró un préstamo de equipo a tu nombre');
    expect(p.html).toContain('01/12/2026');
    expect(p.html).not.toContain('<script>');
    const v = plantillas.devolucion(d);
    expect(v.asunto).toBe('Devolución de equipo registrada');
    expect(v.html).toContain('Se registró la devolución de un equipo a tu nombre');
    expect(v.html).toContain('Observaciones');
    expect(v.html).not.toContain('<script>');
    expect(plantillas.prestamo({}).html).toContain('>Equipo<');
  });
  it('contraseña cambiada / restablecida', () => {
    const c = plantillas.passwordCambiada('Este cambio lo hiciste vos mismo desde el sistema.');
    expect(c.asunto).toBe('Tu contraseña fue actualizada');
    expect(c.html).toContain('fue actualizada correctamente');
    expect(plantillas.passwordCambiada(XSS).html).not.toContain('<script>');
    expect(plantillas.passwordRestablecida().html).toContain('Un administrador del sistema restableció tu contraseña.');
    expect(plantillas.passwordRestablecida().asunto).toBe('Tu contraseña fue actualizada');
  });
});

describe('R21 y límites (ronda de correcciones)', () => {
  it('I2: inundar /recuperar no extiende el bloqueo; pasada la hora desde el 3er mail vuelve a enviar', async () => {
    const t0 = reloj.t;
    for (let i = 0; i < 1000; i++) await post('/api/auth/recuperar', { email: 'ana@colegio.test' });
    await esperarPendientes();
    expect(mailer.enviados).toHaveLength(3);
    reloj.t = t0 + 30 * 60 * 1000;
    await post('/api/auth/recuperar', { email: 'ana@colegio.test' }); // bloqueado: no cuenta
    reloj.t = t0 + 61 * 60 * 1000;
    await recuperar('ana@colegio.test');
    expect(mailer.enviados).toHaveLength(4);
  }, 60000);

  it('I3: formato real de la sesión y cerrarSesionesDe', async () => {
    await usuario('u-7', 'sa@colegio.test', await bcrypt.hash('clave-sa', 4));
    await usuario('u-8', 'sb@colegio.test', await bcrypt.hash('clave-sb', 4));
    await db.query('DELETE FROM sesiones');
    const a1 = await iniciarSesionComo(app, 'sa@colegio.test', 'clave-sa');
    await iniciarSesionComo(app, 'sa@colegio.test', 'clave-sa');
    await iniciarSesionComo(app, 'sb@colegio.test', 'clave-sb');
    const [filas] = await db.query('SELECT data FROM sesiones');
    expect(filas.map((f) => JSON.parse(f.data).usuarioId).sort()).toEqual(['u-7', 'u-7', 'u-8']);
    expect(filas[0].data).toMatch(/"usuarioId":"u-[78]"/);
    const { cerrarSesionesDe } = await import('../src/auth/sesion.js');
    await cerrarSesionesDe(db, 'u-7');
    const [resto] = await db.query('SELECT data FROM sesiones');
    expect(resto.map((f) => JSON.parse(f.data).usuarioId)).toEqual(['u-8']);
    expect(a1).toBeTruthy();
  });

  it('I3: reset por token cierra todas las sesiones del usuario y no toca las de otros', async () => {
    await db.query('DELETE FROM sesiones');
    const a1 = await iniciarSesionComo(app, 'sa@colegio.test', 'clave-sa');
    await iniciarSesionComo(app, 'sa@colegio.test', 'clave-sa');
    const b = await iniciarSesionComo(app, 'sb@colegio.test', 'clave-sb');
    const t = await nuevoToken('u-7', 'recuperacion');
    expect((await post('/api/auth/token', { token: t, password: 'clave-sa-nueva' })).status).toBe(200);
    const [filas] = await db.query('SELECT data FROM sesiones');
    expect(filas.map((f) => JSON.parse(f.data).usuarioId)).toEqual(['u-8']);
    const ses = (c) => request(app).get('/api/auth/sesion').set('X-Forwarded-Proto', 'https').set('Cookie', c);
    expect((await ses(a1)).status).toBe(401);
    expect((await ses(b)).status).toBe(200);
  });

  it('I3: cambio de clave cierra las otras sesiones pero no la actual', async () => {
    await db.query('DELETE FROM sesiones');
    const otra = await iniciarSesionComo(app, 'sb@colegio.test', 'clave-sb');
    const actual = await iniciarSesionComo(app, 'sb@colegio.test', 'clave-sb');
    const r = await request(app).post('/api/auth/password').set('Origin', OK).set('X-Forwarded-Proto', 'https')
      .set('Cookie', actual).send({ passwordActual: 'clave-sb', passwordNueva: 'clave-sb-nueva' });
    expect(r.status).toBe(200);
    const nueva = r.headers['set-cookie'].find((c) => c.startsWith('sid=')).split(';')[0];
    const ses = (c) => request(app).get('/api/auth/sesion').set('X-Forwarded-Proto', 'https').set('Cookie', c);
    expect((await ses(otra)).status).toBe(401);
    expect((await ses(nueva)).status).toBe(200);
  });

  it('R21: si el UPDATE de la clave falla, se revierte y el token no se gasta', async () => {
    const dbRota = Object.create(db);
    dbRota.getConnection = async () => {
      const c = await db.getConnection();
      const q = c.query.bind(c);
      c.query = (sql, ...r) => (String(sql).startsWith('UPDATE usuarios') ? Promise.reject(new Error('falla')) : q(sql, ...r));
      return c;
    };
    const appRota = crearApp({ db: dbRota, mailer, config: { corsOrigins: [OK], sessionSecret: 's', appUrl: OK } });
    const t = await nuevoToken('u-8', 'recuperacion');
    const r = await request(appRota).post('/api/auth/token').set('Origin', OK).set('X-Forwarded-Proto', 'https').send({ token: t, password: 'abcdef1' });
    expect(r.status).toBe(500);
    expect((await consumirToken(db, t)).usuarioId).toBe('u-8'); // sigue vigente
  });

  it('APP_URL: link sin y con barra final; requerida en la config', async () => {
    const appBarra = crearApp({ db, mailer, config: { corsOrigins: [OK], sessionSecret: 's', appUrl: OK + '///', ahora: () => reloj.t } });
    await request(appBarra).post('/api/auth/recuperar').set('Origin', OK).set('X-Forwarded-Proto', 'https').send({ email: 'ana@colegio.test' });
    await esperarPendientes();
    expect(mailer.enviados[0].html).toContain(`href="${OK}/?token=`);
    expect(mailer.enviados[0].html).not.toContain('//?token');
    const base = { DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'n', SESSION_SECRET: 's'.repeat(32), CORS_ORIGINS: OK,
      SMTP_HOST: 'h', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM_EMAIL: 'a@b.c' };
    expect(() => leerConfig(base)).toThrow(/APP_URL/);
    expect(leerConfig({ ...base, APP_URL: OK + '/' }).appUrl).toBe(OK);
  });
});
