import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { crearApp } from '../src/app.js';
import { crearDbDeTest, limpiar, iniciarSesionComo, crearMailerFalso } from './helpers.js';

const OK = 'https://inventario.chacalo.com.ar';
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const SIN_PERMISO = { error: 'No tenés permiso para realizar esta acción' };
let db, app, c;

const llamar = (metodo, url, cookie, body) => {
  const t = request(app)[metodo](url).set('Origin', OK).set('X-Forwarded-Proto', 'https');
  if (cookie) t.set('Cookie', cookie);
  return body === undefined ? t : t.send(body);
};
async function usuario(id, rol, nombre) {
  await db.query('INSERT INTO usuarios (id, email, password_hash, nombre, rol, habilitado) VALUES (?,?,?,?,?,1)',
    [id, `${id}@c.test`, await bcrypt.hash('clave-' + id, 4), nombre, rol]);
  return iniciarSesionComo(app, `${id}@c.test`, 'clave-' + id);
}
const filas = async (t) => (await db.query(`SELECT * FROM ${t}`))[0];

beforeAll(async () => {
  db = await crearDbDeTest();
  app = crearApp({ db, mailer: crearMailerFalso(), config: { corsOrigins: [OK], sessionSecret: 's', appUrl: OK } });
  c = { sa: await usuario('sa', 'super_admin', 'Sofi Super'), ad: await usuario('ad', 'admin', 'Ada Admin'),
    co: await usuario('co', 'coordinador', 'Carla Coord'), di: await usuario('di', 'director', 'Dani Dir') };
});
afterAll(() => limpiar(db));
beforeEach(async () => {
  for (const t of ['repuestos', 'feedback_desarrollador', 'movimientos', 'equipos']) await db.query(`DELETE FROM ${t}`);
});

describe('repuestos', () => {
  const sembrar = (id, categoria, extra = {}) => db.query('INSERT INTO repuestos (id, categoria, marca, modelo, cantidad, ubicacion) VALUES (?,?,?,?,?,?)',
    [id, categoria, extra.marca ?? null, extra.modelo ?? null, extra.cantidad ?? 1, extra.ubicacion ?? null]);

  it('sin sesión 401; coordinador y director 403 en todas las rutas', async () => {
    expect((await llamar('get', '/api/repuestos')).status).toBe(401);
    await sembrar('r1', 'RAM');
    for (const cookie of [c.co, c.di]) {
      for (const [m, u, b] of [['get', '/api/repuestos'], ['post', '/api/repuestos', { categoria: 'RAM' }], ['patch', '/api/repuestos/r1', { cantidad: 2 }], ['delete', '/api/repuestos/r1']]) {
        const r = await llamar(m, u, cookie, b);
        expect(r.status, `${m} ${u}`).toBe(403);
        expect(r.body).toEqual(SIN_PERMISO);
      }
    }
    expect((await filas('repuestos'))[0]).toMatchObject({ id: 'r1', cantidad: 1 });
  });
  it('GET: ordenado por categoría asc, con timestamps ISO Z', async () => {
    await sembrar('r1', 'RAM'); await sembrar('r2', 'Batería'); await sembrar('r3', 'Disco');
    const r = await llamar('get', '/api/repuestos', c.ad);
    expect(r.status).toBe(200);
    expect(r.body.map((x) => x.categoria)).toEqual(['Batería', 'Disco', 'RAM']);
    expect(r.body[0].created_at).toMatch(ISO);
    expect(r.body[0].updated_at).toMatch(ISO);
    expect(Object.keys(r.body[0]).sort()).toEqual(['cantidad', 'categoria', 'created_at', 'id', 'marca', 'modelo', 'observaciones', 'ubicacion', 'updated_at']);
  });
  it('POST: crea con los defaults del frontend (categoría Otro), 201 y fila', async () => {
    const r = await llamar('post', '/api/repuestos', c.sa, { marca: 'Kingston', modelo: 'DDR4', cantidad: 3, ubicacion: 'Sede Central', observaciones: 'x' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ categoria: 'Otro', marca: 'Kingston', modelo: 'DDR4', cantidad: 3, ubicacion: 'Sede Central', observaciones: 'x' });
    expect(r.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await filas('repuestos')).toHaveLength(1);
    expect(await filas('movimientos')).toEqual([]); // el frontend no registra movimientos de repuestos
  });
  it('POST: vacíos -> NULL y categoría vacía -> Otro; id/created_at del cliente se rechazan', async () => {
    const r = await llamar('post', '/api/repuestos', c.ad, { categoria: '', marca: '', modelo: '', ubicacion: '', observaciones: '' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ categoria: 'Otro', marca: null, modelo: null, ubicacion: null, observaciones: null, cantidad: 1 });
    const x = await llamar('post', '/api/repuestos', c.ad, { categoria: 'RAM', id: 'mio' });
    expect(x.status).toBe(400);
    expect(x.body.error).toMatch(/Campos no permitidos/);
  });
  it.each([[-1], [1.5], ['3'], [null], [1e10]])('cantidad %j -> 400', async (cantidad) => {
    expect((await llamar('post', '/api/repuestos', c.ad, { categoria: 'RAM', cantidad })).status).toBe(400);
    expect(await filas('repuestos')).toEqual([]);
  });
  it('cantidad 0 es válida', async () => {
    expect((await llamar('post', '/api/repuestos', c.ad, { categoria: 'RAM', cantidad: 0 })).body.cantidad).toBe(0);
  });
  it('PATCH: actualiza solo lo enviado y devuelve la fila; 404, 400 sin datos o cantidad inválida', async () => {
    await sembrar('r1', 'RAM', { marca: 'A', cantidad: 5 });
    const r = await llamar('patch', '/api/repuestos/r1', c.ad, { cantidad: 7, observaciones: 'nuevo' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: 'r1', categoria: 'RAM', marca: 'A', cantidad: 7, observaciones: 'nuevo' });
    expect((await llamar('patch', '/api/repuestos/nope', c.ad, { cantidad: 1 })).status).toBe(404);
    expect((await llamar('patch', '/api/repuestos/r1', c.ad, {})).status).toBe(400);
    expect((await llamar('patch', '/api/repuestos/r1', c.ad, { cantidad: -2 })).status).toBe(400);
    expect((await filas('repuestos'))[0].cantidad).toBe(7);
  });
  it('DELETE: borra; 404 si no existe', async () => {
    await sembrar('r1', 'RAM');
    expect((await llamar('delete', '/api/repuestos/r1', c.ad)).status).toBe(200);
    expect(await filas('repuestos')).toEqual([]);
    expect((await llamar('delete', '/api/repuestos/r1', c.ad)).status).toBe(404);
  });
});

describe('feedback', () => {
  const sembrar = (id, extra = {}) => db.query('INSERT INTO feedback_desarrollador (id, tipo, seccion, asunto, descripcion, estado, reportado_por, reportado_por_email, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [id, 'Error', 'Equipos', 'a', 'd', extra.estado ?? 'Nuevo', 'X', 'x@c.test', extra.creado ?? '2026-11-01 10:00:00.000']);
  const BODY = { tipo: 'Falla', seccion: 'Equipos', asunto: ' No abre ', descripcion: ' Se cuelga al guardar ' };

  it('sin sesión 401', async () => {
    expect((await llamar('get', '/api/feedback')).status).toBe(401);
    expect((await llamar('post', '/api/feedback', undefined, BODY)).status).toBe(401);
  });
  it('crear lo pueden hacer los cuatro roles; director con email ajeno -> se fuerza el suyo', async () => {
    for (const [k, cookie, nombre] of [['sa', c.sa, 'Sofi Super'], ['ad', c.ad, 'Ada Admin'], ['co', c.co, 'Carla Coord'], ['di', c.di, 'Dani Dir']]) {
      const r = await llamar('post', '/api/feedback', cookie, { ...BODY, reportado_por_email: 'ad@c.test', reportado_por: 'Otra Persona', estado: 'Resuelto', id: 'mio', created_at: '2020-01-01' });
      expect(r.status, k).toBe(201);
      expect(r.body).toMatchObject({ tipo: 'Falla', seccion: 'Equipos', asunto: 'No abre', descripcion: 'Se cuelga al guardar', estado: 'Nuevo',
        reportado_por: nombre, reportado_por_email: `${k}@c.test` });
      expect(r.body.id).not.toBe('mio');
      expect(r.body.created_at).toMatch(ISO);
      expect(r.body.created_at.startsWith('2020')).toBe(false);
    }
  });
  it('reportado_por cae al email si el usuario no tiene nombre', async () => {
    await db.query("UPDATE usuarios SET nombre = NULL WHERE id = 'di'");
    const r = await llamar('post', '/api/feedback', c.di, BODY);
    await db.query("UPDATE usuarios SET nombre = 'Dani Dir' WHERE id = 'di'");
    expect(r.body).toMatchObject({ reportado_por: 'di@c.test', reportado_por_email: 'di@c.test' });
  });
  it.each([
    ['tipo inválido', { tipo: 'Otro' }], ['sin tipo', { tipo: undefined }], ['sin sección', { seccion: undefined }],
    ['asunto en blanco', { asunto: '   ' }], ['sin descripción', { descripcion: undefined }],
  ])('%s -> 400', async (_n, cambio) => {
    const r = await llamar('post', '/api/feedback', c.di, { ...BODY, ...cambio });
    expect(r.status).toBe(400);
    expect(await filas('feedback_desarrollador')).toEqual([]);
  });
  it('los tres tipos son válidos', async () => {
    for (const tipo of ['Error', 'Falla', 'Mejora']) expect((await llamar('post', '/api/feedback', c.co, { ...BODY, tipo })).status).toBe(201);
  });
  it('listar: solo super_admin y admin; más recientes primero', async () => {
    await sembrar('f1', { creado: '2026-11-01 10:00:00.000' }); await sembrar('f2', { creado: '2026-11-02 10:00:00.000' });
    for (const cookie of [c.co, c.di]) {
      const r = await llamar('get', '/api/feedback', cookie);
      expect(r.status).toBe(403);
      expect(r.body).toEqual(SIN_PERMISO);
    }
    for (const cookie of [c.sa, c.ad]) {
      const r = await llamar('get', '/api/feedback', cookie);
      expect(r.status).toBe(200);
      expect(r.body.map((f) => f.id)).toEqual(['f2', 'f1']);
      expect(r.body[0].created_at).toBe('2026-11-02T10:00:00.000Z');
    }
  });
  it('PATCH estado: solo super_admin; admin/coordinador/director 403', async () => {
    await sembrar('f1');
    for (const cookie of [c.ad, c.co, c.di]) {
      const r = await llamar('patch', '/api/feedback/f1', cookie, { estado: 'Resuelto' });
      expect(r.status).toBe(403);
      expect(r.body).toEqual(SIN_PERMISO);
    }
    expect((await filas('feedback_desarrollador'))[0].estado).toBe('Nuevo');
    const r = await llamar('patch', '/api/feedback/f1', c.sa, { estado: 'Resuelto' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: 'f1', estado: 'Resuelto', asunto: 'a' });
    expect((await llamar('patch', '/api/feedback/f1', c.sa, { estado: 'Nuevo' })).body.estado).toBe('Nuevo');
  });
  it('PATCH: estado inválido 400, otros campos rechazados, inexistente 404', async () => {
    await sembrar('f1');
    expect((await llamar('patch', '/api/feedback/f1', c.sa, { estado: 'Cerrado' })).status).toBe(400);
    expect((await llamar('patch', '/api/feedback/f1', c.sa, {})).status).toBe(400);
    const x = await llamar('patch', '/api/feedback/f1', c.sa, { estado: 'Resuelto', asunto: 'hack' });
    expect(x.status).toBe(400);
    expect((await filas('feedback_desarrollador'))[0].asunto).toBe('a');
    expect((await llamar('patch', '/api/feedback/nope', c.sa, { estado: 'Resuelto' })).status).toBe(404);
  });
  it('no existe DELETE (el frontend nunca llama feedback.eliminar)', async () => {
    await sembrar('f1');
    expect((await llamar('delete', '/api/feedback/f1', c.sa)).status).toBe(404);
    expect(await filas('feedback_desarrollador')).toHaveLength(1);
  });
});

describe('GET /api/exportar', () => {
  it('sin sesión 401; coordinador y director 403', async () => {
    expect((await llamar('get', '/api/exportar')).status).toBe(401);
    for (const cookie of [c.co, c.di]) {
      const r = await llamar('get', '/api/exportar', cookie);
      expect(r.status).toBe(403);
      expect(r.body).toEqual(SIN_PERMISO);
    }
  });
  it('super_admin y admin: { equipos } con todos (incluida Baja Definitiva), por n° de inventario, NULL al final', async () => {
    const ins = (id, inv, estado) => db.query('INSERT INTO equipos (id, tipo, numero_inventario, estado, fecha_adquisicion) VALUES (?,?,?,?,?)', [id, 'PC', inv, estado, '2026-01-05']);
    await ins('e3', null, 'Activo'); await ins('e2', 'B-2', 'Baja Definitiva'); await ins('e1', 'A-1', 'Activo');
    for (const cookie of [c.sa, c.ad]) {
      const r = await llamar('get', '/api/exportar', cookie);
      expect(r.status).toBe(200);
      expect(Object.keys(r.body)).toEqual(['equipos']);
      expect(r.body.equipos.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
      expect(r.body.equipos[0].fecha_adquisicion).toBe('2026-01-05');
      expect(r.body.equipos[0].created_at).toMatch(ISO);
      expect(Object.keys(r.body.equipos[0])).toContain('fecha_baja_definitiva');
    }
  });
  it('base vacía -> { equipos: [] }', async () => {
    expect((await llamar('get', '/api/exportar', c.ad)).body).toEqual({ equipos: [] });
  });
});
