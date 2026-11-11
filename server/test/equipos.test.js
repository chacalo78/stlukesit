import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { crearApp } from '../src/app.js';
import { crearDbDeTest, limpiar, iniciarSesionComo } from './helpers.js';

const OK = 'https://inventario.chacalo.com.ar';
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const COLS = ['created_at', 'dado_de_baja_definitiva_por', 'disco', 'estado', 'fecha_adquisicion', 'fecha_baja_definitiva', 'garantia_hasta', 'id', 'id_red', 'marca', 'modelo', 'numero_inventario', 'numero_serie', 'observaciones', 'procesador', 'ram', 'sector', 'sistema_operativo', 'tipo', 'tipo_disco', 'ubicacion', 'updated_at', 'usuario'];
let db, app, c;

const llamar = (metodo, url, cookie, body) => {
  const t = request(app)[metodo](url).set('Origin', OK).set('X-Forwarded-Proto', 'https');
  if (cookie) t.set('Cookie', cookie);
  return body === undefined ? t : t.send(body);
};
const movs = async () => (await db.query('SELECT equipo_id, tipo_movimiento, descripcion, usuario FROM movimientos ORDER BY fecha, id'))[0];
const equipo = async (id) => (await db.query('SELECT * FROM equipos WHERE id = ?', [id]))[0][0];
async function nuevoEquipo(id, extra = {}) {
  const e = { tipo: 'Notebook', estado: 'Activo', ...extra };
  await db.query('INSERT INTO equipos (id, tipo, numero_inventario, marca, modelo, estado, ubicacion, fecha_adquisicion, fecha_baja_definitiva) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, e.tipo, e.numero_inventario ?? null, e.marca ?? null, e.modelo ?? null, e.estado, e.ubicacion ?? null, e.fecha_adquisicion ?? null, e.fecha_baja_definitiva ?? null]);
}
async function usuario(id, rol, nombre) {
  await db.query('INSERT INTO usuarios (id, email, password_hash, nombre, rol, habilitado) VALUES (?,?,?,?,?,1)',
    [id, `${id}@c.test`, await bcrypt.hash('clave-' + id, 4), nombre, rol]);
  return iniciarSesionComo(app, `${id}@c.test`, 'clave-' + id);
}

beforeAll(async () => {
  db = await crearDbDeTest();
  app = crearApp({ db, config: { corsOrigins: [OK], sessionSecret: 's', appUrl: OK } });
  c = { sa: await usuario('sa', 'super_admin', 'Sofi Super'), ad: await usuario('ad', 'admin', 'Ada Admin'),
    co: await usuario('co', 'coordinador', 'Carla Coord'), di: await usuario('di', 'director', 'Dani Dir') };
});
afterAll(() => limpiar(db));
beforeEach(async () => { await db.query('DELETE FROM movimientos'); await db.query('DELETE FROM equipos'); });

const ESCRITURAS = [
  ['post', '/api/equipos', { tipo: 'Notebook' }],
  ['patch', '/api/equipos/e1', { marca: 'X' }],
  ['post', '/api/equipos/e1/baja', {}],
  ['post', '/api/equipos/e1/baja-definitiva', {}],
  ['post', '/api/equipos/e1/restaurar', {}],
];
const RESTAURAR = '/api/equipos/e1/restaurar';
const LECTURAS = ['/api/equipos', '/api/equipos/e1', '/api/equipos/bajas-definitivas', '/api/equipos/e1/movimientos', '/api/movimientos'];

describe('permisos', () => {
  it('sin sesión: 401 en todo', async () => {
    for (const [m, u, b] of ESCRITURAS) expect((await llamar(m, u, null, b)).status, u).toBe(401);
    for (const u of LECTURAS) expect((await llamar('get', u)).status, u).toBe(401);
  });
  it('coordinador y director: 403 en toda escritura, no tocan nada', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1' });
    for (const k of ['co', 'di']) for (const [m, u, b] of ESCRITURAS) {
      const r = await llamar(m, u, c[k], b);
      expect(r.status, `${k} ${m} ${u}`).toBe(403);
      expect(r.body).toEqual({ error: 'No tenés permiso para realizar esta acción' });
    }
    expect((await equipo('e1')).estado).toBe('Activo');
    expect(await movs()).toEqual([]);
  });
  it('todos los roles leen', async () => {
    await nuevoEquipo('e1');
    for (const k of ['sa', 'ad', 'co', 'di']) for (const u of LECTURAS) expect((await llamar('get', u, c[k])).status, `${k} ${u}`).toBe(200);
  });
});

describe('POST /api/equipos', () => {
  it('alta como admin: 201, fila completa y movimiento Alta', async () => {
    const r = await llamar('post', '/api/equipos', c.ad, { numero_inventario: 'N-1', tipo: 'Desktop', marca: 'HP', modelo: null, fecha_adquisicion: '2024-03-05', ubicacion: 'HSM' });
    expect(r.status).toBe(201);
    expect(Object.keys(r.body).sort()).toEqual(COLS);
    expect(r.body).toMatchObject({ numero_inventario: 'N-1', tipo: 'Desktop', marca: 'HP', modelo: null, estado: 'Activo', fecha_adquisicion: '2024-03-05', garantia_hasta: null, fecha_baja_definitiva: null });
    expect(r.body.created_at).toMatch(ISO);
    expect(r.body.updated_at).toMatch(ISO);
    expect(await movs()).toEqual([{ equipo_id: r.body.id, tipo_movimiento: 'Alta', descripcion: 'Equipo dado de alta: N-1', usuario: 'Ada Admin' }]);
  });
  it('sin número de inventario se identifica por Tipo Marca Modelo', async () => {
    await llamar('post', '/api/equipos', c.sa, { tipo: 'Proyector', marca: 'Epson', modelo: 'X5' });
    expect((await movs())[0].descripcion).toBe('Equipo dado de alta: Proyector Epson X5');
  });
  it('validaciones: clave desconocida, estado inválido, sin tipo, fecha mala -> 400 y nada se escribe', async () => {
    for (const body of [{ tipo: 'A', foo: 1 }, { tipo: 'A', id: 'x' }, { tipo: 'A', estado: 'Roto' }, {}, { tipo: '' }, { tipo: 'A', fecha_adquisicion: '2024-13-45' }, { tipo: 'A', created_at: '2020-01-01' }]) {
      const r = await llamar('post', '/api/equipos', c.ad, body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(typeof r.body.error).toBe('string');
    }
    expect((await llamar('post', '/api/equipos', c.ad, { tipo: 'A', foo: 1 })).body.error).toBe('Campos no permitidos: foo');
    expect((await llamar('post', '/api/equipos', c.ad, { tipo: 'A', estado: 'Roto' })).body.error).toMatch(/^El estado debe ser uno de/);
    expect((await db.query('SELECT COUNT(*) n FROM equipos'))[0][0].n).toBe(0);
  });
});

describe('PATCH /api/equipos/:id', () => {
  it('modificación: descripcion con camposModificados exacto y respuesta con la fila', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1', marca: 'Dell', ubicacion: 'HSM' });
    const r = await llamar('patch', '/api/equipos/e1', c.ad, { numero_inventario: 'A1', marca: 'HP', ubicacion: null, fecha_adquisicion: '2024-01-02', modelo: null, estado: 'En reparación' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: 'e1', marca: 'HP', ubicacion: null, fecha_adquisicion: '2024-01-02', estado: 'En reparación' });
    expect(await movs()).toEqual([{ equipo_id: 'e1', tipo_movimiento: 'Modificación', usuario: 'Ada Admin',
      descripcion: 'Equipo modificado: A1 — Marca: "Dell" → "HP"; Sede: "HSM" → "–"; Fecha de adquisición: "–" → "2024-01-02"; Estado: "Activo" → "En reparación"' }]);
  });
  it('sin cambios: descripcion sin detalle', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1' });
    await llamar('patch', '/api/equipos/e1', c.sa, { numero_inventario: 'A1' });
    expect((await movs())[0].descripcion).toBe('Equipo modificado: A1');
  });
  it('404 y 400', async () => {
    await nuevoEquipo('e1');
    expect((await llamar('patch', '/api/equipos/nope', c.ad, { marca: 'X' })).status).toBe(404);
    expect((await llamar('patch', '/api/equipos/e1', c.ad, {})).status).toBe(400);
    expect((await llamar('patch', '/api/equipos/e1', c.ad, { marca: 'X', foo: 1 })).status).toBe(400);
    expect((await llamar('patch', '/api/equipos/e1', c.ad, { estado: 'Baja Definitiva' })).status).toBe(400);
    expect(await movs()).toEqual([]);
  });
});

describe('baja, baja definitiva, restaurar (R9)', () => {
  it('baja: Activo -> De baja con movimiento Baja; ya dado de baja -> 409', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1' });
    const r = await llamar('post', '/api/equipos/e1/baja', c.ad, {});
    expect(r.status).toBe(200);
    expect(r.body.estado).toBe('De baja');
    expect(await movs()).toEqual([{ equipo_id: 'e1', tipo_movimiento: 'Baja', descripcion: 'Equipo dado de baja: A1', usuario: 'Ada Admin' }]);
    // como el frontend: repetir la baja actualiza y registra otro movimiento (no es error)
    expect((await llamar('post', '/api/equipos/e1/baja', c.ad, {})).status).toBe(200);
    expect(await movs()).toHaveLength(2);
    await db.query("UPDATE equipos SET estado = 'Baja Definitiva' WHERE id = 'e1'");
    expect((await llamar('post', '/api/equipos/e1/baja', c.ad, {})).status).toBe(409);
    expect((await llamar('post', '/api/equipos/nope/baja', c.ad, {})).status).toBe(404);
  });
  it('baja definitiva desde Activo -> 409 y no cambia nada', async () => {
    await nuevoEquipo('e1');
    const r = await llamar('post', '/api/equipos/e1/baja-definitiva', c.sa, {});
    expect(r.status).toBe(409);
    expect(typeof r.body.error).toBe('string');
    expect((await equipo('e1')).estado).toBe('Activo');
    expect(await movs()).toEqual([]);
  });
  it('baja definitiva desde De baja -> 200 con estado, fecha, por y movimiento', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1', estado: 'De baja' });
    const r = await llamar('post', '/api/equipos/e1/baja-definitiva', c.ad, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: 'e1', estado: 'Baja Definitiva', dado_de_baja_definitiva_por: 'Ada Admin' });
    expect(r.body.fecha_baja_definitiva).toMatch(ISO);
    expect(Math.abs(Date.now() - new Date(r.body.fecha_baja_definitiva).getTime())).toBeLessThan(10 * 60 * 1000);
    expect(await movs()).toEqual([{ equipo_id: 'e1', tipo_movimiento: 'Baja Definitiva', descripcion: 'Equipo dado de baja definitiva: A1', usuario: 'Ada Admin' }]);
    expect((await llamar('post', '/api/equipos/e1/baja-definitiva', c.ad, {})).status).toBe(409);
    expect((await llamar('post', '/api/equipos/nope/baja-definitiva', c.ad, {})).status).toBe(404);
  });
  it('restaurar es solo de super_admin: admin 403 y la fila no cambia', async () => {
    await nuevoEquipo('e1', { estado: 'Baja Definitiva' });
    const r = await llamar('post', RESTAURAR, c.ad, {});
    expect(r.status).toBe(403);
    expect((await equipo('e1')).estado).toBe('Baja Definitiva');
    expect(await movs()).toEqual([]);
  });
  it('PATCH sobre Baja Definitiva -> 409 (no se restaura por esa vía)', async () => {
    await nuevoEquipo('e1', { estado: 'Baja Definitiva' });
    for (const body of [{ estado: 'Activo' }, { marca: 'X' }]) {
      const r = await llamar('patch', '/api/equipos/e1', c.sa, body);
      expect(r.status).toBe(409);
      expect(r.body).toEqual({ error: 'El equipo está dado de baja definitivamente' });
    }
    expect((await equipo('e1')).estado).toBe('Baja Definitiva');
    expect(await movs()).toEqual([]);
  });
  it('restaurar: solo desde Baja Definitiva -> Activo, movimiento Modificación', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1', estado: 'Baja Definitiva', fecha_baja_definitiva: '2025-01-02 03:04:05.678' });
    expect((await llamar('post', '/api/equipos/e1/restaurar', c.sa, {})).body.estado).toBe('Activo');
    expect(await movs()).toEqual([{ equipo_id: 'e1', tipo_movimiento: 'Modificación', descripcion: 'Equipo restaurado desde Bajas Definitivas: A1', usuario: 'Sofi Super' }]);
    expect((await llamar('post', '/api/equipos/e1/restaurar', c.sa, {})).status).toBe(409);
    expect((await llamar('post', '/api/equipos/nope/restaurar', c.sa, {})).status).toBe(404);
  });
  it('carrera: dos bajas definitivas simultáneas -> una 200 y una 409, un solo movimiento', async () => {
    await nuevoEquipo('e1', { estado: 'De baja' });
    const rs = await Promise.all([1, 2].map(() => llamar('post', '/api/equipos/e1/baja-definitiva', c.ad, {})));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await movs()).toHaveLength(1);
  });
});

describe('zona horaria UTC del pool (R26)', () => {
  it('cada conexión del pool queda en +00:00 aunque otra sesión use otra zona; movimientos.fecha es UTC', async () => {
    const mysql = (await import('mysql2/promise')).default;
    const raw = await mysql.createConnection({ host: process.env.TEST_DB_HOST || '127.0.0.1', port: Number(process.env.TEST_DB_PORT || 3306),
      user: process.env.TEST_DB_USER || 'stlukesit_test', password: process.env.TEST_DB_PASSWORD || 'test_local_pw' });
    try {
      await raw.query("SET time_zone = '-03:00'");
      const [[a]] = await raw.query('SELECT @@session.time_zone tz, UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) u, CURRENT_TIMESTAMP(3) t');
      expect(a.tz).toBe('-03:00');
    } finally { await raw.end(); }
    const conns = await Promise.all([db.getConnection(), db.getConnection(), db.getConnection()]);
    try {
      for (const cn of conns) expect((await cn.query('SELECT @@session.time_zone tz'))[0][0].tz).toBe('+00:00');
    } finally { conns.forEach((cn) => cn.release()); }
    const r = await llamar('post', '/api/equipos', c.ad, { tipo: 'Notebook' });
    const m = (await llamar('get', '/api/movimientos', c.ad)).body[0];
    expect(Math.abs(Date.now() - new Date(m.fecha).getTime())).toBeLessThan(10_000);
    expect(Math.abs(Date.now() - new Date(r.body.created_at).getTime())).toBeLessThan(10_000);
  });
});

describe('lecturas de equipos', () => {
  beforeEach(async () => {
    await nuevoEquipo('a', { numero_inventario: 'B2', ubicacion: 'HSM' });
    await nuevoEquipo('b', { numero_inventario: 'A1', ubicacion: 'Olivos', fecha_adquisicion: '2023-07-09' });
    await nuevoEquipo('n', { numero_inventario: null, ubicacion: 'HSM' });
    await nuevoEquipo('x', { numero_inventario: 'Z9', estado: 'Baja Definitiva', fecha_baja_definitiva: '2024-01-01 00:00:00.000' });
    await nuevoEquipo('y', { numero_inventario: 'Z8', estado: 'Baja Definitiva', fecha_baja_definitiva: '2025-06-01 10:00:00.123' });
  });
  it('listar excluye Baja Definitiva; ordenado=true ordena por inventario con NULL al final; sede filtra', async () => {
    const todos = await llamar('get', '/api/equipos', c.di);
    expect(todos.body.map((e) => e.id).sort()).toEqual(['a', 'b', 'n']);
    expect(Object.keys(todos.body[0]).sort()).toEqual(COLS);
    expect((await llamar('get', '/api/equipos?ordenado=true', c.di)).body.map((e) => e.id)).toEqual(['b', 'a', 'n']);
    expect((await llamar('get', '/api/equipos?ordenado=true&sede=HSM', c.di)).body.map((e) => e.id)).toEqual(['a', 'n']);
    expect((await llamar('get', '/api/equipos?ordenado=quizas', c.di)).status).toBe(400);
  });
  it('obtener: fechas DATE como YYYY-MM-DD, nulls y timestamps ISO; 404', async () => {
    const r = await llamar('get', '/api/equipos/b', c.co);
    expect(r.body).toMatchObject({ id: 'b', fecha_adquisicion: '2023-07-09', garantia_hasta: null, fecha_baja_definitiva: null, marca: null });
    expect(r.body.created_at).toMatch(ISO);
    expect((await llamar('get', '/api/equipos/nope', c.co)).status).toBe(404);
  });
  it('bajas-definitivas: solo esas, la más reciente primero, fecha ISO', async () => {
    const r = await llamar('get', '/api/equipos/bajas-definitivas', c.ad);
    expect(r.body.map((e) => e.id)).toEqual(['y', 'x']);
    expect(r.body[0].fecha_baja_definitiva).toBe('2025-06-01T10:00:00.123Z');
  });
});

describe('movimientos', () => {
  it('GET /api/movimientos: equipos anidado completo o null, más recientes primero, limite', async () => {
    await nuevoEquipo('e1', { numero_inventario: 'A1', ubicacion: 'HSM' });
    await db.query("INSERT INTO movimientos (id, equipo_id, tipo_movimiento, descripcion, usuario, fecha) VALUES ('m1','e1','Alta','d1','u','2025-01-01 10:00:00.000'),('m2',NULL,'Baja usuario','d2','u','2025-01-02 10:00:00.000'),('m3','e1','Baja','d3','u','2025-01-03 10:00:00.000')");
    const r = await llamar('get', '/api/movimientos', c.di);
    expect(r.status).toBe(200);
    expect(r.body.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
    expect(Object.keys(r.body[0]).sort()).toEqual(['descripcion', 'equipo_id', 'equipos', 'fecha', 'id', 'tipo_movimiento', 'usuario']);
    expect(r.body[0].fecha).toBe('2025-01-03T10:00:00.000Z');
    expect(Object.keys(r.body[0].equipos).sort()).toEqual(COLS);
    expect(r.body[0].equipos).toMatchObject({ id: 'e1', numero_inventario: 'A1', ubicacion: 'HSM' });
    expect(r.body[1].equipos).toBeNull();
    expect((await llamar('get', '/api/movimientos?limite=2', c.di)).body.map((m) => m.id)).toEqual(['m3', 'm2']);
    expect((await llamar('get', '/api/movimientos?limite=0', c.di)).status).toBe(400);
    expect((await llamar('get', '/api/movimientos?limite=abc', c.di)).status).toBe(400);
  });
  it('GET /api/equipos/:id/movimientos: solo los del equipo, recientes primero, sin equipos anidado; 404', async () => {
    await nuevoEquipo('e1'); await nuevoEquipo('e2');
    await db.query("INSERT INTO movimientos (id, equipo_id, tipo_movimiento, descripcion, usuario, fecha) VALUES ('m1','e1','Alta','d1','u','2025-01-01 10:00:00.000'),('m2','e2','Alta','d2','u','2025-01-02 10:00:00.000'),('m3','e1','Baja','d3','u','2025-01-03 10:00:00.000')");
    const r = await llamar('get', '/api/equipos/e1/movimientos', c.co);
    expect(r.body.map((m) => m.id)).toEqual(['m3', 'm1']);
    expect(Object.keys(r.body[0]).sort()).toEqual(['descripcion', 'equipo_id', 'fecha', 'id', 'tipo_movimiento', 'usuario']);
    expect((await llamar('get', '/api/equipos/nope/movimientos', c.co)).status).toBe(404);
  });
  it('no existe POST /api/movimientos (registrar standalone no se usa)', async () => {
    expect((await llamar('post', '/api/movimientos', c.ad, { tipo_movimiento: 'Alta' })).status).toBe(404);
  });
});
