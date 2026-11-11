import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { crearApp } from '../src/app.js';
import { errorHttp } from '../src/errores.js';
import { crearDbDeTest, limpiar } from './helpers.js';

const OK = 'https://inventario.chacalo.com.ar';
let db, app;

beforeAll(async () => {
  db = await crearDbDeTest();
  app = crearApp({ db, mailer: null, config: { corsOrigins: [OK], sessionSecret: 'secreto-de-test' } });
});
afterAll(() => limpiar(db));

describe('health', () => {
  it('GET /health -> 200 {ok:true, db:true}', async () => {
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, db: true });
  });
  it('503 si la base falla', async () => {
    const roto = crearApp({ db: { query: async () => { throw new Error('x'); } }, config: { corsOrigins: [OK], sessionSecret: 'secreto-de-test' } });
    const r = await request(roto).get('/health');
    expect(r.status).toBe(503);
    expect(r.body.ok).toBe(false);
  });
});

describe('Origin y Content-Type en escrituras', () => {
  it('Origin no permitido -> 403 (antes que 404)', async () => {
    const r = await request(app).post('/api/cualquier-cosa').set('Origin', 'https://evil.example').set('Content-Type', 'application/json').send({});
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'Origen no permitido' });
  });
  it('escritura sin Origin -> 403', async () => {
    const r = await request(app).post('/api/x').set('Content-Type', 'application/json').send({});
    expect(r.status).toBe(403);
  });
  it('origen válido + JSON en ruta inexistente -> 404', async () => {
    const r = await request(app).post('/api/x').set('Origin', OK).send({});
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'No encontrado' });
  });
  it('origen válido + text/plain -> 415', async () => {
    const r = await request(app).post('/api/x').set('Origin', OK).set('Content-Type', 'text/plain').send('hola');
    expect(r.status).toBe(415);
    expect(typeof r.body.error).toBe('string');
  });
  it('DELETE sin cuerpo con origen válido pasa el chequeo (404)', async () => {
    const r = await request(app).delete('/api/x').set('Origin', OK);
    expect(r.status).toBe(404);
  });
  it('POST sin cuerpo pasa el chequeo (404)', async () => {
    const r = await request(app).post('/api/x').set('Origin', OK);
    expect(r.status).toBe(404);
  });
  it('POST con application/json; charset=utf-8 pasa', async () => {
    const r = await request(app).post('/api/x').set('Origin', OK).set('Content-Type', 'Application/JSON; charset=utf-8').send('{"a":1}');
    expect(r.status).toBe(404);
  });
  it.each(['put', 'patch'])('%s con cuerpo text/plain -> 415', async (m) => {
    const r = await request(app)[m]('/api/x').set('Origin', OK).set('Content-Type', 'text/plain').send('hola');
    expect(r.status).toBe(415);
  });
  it('Vary: Origin también con origen no permitido', async () => {
    const r = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(r.headers.vary).toMatch(/Origin/);
  });
  it('JSON malformado -> 400', async () => {
    const r = await request(app).post('/api/x').set('Origin', OK).set('Content-Type', 'application/json').send('{mal');
    expect(r.status).toBe(400);
    expect(typeof r.body.error).toBe('string');
  });
});

describe('CORS', () => {
  it('preflight desde origen permitido', async () => {
    const r = await request(app).options('/api/x').set('Origin', OK).set('Access-Control-Request-Method', 'POST');
    expect(r.headers['access-control-allow-origin']).toBe(OK);
    expect(r.headers['access-control-allow-credentials']).toBe('true');
    expect(r.status).toBe(204);
  });
  it('origen no permitido sin ACAO', async () => {
    const r = await request(app).options('/api/x').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('GET desde origen permitido lleva ACAO', async () => {
    const r = await request(app).get('/health').set('Origin', OK);
    expect(r.headers['access-control-allow-origin']).toBe(OK);
  });
});

describe('errores', () => {
  it('GET desconocido -> 404', async () => {
    const r = await request(app).get('/nada');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'No encontrado' });
  });
  it('500 no filtra el mensaje; errorHttp respeta status', async () => {
    const a = crearApp({ db, config: { corsOrigins: [OK], sessionSecret: 'secreto-de-test' }, extra: (ap) => {
      ap.get('/boom', () => { throw new Error('secreto interno'); });
      ap.get('/conflicto', () => { throw errorHttp(409, 'Ya existe'); });
    } });
    const r1 = await request(a).get('/boom');
    expect(r1.status).toBe(500);
    expect(r1.body).toEqual({ error: 'Error interno del servidor' });
    const r2 = await request(a).get('/conflicto');
    expect(r2.status).toBe(409);
    expect(r2.body).toEqual({ error: 'Ya existe' });
  });
});

describe('diagnóstico de proxy', () => {
  const cfg = (extra) => ({ corsOrigins: [OK], sessionSecret: 'secreto-de-test', ...extra });
  it('apagado: 404', async () => {
    const r = await request(crearApp({ db, config: cfg({ diagnostico: false }) })).get('/api/diagnostico');
    expect(r.status).toBe(404);
  });
  it('encendido: protocolo, ip y seguro según X-Forwarded-*', async () => {
    const a = crearApp({ db, config: cfg({ diagnostico: true, trustProxy: 1 }) });
    const r = await request(a).get('/api/diagnostico').set('X-Forwarded-Proto', 'https').set('X-Forwarded-For', '203.0.113.9');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ protocolo: 'https', ip: '203.0.113.9', seguro: true });
  });
  it('trustProxy 0: ignora X-Forwarded-*', async () => {
    const a = crearApp({ db, config: cfg({ diagnostico: true, trustProxy: 0 }) });
    const r = await request(a).get('/api/diagnostico').set('X-Forwarded-Proto', 'https');
    expect(r.body.protocolo).toBe('http');
    expect(r.body.seguro).toBe(false);
  });
});

describe('log del error 500', () => {
  it('no incluye datos del request ni sql/sqlMessage; sí método, ruta, code y errno', async () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const a = crearApp({
        db, config: { corsOrigins: [OK], sessionSecret: 'secreto-de-test' },
        extra: (app) => app.post('/api/boom', (req, res, next) => {
          const e = new Error("Duplicate entry 'secreto@x.com'");
          Object.assign(e, { code: 'ER_DUP_ENTRY', errno: 1062, sql: "INSERT INTO u VALUES ('secreto@x.com','$2a$hash')", sqlMessage: "Duplicate entry 'secreto@x.com'" });
          next(e);
        }),
      });
      const r = await request(a).post('/api/boom?token=abc123').set('Origin', OK).set('Content-Type', 'application/json')
        .send({ email: 'secreto@x.com', password_hash: '$2a$hash' });
      expect(r.status).toBe(500);
      const log = espia.mock.calls.flat().map(String).join('\n');
      expect(log).toContain('POST /api/boom');
      expect(log).toContain('ER_DUP_ENTRY');
      expect(log).toContain('1062');
      for (const v of ['secreto@x.com', '$2a$hash', 'abc123', 'INSERT']) expect(log).not.toContain(v);
    } finally { espia.mockRestore(); }
  });
});
