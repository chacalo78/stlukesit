import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { crearApp } from '../src/app.js';
import { crearDbDeTest, limpiar, iniciarSesionComo, crearMailerFalso } from './helpers.js';

const OK = 'https://inventario.chacalo.com.ar';
let db, app, mailer, c;

const llamar = (metodo, url, cookie, body) => {
  const t = request(app)[metodo](url).set('Origin', OK).set('X-Forwarded-Proto', 'https');
  if (cookie) t.set('Cookie', cookie);
  return body === undefined ? t : t.send(body);
};
const movs = async () => (await db.query('SELECT equipo_id, tipo_movimiento, descripcion, usuario FROM movimientos ORDER BY fecha, id'))[0];
const equipo = async (id) => (await db.query('SELECT * FROM equipos WHERE id = ?', [id]))[0][0];
const prestamoDb = async (id) => (await db.query('SELECT * FROM prestamos WHERE id = ?', [id]))[0][0];
async function nuevoEquipo(id, extra = {}) {
  const e = { tipo: 'Notebook', estado: 'Activo', numero_inventario: `INV-${id}`, marca: 'Dell', modelo: 'X1', ubicacion: 'Sede Central', ...extra };
  await db.query('INSERT INTO equipos (id, tipo, numero_inventario, marca, modelo, estado, ubicacion, usuario) VALUES (?,?,?,?,?,?,?,?)',
    [id, e.tipo, e.numero_inventario, e.marca, e.modelo, e.estado, e.ubicacion, e.usuario ?? null]);
}
async function usuario(id, rol, nombre) {
  await db.query('INSERT INTO usuarios (id, email, password_hash, nombre, rol, habilitado) VALUES (?,?,?,?,?,1)',
    [id, `${id}@c.test`, await bcrypt.hash('clave-' + id, 4), nombre, rol]);
  return iniciarSesionComo(app, `${id}@c.test`, 'clave-' + id);
}
async function sembrar(id, equipo_id, { fecha = '2026-11-01', email = 'p@x.com', devuelto = null, persona = 'Pepe Pérez', creado = '2026-11-01 10:00:00.000' } = {}) {
  await db.query(`INSERT INTO prestamos (id, equipo_id, persona, sector, fecha_prestamo, fecha_devolucion_estimada, fecha_devolucion_real, registrado_por, email_destinatario, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, equipo_id, persona, 'IT', fecha, '2026-12-01', devuelto, 'Carla Coord', email, creado]);
}
const BODY = { equipo_id: 'e1', persona: 'Pepe Pérez', email_destinatario: 'pepe@x.com', sector: 'IT', fecha_devolucion_estimada: '2026-12-01', observaciones_entrega: 'Con cargador' };

beforeAll(async () => {
  db = await crearDbDeTest();
  mailer = crearMailerFalso();
  app = crearApp({ db, mailer, config: { corsOrigins: [OK], sessionSecret: 's', appUrl: OK } });
  c = { sa: await usuario('sa', 'super_admin', 'Sofi Super'), ad: await usuario('ad', 'admin', 'Ada Admin'),
    co: await usuario('co', 'coordinador', 'Carla Coord'), di: await usuario('di', 'director', 'Dani Dir') };
});
afterAll(() => limpiar(db));
beforeEach(async () => {
  mailer.enviados.length = 0; mailer.error = null;
  await db.query('DELETE FROM prestamos'); await db.query('DELETE FROM movimientos'); await db.query('DELETE FROM equipos');
});

describe('permisos', () => {
  it('sin sesión 401', async () => {
    for (const [m, u] of [['get', '/api/prestamos'], ['get', '/api/prestamos/activos'], ['post', '/api/prestamos'], ['post', '/api/prestamos/x/devolver']]) {
      expect((await llamar(m, u)).status, u).toBe(401);
    }
  });
  it('director: lee (200) pero POST crear y devolver 403', async () => {
    expect((await llamar('get', '/api/prestamos', c.di)).status).toBe(200);
    expect((await llamar('get', '/api/prestamos/activos', c.di)).status).toBe(200);
    await nuevoEquipo('e1');
    for (const [u, b] of [['/api/prestamos', BODY], ['/api/prestamos/x/devolver', {}]]) {
      const r = await llamar('post', u, c.di, b);
      expect(r.status, u).toBe(403);
      expect(r.body).toEqual({ error: 'No tenés permiso para realizar esta acción' });
    }
    expect(await movs()).toEqual([]);
  });
  it('coordinador, admin y super_admin pueden crear', async () => {
    for (const [k, cookie] of [['e1', c.co], ['e2', c.ad], ['e3', c.sa]]) {
      await nuevoEquipo(k);
      expect((await llamar('post', '/api/prestamos', cookie, { ...BODY, equipo_id: k })).status).toBe(201);
    }
  });
});

describe('POST /api/prestamos validación', () => {
  beforeEach(() => nuevoEquipo('e1'));
  it.each([
    ['sin equipo', { equipo_id: undefined }],
    ['equipo vacío', { equipo_id: '' }],
    ['sin persona', { persona: undefined }],
    ['persona en blanco', { persona: '   ' }],
    ['sin fecha', { fecha_devolucion_estimada: undefined }],
    ['fecha inválida', { fecha_devolucion_estimada: '2026-02-31' }],
    ['fecha con formato malo', { fecha_devolucion_estimada: '01/12/2026' }],
    ['sin email', { email_destinatario: undefined }],
    ['email vacío', { email_destinatario: '  ' }],
    ['email sin arroba', { email_destinatario: 'pepe.x.com' }],
    ['email sin dominio', { email_destinatario: 'pepe@x' }],
    ['email con espacio', { email_destinatario: 'pe pe@x.com' }],
    ['email de 5 caracteres', { email_destinatario: 'a@b.c' }],
    ['email null', { email_destinatario: null }],
  ])('%s -> 400 y no se guarda nada', async (_n, cambio) => {
    const r = await llamar('post', '/api/prestamos', c.co, { ...BODY, ...cambio });
    expect(r.status).toBe(400);
    expect(typeof r.body.error).toBe('string');
    expect((await db.query('SELECT COUNT(*) n FROM prestamos'))[0][0].n).toBe(0);
    expect(mailer.enviados).toEqual([]);
    expect((await equipo('e1')).estado).toBe('Activo');
  });
  it('email de 6 caracteres válido (a@b.co) se acepta y se recorta', async () => {
    const r = await llamar('post', '/api/prestamos', c.co, { ...BODY, email_destinatario: '  a@b.co ' });
    expect(r.status).toBe(201);
    expect(r.body.prestamo.email_destinatario).toBe('a@b.co');
  });
});

describe('POST /api/prestamos', () => {
  it('equipo inexistente 404', async () => {
    const r = await llamar('post', '/api/prestamos', c.co, { ...BODY, equipo_id: 'nope' });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'No encontrado' });
  });
  it.each(['Prestado', 'De baja', 'Baja Definitiva'])('equipo en estado %s -> 409, sin préstamo, movimiento ni mail', async (estado) => {
    await nuevoEquipo('e1', { estado });
    const r = await llamar('post', '/api/prestamos', c.co, BODY);
    expect(r.status).toBe(409);
    expect(typeof r.body.error).toBe('string');
    expect((await db.query('SELECT COUNT(*) n FROM prestamos'))[0][0].n).toBe(0);
    expect(await movs()).toEqual([]);
    expect(mailer.enviados).toEqual([]);
    expect((await equipo('e1')).estado).toBe(estado);
  });
  it.each(['Activo', 'En reparación', 'Requiere atención', 'En depósito'])('equipo %s se puede prestar', async (estado) => {
    await nuevoEquipo('e1', { estado });
    expect((await llamar('post', '/api/prestamos', c.co, BODY)).status).toBe(201);
  });
  it('éxito: guarda, pasa el equipo a Prestado, movimiento exacto y mail', async () => {
    await nuevoEquipo('e1');
    const r = await llamar('post', '/api/prestamos', c.co, { ...BODY, registrado_por: 'Otro', fecha_devolucion_real: '2026-01-01T00:00:00Z', id: 'forzado' });
    expect(r.status).toBe(201);
    expect(r.body.mailError).toBeUndefined();
    expect(r.body.prestamo).toMatchObject({ equipo_id: 'e1', persona: 'Pepe Pérez', sector: 'IT', email_destinatario: 'pepe@x.com',
      fecha_devolucion_estimada: '2026-12-01', fecha_devolucion_real: null, observaciones_entrega: 'Con cargador',
      registrado_por: 'Carla Coord', observaciones_devolucion: null });
    expect(r.body.prestamo.id).not.toBe('forzado');
    expect(r.body.prestamo.fecha_prestamo).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(r.body.prestamo.created_at).toMatch(/Z$/);
    expect(r.body.prestamo.equipos).toMatchObject({ id: 'e1', numero_inventario: 'INV-e1', tipo: 'Notebook', marca: 'Dell', modelo: 'X1', ubicacion: 'Sede Central' });
    const e = await equipo('e1');
    expect(e.estado).toBe('Prestado');
    expect(e.usuario).toBe('Pepe Pérez');
    expect(await movs()).toEqual([{ equipo_id: 'e1', tipo_movimiento: 'Préstamo', descripcion: 'Equipo prestado a Pepe Pérez (INV-e1)', usuario: 'Carla Coord' }]);
    expect(mailer.enviados).toHaveLength(1);
    expect(mailer.enviados[0].para).toBe('pepe@x.com');
    expect(mailer.enviados[0].asunto).toBe('Préstamo de equipo registrado');
    expect(mailer.enviados[0].html).toContain('Notebook Dell X1');
    expect(mailer.enviados[0].html).toContain('INV-e1');
    expect(mailer.enviados[0].html).toContain('Pepe Pérez');
    expect(mailer.enviados[0].html).toContain('01/12/2026');
  });
  it('campos opcionales vacíos se guardan como NULL', async () => {
    await nuevoEquipo('e1');
    const r = await llamar('post', '/api/prestamos', c.co, { ...BODY, sector: '', observaciones_entrega: '' });
    expect(r.body.prestamo).toMatchObject({ sector: null, observaciones_entrega: null });
  });
  it('si el mail falla el préstamo queda guardado y vuelve mailError con el detalle', async () => {
    await nuevoEquipo('e1');
    mailer.fallarCon(new Error('Greeting never received'));
    const r = await llamar('post', '/api/prestamos', c.co, BODY);
    expect(r.status).toBe(201);
    expect(r.body.mailError).toBe('Greeting never received');
    expect(r.body.prestamo.id).toBeTruthy();
    expect(await prestamoDb(r.body.prestamo.id)).toBeTruthy();
    expect((await equipo('e1')).estado).toBe('Prestado');
    expect((await movs()).map((m) => m.tipo_movimiento)).toEqual(['Préstamo']);
  });
  it('dos préstamos simultáneos del mismo equipo: uno 201 y otro 409', async () => {
    await nuevoEquipo('e1');
    const rs = await Promise.all([llamar('post', '/api/prestamos', c.co, BODY), llamar('post', '/api/prestamos', c.ad, BODY)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await db.query('SELECT COUNT(*) n FROM prestamos'))[0][0].n).toBe(1);
    expect((await movs())).toHaveLength(1);
    expect(mailer.enviados).toHaveLength(1);
  });
  it('persona demasiado larga -> 400 y el equipo no cambia', async () => {
    await nuevoEquipo('e1');
    const r = await llamar('post', '/api/prestamos', c.co, { ...BODY, persona: 'x'.repeat(300) });
    expect(r.status).toBe(400);
    expect((await equipo('e1')).estado).toBe('Activo');
  });
});

describe('GET /api/prestamos y /activos', () => {
  it('listar: orden fecha_prestamo desc, equipos anidado, DATE como string y timestamps con Z', async () => {
    await nuevoEquipo('e1'); await nuevoEquipo('e2', { ubicacion: 'Sede Norte' });
    await sembrar('p1', 'e1', { fecha: '2026-11-10', devuelto: '2026-11-12 15:30:00.000' });
    await sembrar('p2', 'e2', { fecha: '2026-11-20' });
    const r = await llamar('get', '/api/prestamos', c.co);
    expect(r.status).toBe(200);
    expect(r.body.map((p) => p.id)).toEqual(['p2', 'p1']);
    const p1 = r.body[1];
    expect(p1.fecha_prestamo).toBe('2026-11-10');
    expect(p1.fecha_devolucion_estimada).toBe('2026-12-01');
    expect(p1.fecha_devolucion_real).toBe('2026-11-12T15:30:00.000Z');
    expect(p1.fecha_devolucion_real.endsWith('Z')).toBe(true);
    expect(p1.created_at).toBe('2026-11-01T10:00:00.000Z');
    expect(p1.equipos).toEqual({ id: 'e1', numero_inventario: 'INV-e1', tipo: 'Notebook', marca: 'Dell', modelo: 'X1', ubicacion: 'Sede Central' });
    expect(r.body[0].equipos.ubicacion).toBe('Sede Norte');
    expect(r.body[0].fecha_devolucion_real).toBeNull();
  });
  it('activos: solo sin devolver, con equipos { ubicacion }', async () => {
    await nuevoEquipo('e1'); await nuevoEquipo('e2');
    await sembrar('p1', 'e1', { devuelto: '2026-11-12 15:30:00.000' });
    await sembrar('p2', 'e2');
    const r = await llamar('get', '/api/prestamos/activos', c.di);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ id: 'p2', persona: 'Pepe Pérez', fecha_prestamo: '2026-11-01' });
    expect(r.body[0].equipos).toEqual({ ubicacion: 'Sede Central' });
  });
});

describe('POST /api/prestamos/:id/devolver', () => {
  it('Review Focus 4: crear con fecha_prestamo 2026-11-10, devolver, y todo vuelve con los formatos correctos', async () => {
    await nuevoEquipo('e1', { estado: 'Prestado', usuario: 'Pepe Pérez' });
    await sembrar('p1', 'e1', { fecha: '2026-11-10' });
    const r = await llamar('post', '/api/prestamos/p1/devolver', c.co, { observaciones: 'Todo bien' });
    expect(r.status).toBe(200);
    expect(r.body.prestamo.fecha_prestamo).toBe('2026-11-10');
    expect(r.body.prestamo.fecha_devolucion_real).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    const ahora = Date.now();
    expect(Math.abs(new Date(r.body.prestamo.fecha_devolucion_real).getTime() - ahora)).toBeLessThan(60_000);
    const l = (await llamar('get', '/api/prestamos', c.co)).body[0];
    expect(l.fecha_prestamo).toBe('2026-11-10');
    expect(l.fecha_devolucion_real.endsWith('Z')).toBe(true);
  });
  it('éxito: equipo Activo sin usuario, movimiento exacto, observaciones y mail de devolución', async () => {
    await nuevoEquipo('e1', { estado: 'Prestado', usuario: 'Pepe Pérez' });
    await sembrar('p1', 'e1', { email: 'pepe@x.com' });
    const r = await llamar('post', '/api/prestamos/p1/devolver', c.ad, { observaciones: 'Rayón <leve>' });
    expect(r.status).toBe(200);
    expect(r.body.mailError).toBeUndefined();
    expect(r.body.prestamo).toMatchObject({ id: 'p1', observaciones_devolucion: 'Rayón <leve>', equipos: { id: 'e1', numero_inventario: 'INV-e1' } });
    const e = await equipo('e1');
    expect(e.estado).toBe('Activo');
    expect(e.usuario).toBeNull();
    expect(await movs()).toEqual([{ equipo_id: 'e1', tipo_movimiento: 'Devolución', descripcion: 'Equipo devuelto por Pepe Pérez (INV-e1)', usuario: 'Ada Admin' }]);
    expect(mailer.enviados).toHaveLength(1);
    expect(mailer.enviados[0].para).toBe('pepe@x.com');
    expect(mailer.enviados[0].asunto).toBe('Devolución de equipo registrada');
    expect(mailer.enviados[0].html).toContain('Notebook Dell X1');
    expect(mailer.enviados[0].html).toContain('Rayón &lt;leve&gt;');
  });
  it('observaciones vacías o ausentes se guardan NULL', async () => {
    await nuevoEquipo('e1', { estado: 'Prestado' }); await nuevoEquipo('e2', { estado: 'Prestado' });
    await sembrar('p1', 'e1'); await sembrar('p2', 'e2');
    expect((await llamar('post', '/api/prestamos/p1/devolver', c.co, { observaciones: '' })).body.prestamo.observaciones_devolucion).toBeNull();
    expect((await llamar('post', '/api/prestamos/p2/devolver', c.co, {})).body.prestamo.observaciones_devolucion).toBeNull();
  });
  it('sin email_destinatario no se manda mail', async () => {
    await nuevoEquipo('e1', { estado: 'Prestado' });
    await sembrar('p1', 'e1', { email: null });
    const r = await llamar('post', '/api/prestamos/p1/devolver', c.co, {});
    expect(r.status).toBe(200);
    expect(r.body.mailError).toBeUndefined();
    expect(mailer.enviados).toEqual([]);
    expect((await movs()).map((m) => m.tipo_movimiento)).toEqual(['Devolución']);
  });
  it('si el mail falla igual se devuelve y responde mailError', async () => {
    await nuevoEquipo('e1', { estado: 'Prestado' });
    await sembrar('p1', 'e1');
    mailer.fallarCon(new Error('535 Auth failed'));
    const r = await llamar('post', '/api/prestamos/p1/devolver', c.co, {});
    expect(r.status).toBe(200);
    expect(r.body.mailError).toBe('535 Auth failed');
    expect((await prestamoDb('p1')).fecha_devolucion_real).not.toBeNull();
    expect((await equipo('e1')).estado).toBe('Activo');
  });
  it('ya devuelto -> 409 y nada cambia', async () => {
    await nuevoEquipo('e1', { estado: 'Activo' });
    await sembrar('p1', 'e1', { devuelto: '2026-11-12 15:30:00.000' });
    const r = await llamar('post', '/api/prestamos/p1/devolver', c.co, {});
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'El préstamo ya fue devuelto' });
    expect(await movs()).toEqual([]);
    expect(mailer.enviados).toEqual([]);
  });
  it('dos devoluciones simultáneas: una 200 y otra 409, un solo movimiento y un solo mail', async () => {
    await nuevoEquipo('e1', { estado: 'Prestado' });
    await sembrar('p1', 'e1');
    const rs = await Promise.all([llamar('post', '/api/prestamos/p1/devolver', c.co, {}), llamar('post', '/api/prestamos/p1/devolver', c.ad, {})]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await movs()).toHaveLength(1);
    expect(mailer.enviados).toHaveLength(1);
  });
  it('inexistente 404', async () => {
    expect((await llamar('post', '/api/prestamos/nope/devolver', c.co, {})).status).toBe(404);
  });
  it('un equipo dado de baja definitiva mientras estaba prestado no se reactiva', async () => {
    await nuevoEquipo('e1', { estado: 'Baja Definitiva' });
    await sembrar('p1', 'e1');
    expect((await llamar('post', '/api/prestamos/p1/devolver', c.co, {})).status).toBe(200);
    expect((await equipo('e1')).estado).toBe('Baja Definitiva');
  });
});
