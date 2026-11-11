import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { crearApp } from '../src/app.js';
import { crearDbDeTest, limpiar, iniciarSesionComo } from './helpers.js';

const OK = 'https://inventario.chacalo.com.ar';
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
let db, app, c;

const llamar = (metodo, url, cookie, body) => {
  const t = request(app)[metodo](url).set('Origin', OK).set('X-Forwarded-Proto', 'https');
  if (cookie) t.set('Cookie', cookie);
  return body === undefined ? t : t.send(body);
};
const movs = async () => (await db.query('SELECT equipo_id, tipo_movimiento, descripcion, usuario FROM movimientos ORDER BY fecha, id'))[0];
const equipo = async (id) => (await db.query('SELECT * FROM equipos WHERE id = ?', [id]))[0][0];
const solicitud = async (id) => (await db.query('SELECT * FROM solicitudes_cambio WHERE id = ?', [id]))[0][0];
async function nuevoEquipo(id, extra = {}) {
  const e = { tipo: 'Notebook', estado: 'Activo', ...extra };
  await db.query('INSERT INTO equipos (id, tipo, numero_inventario, marca, modelo, estado, usuario) VALUES (?,?,?,?,?,?,?)',
    [id, e.tipo, e.numero_inventario ?? null, e.marca ?? null, e.modelo ?? null, e.estado, e.usuario ?? null]);
}
async function usuario(id, rol, nombre) {
  await db.query('INSERT INTO usuarios (id, email, password_hash, nombre, rol, habilitado) VALUES (?,?,?,?,?,1)',
    [id, `${id}@c.test`, await bcrypt.hash('clave-' + id, 4), nombre, rol]);
  return iniciarSesionComo(app, `${id}@c.test`, 'clave-' + id);
}
// Inserta una solicitud directa en la base (para aprobar/rechazar sin pasar por POST).
async function sembrar(id, { tipo_accion, equipo_id = null, propuestos, anteriores = null, por = 'Carla Coord', email = 'co@c.test', estado = 'Pendiente', fecha = '2026-01-01 10:00:00.000' }) {
  await db.query('INSERT INTO solicitudes_cambio (id, tipo_accion, equipo_id, datos_propuestos, datos_anteriores, estado, solicitado_por, solicitado_por_email, fecha_solicitud) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, tipo_accion, equipo_id, JSON.stringify(propuestos), anteriores && JSON.stringify(anteriores), estado, por, email, fecha]);
}

beforeAll(async () => {
  db = await crearDbDeTest();
  app = crearApp({ db, config: { corsOrigins: [OK], sessionSecret: 's', appUrl: OK } });
  c = { sa: await usuario('sa', 'super_admin', 'Sofi Super'), ad: await usuario('ad', 'admin', 'Ada Admin'),
    co: await usuario('co', 'coordinador', 'Carla Coord'), co2: await usuario('co2', 'coordinador', 'Cora Otra'), di: await usuario('di', 'director', 'Dani Dir') };
});
afterAll(() => limpiar(db));
beforeEach(async () => { await db.query('DELETE FROM solicitudes_cambio'); await db.query('DELETE FROM movimientos'); await db.query('DELETE FROM equipos'); });

describe('permisos', () => {
  it('sin sesión 401; director 403 en crear, listar, aprobar, rechazar y pendientes', async () => {
    expect((await llamar('get', '/api/solicitudes')).status).toBe(401);
    for (const [m, u, b] of [['get', '/api/solicitudes'], ['get', '/api/solicitudes/equipos-pendientes'], ['post', '/api/solicitudes', { tipo_accion: 'Alta', datos_propuestos: { tipo: 'PC' } }],
      ['post', '/api/solicitudes/x/aprobar', {}], ['post', '/api/solicitudes/x/rechazar', {}]]) {
      const r = await llamar(m, u, c.di, b);
      expect(r.status, u).toBe(403);
      expect(r.body).toEqual({ error: 'No tenés permiso para realizar esta acción' });
    }
  });
  it('coordinador no puede aprobar ni rechazar', async () => {
    await sembrar('s1', { tipo_accion: 'Alta', propuestos: { tipo: 'PC' } });
    expect((await llamar('post', '/api/solicitudes/s1/aprobar', c.co, {})).status).toBe(403);
    expect((await llamar('post', '/api/solicitudes/s1/rechazar', c.co, {})).status).toBe(403);
    expect((await solicitud('s1')).estado).toBe('Pendiente');
  });
});

describe('POST /api/solicitudes', () => {
  it('coordinador: fuerza su email/nombre/estado aunque el cliente mande otros', async () => {
    const r = await llamar('post', '/api/solicitudes', c.co, { tipo_accion: 'Alta', datos_propuestos: { tipo: 'Desktop', marca: 'HP' },
      solicitado_por: 'Otro', solicitado_por_email: 'ad@c.test', estado: 'Aprobado', resuelto_por: 'x', equipo_id: 'zzz' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ tipo_accion: 'Alta', equipo_id: null, estado: 'Pendiente', solicitado_por: 'Carla Coord', solicitado_por_email: 'co@c.test',
      datos_propuestos: { tipo: 'Desktop', marca: 'HP' }, datos_anteriores: null, resuelto_por: null, fecha_resolucion: null, comentario_resolucion: null });
    expect(r.body.fecha_solicitud).toMatch(ISO);
    const f = await solicitud(r.body.id);
    expect(f.solicitado_por_email).toBe('co@c.test');
    expect(f.estado).toBe('Pendiente');
  });
  it('Modificación: datos_anteriores se captura del equipo en el servidor', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1', marca: 'Dell' });
    const r = await llamar('post', '/api/solicitudes', c.co, { tipo_accion: 'Modificación', equipo_id: 'e1', datos_propuestos: { marca: 'HP' }, datos_anteriores: { marca: 'MENTIRA' } });
    expect(r.status).toBe(201);
    expect(r.body.equipo_id).toBe('e1');
    expect(r.body.datos_anteriores).toMatchObject({ id: 'e1', numero_inventario: 'A1', marca: 'Dell', estado: 'Activo' });
    expect(typeof r.body.datos_anteriores).toBe('object');
    expect(r.body.datos_propuestos).toEqual({ marca: 'HP' });
    expect((await equipo('e1')).marca).toBe('Dell');
  });
  it('Baja: propuestos forzados a estado De baja y anteriores del servidor', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1' });
    const r = await llamar('post', '/api/solicitudes', c.ad, { tipo_accion: 'Baja', equipo_id: 'e1', datos_propuestos: { estado: 'Activo' } });
    expect(r.status).toBe(201);
    expect(r.body.datos_propuestos).toEqual({ estado: 'De baja' });
    expect(r.body.datos_anteriores.numero_inventario).toBe('A1');
    expect(r.body.solicitado_por).toBe('Ada Admin');
  });
  it('validaciones: tipo_accion, equipo inexistente, columnas ajenas, estado inválido', async () => {
    await nuevoEquipo('e1');
    const m = (b) => llamar('post', '/api/solicitudes', c.co, b);
    expect((await m({ tipo_accion: 'Borrar', datos_propuestos: { tipo: 'PC' } })).status).toBe(400);
    expect((await m({ tipo_accion: 'Alta' })).status).toBe(400);
    expect((await m({ tipo_accion: 'Alta', datos_propuestos: { tipo: 'PC', id: 'x' } })).status).toBe(400);
    expect((await m({ tipo_accion: 'Alta', datos_propuestos: { tipo: 'PC', estado: 'Baja Definitiva' } })).status).toBe(400);
    expect((await m({ tipo_accion: 'Alta', datos_propuestos: { marca: 'sin tipo' } })).status).toBe(400);
    expect((await m({ tipo_accion: 'Modificación', datos_propuestos: { marca: 'X' } })).status).toBe(400);
    expect((await m({ tipo_accion: 'Modificación', equipo_id: 'nope', datos_propuestos: { marca: 'X' } })).status).toBe(404);
    expect((await m({ tipo_accion: 'Baja', equipo_id: 'nope' })).status).toBe(404);
    expect((await db.query('SELECT COUNT(*) n FROM solicitudes_cambio'))[0][0].n).toBe(0);
  });
});

describe('GET /api/solicitudes', () => {
  beforeEach(async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1', marca: 'Dell', modelo: 'X' });
    await sembrar('s1', { tipo_accion: 'Modificación', equipo_id: 'e1', propuestos: { marca: 'HP' }, anteriores: { marca: 'Dell' }, fecha: '2026-01-01 10:00:00.000' });
    await sembrar('s2', { tipo_accion: 'Alta', propuestos: { tipo: 'PC' }, por: 'Cora Otra', email: 'co2@c.test', fecha: '2026-01-02 10:00:00.000' });
  });
  it('admin ve todas, más reciente primero, con equipos anidado u null y JSON como objetos', async () => {
    const r = await llamar('get', '/api/solicitudes', c.ad);
    expect(r.status).toBe(200);
    expect(r.body.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(r.body[0].equipos).toBeNull();
    expect(r.body[1].equipos).toEqual({ numero_inventario: 'A1', tipo: 'Notebook', marca: 'Dell', modelo: 'X' });
    expect(r.body[1].datos_propuestos).toEqual({ marca: 'HP' });
    expect(r.body[1].datos_anteriores).toEqual({ marca: 'Dell' });
    expect(r.body[0].datos_anteriores).toBeNull();
    expect(r.body[1].fecha_solicitud).toMatch(ISO);
  });
  it('coordinador solo ve las propias', async () => {
    expect((await llamar('get', '/api/solicitudes', c.co)).body.map((s) => s.id)).toEqual(['s1']);
    expect((await llamar('get', '/api/solicitudes', c.co2)).body.map((s) => s.id)).toEqual(['s2']);
  });
  it('equipos-pendientes: ids de equipos con solicitud Pendiente (coordinador, solo las suyas)', async () => {
    await nuevoEquipo('e2');
    await sembrar('s3', { tipo_accion: 'Baja', equipo_id: 'e2', propuestos: { estado: 'De baja' }, estado: 'Aprobado' });
    expect((await llamar('get', '/api/solicitudes/equipos-pendientes', c.ad)).body).toEqual(['e1']);
    expect((await llamar('get', '/api/solicitudes/equipos-pendientes', c.co)).body).toEqual(['e1']);
    expect((await llamar('get', '/api/solicitudes/equipos-pendientes', c.co2)).body).toEqual([]);
  });
});

describe('aprobar', () => {
  it('Alta: crea el equipo y el movimiento con el texto del frontend', async () => {
    await sembrar('s1', { tipo_accion: 'Alta', propuestos: { tipo: 'Desktop', marca: 'HP', modelo: 'Pro', numero_inventario: null } });
    const r = await llamar('post', '/api/solicitudes/s1/aprobar', c.ad, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: 's1', estado: 'Aprobado', resuelto_por: 'Ada Admin', datos_propuestos: { tipo: 'Desktop', marca: 'HP', modelo: 'Pro', numero_inventario: null } });
    expect(r.body.fecha_resolucion).toMatch(ISO);
    const [[e]] = await db.query("SELECT * FROM equipos WHERE tipo = 'Desktop'");
    expect(e).toMatchObject({ marca: 'HP', modelo: 'Pro', estado: 'Activo' });
    expect(await movs()).toEqual([{ equipo_id: e.id, tipo_movimiento: 'Alta', descripcion: 'Equipo dado de alta: Desktop HP Pro (solicitado por Carla Coord)', usuario: 'Ada Admin' }]);
  });
  it('Modificación: aplica cambios y movimiento con camposModificados', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1', marca: 'Dell', usuario: 'Juan' });
    await sembrar('s1', { tipo_accion: 'Modificación', equipo_id: 'e1', propuestos: { numero_inventario: 'A1', marca: 'HP', usuario: null },
      anteriores: { numero_inventario: 'A1', marca: 'Dell', usuario: 'Juan' } });
    const r = await llamar('post', '/api/solicitudes/s1/aprobar', c.sa, {});
    expect(r.status).toBe(200);
    expect(await equipo('e1')).toMatchObject({ marca: 'HP', usuario: null, numero_inventario: 'A1' });
    expect(await movs()).toEqual([{ equipo_id: 'e1', tipo_movimiento: 'Modificación',
      descripcion: 'Equipo modificado: A1 — Marca: "Dell" → "HP"; Usuario: "Juan" → "–" (solicitado por Carla Coord)', usuario: 'Sofi Super' }]);
  });
  it('Baja: pasa el equipo a De baja con su movimiento', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1' });
    await sembrar('s1', { tipo_accion: 'Baja', equipo_id: 'e1', propuestos: { estado: 'De baja' }, anteriores: { numero_inventario: 'A1', estado: 'Activo' } });
    expect((await llamar('post', '/api/solicitudes/s1/aprobar', c.ad, {})).status).toBe(200);
    expect((await equipo('e1')).estado).toBe('De baja');
    expect(await movs()).toEqual([{ equipo_id: 'e1', tipo_movimiento: 'Baja', descripcion: 'Equipo dado de baja: A1 (solicitado por Carla Coord)', usuario: 'Ada Admin' }]);
  });
  it('404 si no existe; 409 si ya resuelta; 409 si el equipo está en Baja Definitiva (sin cambios)', async () => {
    expect((await llamar('post', '/api/solicitudes/nada/aprobar', c.ad, {})).status).toBe(404);
    await sembrar('s0', { tipo_accion: 'Alta', propuestos: { tipo: 'PC' }, estado: 'Rechazado' });
    const r0 = await llamar('post', '/api/solicitudes/s0/aprobar', c.ad, {});
    expect(r0.status).toBe(409);
    expect(r0.body).toEqual({ error: 'La solicitud ya fue resuelta' });
    await nuevoEquipo('e1', { estado: 'Baja Definitiva' });
    await sembrar('s1', { tipo_accion: 'Modificación', equipo_id: 'e1', propuestos: { marca: 'HP' }, anteriores: {} });
    expect((await llamar('post', '/api/solicitudes/s1/aprobar', c.ad, {})).status).toBe(409);
    expect((await solicitud('s1')).estado).toBe('Pendiente');
    expect(await movs()).toEqual([]);
  });
  it('dos aprobaciones en paralelo: una 200, una 409, un solo equipo y un solo movimiento', async () => {
    await sembrar('s1', { tipo_accion: 'Alta', propuestos: { tipo: 'Desktop', marca: 'HP' } });
    const rs = await Promise.all([llamar('post', '/api/solicitudes/s1/aprobar', c.ad, {}), llamar('post', '/api/solicitudes/s1/aprobar', c.sa, {})]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await db.query('SELECT COUNT(*) n FROM equipos'))[0][0].n).toBe(1);
    expect(await movs()).toHaveLength(1);
  });
  it('aprobar y rechazar en paralelo: gana uno solo', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1' });
    await sembrar('s1', { tipo_accion: 'Baja', equipo_id: 'e1', propuestos: { estado: 'De baja' }, anteriores: { numero_inventario: 'A1' } });
    const rs = await Promise.all([llamar('post', '/api/solicitudes/s1/aprobar', c.ad, {}), llamar('post', '/api/solicitudes/s1/rechazar', c.sa, { comentario: 'no' })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    const s = await solicitud('s1');
    expect((await equipo('e1')).estado).toBe(s.estado === 'Aprobado' ? 'De baja' : 'Activo');
    expect(await movs()).toHaveLength(s.estado === 'Aprobado' ? 1 : 0);
  });
});

describe('rechazar', () => {
  it('marca Rechazado con comentario y no toca equipos ni movimientos', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1', marca: 'Dell' });
    await sembrar('s1', { tipo_accion: 'Modificación', equipo_id: 'e1', propuestos: { marca: 'HP' }, anteriores: { marca: 'Dell' } });
    const r = await llamar('post', '/api/solicitudes/s1/rechazar', c.ad, { comentario: 'No corresponde' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: 'Rechazado', resuelto_por: 'Ada Admin', comentario_resolucion: 'No corresponde', datos_propuestos: { marca: 'HP' } });
    expect(r.body.fecha_resolucion).toMatch(ISO);
    expect((await equipo('e1')).marca).toBe('Dell');
    expect(await movs()).toEqual([]);
  });
  it('sin comentario queda null; 404 y 409', async () => {
    await sembrar('s1', { tipo_accion: 'Alta', propuestos: { tipo: 'PC' } });
    expect((await llamar('post', '/api/solicitudes/s1/rechazar', c.ad, {})).body.comentario_resolucion).toBeNull();
    const r = await llamar('post', '/api/solicitudes/s1/rechazar', c.ad, {});
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'La solicitud ya fue resuelta' });
    expect((await llamar('post', '/api/solicitudes/nada/rechazar', c.ad, {})).status).toBe(404);
  });
});
