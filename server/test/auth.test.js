import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { crearApp } from '../src/app.js';
import { crearDbDeTest, limpiar, iniciarSesionComo } from './helpers.js';

const OK = 'https://inventario.chacalo.com.ar';
// Hash $2a$10$ de "vieja-clave" generado como los de Supabase (migrado tal cual).
const HASH_MIGRADO = '$2a$10$' + bcrypt.hashSync('vieja-clave', 10).slice(7);
let db, app, reloj;

const post = (url, body) => request(app).post(url).set('Origin', OK).set('X-Forwarded-Proto', 'https').send(body);
const get = (url, cookie) => {
  const t = request(app).get(url).set('X-Forwarded-Proto', 'https');
  return cookie ? t.set('Cookie', cookie) : t;
};
const login = (email, password) => post('/api/auth/login', { email, password });

async function usuario(id, email, hash, extra = {}) {
  await db.query(
    'INSERT INTO usuarios (id, email, password_hash, nombre, rol, sede, habilitado) VALUES (?,?,?,?,?,?,?)',
    [id, email, hash, extra.nombre ?? 'Nombre ' + id, extra.rol ?? 'admin', extra.sede ?? 'Sede 1', extra.habilitado ?? 1],
  );
}

beforeAll(async () => {
  db = await crearDbDeTest();
  reloj = { t: 1_000_000 };
  app = crearApp({ db, mailer: null, config: { corsOrigins: [OK], sessionSecret: 'secreto-de-test', ahora: () => reloj.t } });
  await usuario('u-1', 'ana@colegio.test', HASH_MIGRADO, { nombre: 'Ana', rol: 'super_admin', sede: 'Central' });
  await usuario('u-2', 'dis@colegio.test', await bcrypt.hash('clave-dis', 4), { habilitado: 0 });
  await usuario('u-3', 'sinclave@colegio.test', null);
  await usuario('u-4', 'bob@colegio.test', await bcrypt.hash('clave-bob', 4));
  await usuario('u-9', 'mig@colegio.test', await bcrypt.hash('clave-mig', 10));
  await usuario('u-10', 'mig2@colegio.test', await bcrypt.hash('clave-mig2', 10));
  await usuario('u-5', 'eve@colegio.test', await bcrypt.hash('clave-eve', 4));
});
afterAll(() => limpiar(db));
beforeEach(() => { reloj.t += 10 * 60 * 60 * 1000; }); // cada test arranca con la ventana de rate limit vacía

describe('login', () => {
  it('hash $2a$ migrado -> 200, cuerpo y cookie sid HttpOnly Secure SameSite=Lax Path=/', async () => {
    const r = await login('ana@colegio.test', 'vieja-clave');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ email: 'ana@colegio.test', nombre: 'Ana', rol: 'super_admin', sede: 'Central', habilitado: true });
    const c = r.headers['set-cookie'].find((x) => x.startsWith('sid='));
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/Secure/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\//i);
    expect(c).not.toMatch(/Domain=/i); // host-only si COOKIE_DOMAIN no está definido
    expect(JSON.stringify(r.body)).not.toMatch(/hash|\$2/);
  });
  it('email insensible a mayúsculas y espacios', async () => {
    const r = await login('  ANA@Colegio.Test ', 'vieja-clave');
    expect(r.status).toBe(200);
  });
  it('contraseña mal -> 401; email inexistente -> mismo mensaje', async () => {
    const a = await login('ana@colegio.test', 'mala');
    const b = await login('nadie@colegio.test', 'mala');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual({ error: 'Email o contraseña incorrectos' });
    expect(b.body).toEqual(a.body);
  });
  it('password_hash NULL -> 401 con el mismo mensaje', async () => {
    const r = await login('sinclave@colegio.test', 'lo-que-sea');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'Email o contraseña incorrectos' });
  });
  it('usuario inhabilitado con clave correcta -> 403; con clave mala -> 401 (no se revela)', async () => {
    const ok = await login('dis@colegio.test', 'clave-dis');
    expect(ok.status).toBe(403);
    expect(ok.body).toEqual({ error: 'Tu usuario está inhabilitado' });
    expect(ok.headers['set-cookie']).toBeUndefined();
    const mal = await login('dis@colegio.test', 'otra');
    expect(mal.status).toBe(401);
  });
  it('cuerpo inválido -> 400', async () => {
    expect((await post('/api/auth/login', {})).status).toBe(400);
    expect((await post('/api/auth/login', { email: 5, password: 'x' })).status).toBe(400);
  });
  it('session fixation: la sesión previa al login ya no autentica y el sid cambia', async () => {
    // Sesión previa: se siembra en el store (equivale a un atacante que fijó un sid).
    const sidViejo = 'sidFijadoPorElAtacante0123456789abcdef';
    await new Promise((res, rej) => app.locals.sessionStore.set(sidViejo, {
      cookie: { originalMaxAge: 1000000, expires: new Date(Date.now() + 1e6).toISOString(), secure: true, httpOnly: true, path: '/' },
      basura: 1,
    }, (e) => (e ? rej(e) : res())));
    const firma = (await import('cookie-signature')).sign(sidViejo, 'secreto-de-test');
    const viejo = `sid=${encodeURIComponent('s:' + firma)}`;
    const r = await request(app).post('/api/auth/login').set('Origin', OK).set('X-Forwarded-Proto', 'https')
      .set('Cookie', viejo).send({ email: 'ana@colegio.test', password: 'vieja-clave' });
    expect(r.status).toBe(200);
    const nuevo = r.headers['set-cookie'].find((x) => x.startsWith('sid=')).split(';')[0];
    expect(nuevo).not.toBe(viejo);
    expect((await get('/api/auth/sesion', nuevo)).status).toBe(200);
    expect((await get('/api/auth/sesion', viejo)).status).toBe(401);
    const [f] = await db.query('SELECT COUNT(*) n FROM sesiones WHERE session_id = ?', [sidViejo]);
    expect(f[0].n).toBe(0);
  });
  it('hash migrado de costo 10 se reescribe a costo 12 tras login correcto; uno de costo 12 no se toca', async () => {
    const antes = (await db.query("SELECT password_hash h FROM usuarios WHERE id='u-9'"))[0][0].h;
    expect(bcrypt.getRounds(antes)).toBe(10);
    expect((await login('mig@colegio.test', 'clave-mig')).status).toBe(200);
    const despues = (await db.query("SELECT password_hash h FROM usuarios WHERE id='u-9'"))[0][0].h;
    expect(bcrypt.getRounds(despues)).toBe(12);
    expect(await bcrypt.compare('clave-mig', despues)).toBe(true);
    expect((await login('mig@colegio.test', 'clave-mig')).status).toBe(200);
    expect((await db.query("SELECT password_hash h FROM usuarios WHERE id='u-9'"))[0][0].h).toBe(despues);
  });
  it('login con clave mala no reescribe el hash', async () => {
    await login('mig2@colegio.test', 'mala');
    const h = (await db.query("SELECT password_hash h FROM usuarios WHERE id='u-10'"))[0][0].h;
    expect(bcrypt.getRounds(h)).toBe(10);
  });
});

describe('sesión', () => {
  it('GET /sesion sin cookie -> 401 No autenticado', async () => {
    const r = await get('/api/auth/sesion');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'No autenticado' });
  });
  it('GET /sesion con cookie -> datos del usuario', async () => {
    const cookie = await iniciarSesionComo(app, 'ana@colegio.test', 'vieja-clave');
    const r = await get('/api/auth/sesion', cookie);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ email: 'ana@colegio.test', nombre: 'Ana', rol: 'super_admin', sede: 'Central', habilitado: true });
  });
  it('cookie con firma inválida -> 401', async () => {
    const r = await get('/api/auth/sesion', 'sid=s%3Aabc.def');
    expect(r.status).toBe(401);
  });
  it('inhabilitado con sesión abierta -> próximo /sesion 401 y cookie borrada', async () => {
    await usuario('u-6', 'tmp@colegio.test', await bcrypt.hash('clave-tmp', 4));
    const cookie = await iniciarSesionComo(app, 'tmp@colegio.test', 'clave-tmp');
    expect((await get('/api/auth/sesion', cookie)).status).toBe(200);
    await db.query('UPDATE usuarios SET habilitado = 0 WHERE id = ?', ['u-6']);
    const r = await get('/api/auth/sesion', cookie);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'Sesión no válida' });
    const c = r.headers['set-cookie'].find((x) => x.startsWith('sid='));
    expect(c).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await get('/api/auth/sesion', cookie)).status).toBe(401);
  });
  it('usuario borrado con sesión abierta -> 401 Sesión no válida', async () => {
    await usuario('u-7', 'del@colegio.test', await bcrypt.hash('clave-del', 4));
    const cookie = await iniciarSesionComo(app, 'del@colegio.test', 'clave-del');
    await db.query('DELETE FROM usuarios WHERE id = ?', ['u-7']);
    const r = await get('/api/auth/sesion', cookie);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'Sesión no válida' });
  });
  it('un cambio de rol se ve en el siguiente request (se lee de la base)', async () => {
    const cookie = await iniciarSesionComo(app, 'eve@colegio.test', 'clave-eve');
    await db.query("UPDATE usuarios SET rol = 'director' WHERE id = 'u-5'");
    expect((await get('/api/auth/sesion', cookie)).body.rol).toBe('director');
  });
});

describe('logout', () => {
  it('invalida la cookie y borra la sesión; funciona sin cuerpo', async () => {
    const cookie = await iniciarSesionComo(app, 'bob@colegio.test', 'clave-bob');
    const r = await request(app).post('/api/auth/logout').set('Origin', OK).set('X-Forwarded-Proto', 'https').set('Cookie', cookie);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    expect(r.headers['set-cookie'].find((x) => x.startsWith('sid='))).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await get('/api/auth/sesion', cookie)).status).toBe(401);
    const [filas] = await db.query('SELECT COUNT(*) n FROM sesiones WHERE session_id = ?', [decodeURIComponent(cookie.slice(4)).slice(2).split('.')[0]]);
    expect(filas[0].n).toBe(0);
  });
  it('sin sesión también responde 200; sin Origin -> 403', async () => {
    expect((await post('/api/auth/logout')).status).toBe(200);
    expect((await request(app).post('/api/auth/logout')).status).toBe(403);
  });
});

describe('rate limit de login', () => {
  const intentar = async (email, n, pw = 'mala') => {
    const out = [];
    for (let i = 0; i < n; i++) out.push((await login(email, pw)).status);
    return out;
  };
  it('5 fallos -> 6º intento 429, incluso con la clave correcta', async () => {
    expect(await intentar('bob@colegio.test', 5)).toEqual([401, 401, 401, 401, 401]);
    const r = await login('bob@colegio.test', 'mala');
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
    expect((await login('bob@colegio.test', 'clave-bob')).status).toBe(429);
  });
  it('la ventana expira (reloj inyectado)', async () => {
    await intentar('eve@colegio.test', 5);
    expect((await login('eve@colegio.test', 'clave-eve')).status).toBe(429);
    reloj.t += 14 * 60 * 1000;
    expect((await login('eve@colegio.test', 'clave-eve')).status).toBe(429);
    reloj.t += 2 * 60 * 1000;
    expect((await login('eve@colegio.test', 'clave-eve')).status).toBe(200);
  });
  it('un login exitoso reinicia el contador', async () => {
    await intentar('ana@colegio.test', 4);
    expect((await login('ana@colegio.test', 'vieja-clave')).status).toBe(200);
    expect(await intentar('ana@colegio.test', 5)).toEqual([401, 401, 401, 401, 401]);
  });
  it('es por email: otro email desde la misma IP no se bloquea; el 403 no cuenta como fallo', async () => {
    await intentar('nadie@colegio.test', 5);
    expect((await login('nadie@colegio.test', 'x')).status).toBe(429);
    expect((await login('ana@colegio.test', 'vieja-clave')).status).toBe(200);
    expect(await intentar('dis@colegio.test', 6, 'clave-dis')).toEqual([403, 403, 403, 403, 403, 403]);
  });
});

describe('límite por IP', () => {
  it('30 fallos desde la IP (emails distintos) -> 429 aun con clave correcta; el éxito no reinicia el contador de IP; expira', async () => {
    for (let i = 0; i < 29; i++) expect((await login(`x${i}@colegio.test`, 'mala')).status).toBe(401);
    expect((await login('ana@colegio.test', 'vieja-clave')).status).toBe(200); // éxito: reinicia solo ip|email
    expect((await login('y@colegio.test', 'mala')).status).toBe(401); // fallo 30
    const r = await login('ana@colegio.test', 'vieja-clave');
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
    reloj.t += 16 * 60 * 1000;
    expect((await login('ana@colegio.test', 'vieja-clave')).status).toBe(200);
  }, 60000);
});

describe('limiteIntentos: tope duro de claves', () => {
  it('evicta la más vieja al llenarse', async () => {
    const { crearLimiteIntentos } = await import('../src/auth/limiteIntentos.js');
    const l = crearLimiteIntentos({ maxClaves: 3, maxFallos: 1 });
    ['a', 'b', 'c', 'd'].forEach((k) => l.registrarFallo(k));
    expect(l.bloqueado('a')).toBe(false);
    expect(l.bloqueado('b') && l.bloqueado('c') && l.bloqueado('d')).toBe(true);
  });
});

describe('cambiar contraseña', () => {
  const cambiar = (cookie, body) => request(app).post('/api/auth/password').set('Origin', OK).set('X-Forwarded-Proto', 'https').set('Cookie', cookie).send(body);
  it('sin sesión -> 401', async () => {
    expect((await post('/api/auth/password', { passwordActual: 'a', passwordNueva: 'abcdef' })).status).toBe(401);
  });
  it('actual incorrecta -> 400', async () => {
    const cookie = await iniciarSesionComo(app, 'eve@colegio.test', 'clave-eve');
    const r = await cambiar(cookie, { passwordActual: 'mala', passwordNueva: 'nueva-clave' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'La contraseña actual es incorrecta' });
  });
  it('5 contraseñas actuales incorrectas -> 429; el éxito reinicia el contador', async () => {
    await usuario('u-11', 'lim@colegio.test', await bcrypt.hash('clave-lim', 4));
    const cookie = await iniciarSesionComo(app, 'lim@colegio.test', 'clave-lim');
    for (let i = 0; i < 4; i++) expect((await cambiar(cookie, { passwordActual: 'mala', passwordNueva: 'nueva-clave' })).status).toBe(400);
    const ok = await cambiar(cookie, { passwordActual: 'clave-lim', passwordNueva: 'clave-lim' });
    expect(ok.status).toBe(200);
    const c2 = ok.headers['set-cookie'].find((x) => x.startsWith('sid=')).split(';')[0];
    for (let i = 0; i < 5; i++) expect((await cambiar(c2, { passwordActual: 'mala', passwordNueva: 'nueva-clave' })).status).toBe(400);
    const r = await cambiar(c2, { passwordActual: 'clave-lim', passwordNueva: 'otra-nueva' });
    expect(r.status).toBe(429);
    expect(r.body).toEqual({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' });
  }, 30000);
  it('nueva demasiado corta -> 400 con el mensaje del frontend', async () => {
    const cookie = await iniciarSesionComo(app, 'eve@colegio.test', 'clave-eve');
    const r = await cambiar(cookie, { passwordActual: 'clave-eve', passwordNueva: '12345' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  });
  it('éxito: hash nuevo costo 12, sesión regenerada, login con la nueva funciona', async () => {
    await usuario('u-8', 'cam@colegio.test', await bcrypt.hash('clave-cam', 4));
    const cookie = await iniciarSesionComo(app, 'cam@colegio.test', 'clave-cam');
    const r = await cambiar(cookie, { passwordActual: 'clave-cam', passwordNueva: 'otra-clave-nueva' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
    const nueva = r.headers['set-cookie'].find((x) => x.startsWith('sid=')).split(';')[0];
    expect(nueva).not.toBe(cookie);
    expect((await get('/api/auth/sesion', cookie)).status).toBe(401);
    expect((await get('/api/auth/sesion', nueva)).status).toBe(200);
    const [[u]] = await db.query('SELECT password_hash FROM usuarios WHERE id = ?', ['u-8']);
    expect(u.password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect((await login('cam@colegio.test', 'clave-cam')).status).toBe(401);
    expect((await login('cam@colegio.test', 'otra-clave-nueva')).status).toBe(200);
  });
});
