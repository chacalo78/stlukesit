import { describe, it, expect } from 'vitest';
import { aMysql, aPostgres } from '../scripts/lib/transformar.js';

const ID = '11111111-1111-4111-8111-111111111111';
const EQ = '22222222-2222-4222-8222-222222222222';

describe('aMysql (Postgres -> MySQL)', () => {
  it('prestamos: la fecha (date) queda igual y el timestamptz pasa a UTC DATETIME(3)', () => {
    const [f] = aMysql('prestamos', [{
      id: ID, equipo_id: EQ, persona: 'Ana', sector: null,
      fecha_prestamo: '2026-11-10', fecha_devolucion_estimada: '2026-11-12',
      fecha_devolucion_real: '2026-11-10T23:30:00-03:00',
      observaciones_entrega: null, registrado_por: null, created_at: '2026-11-10T10:00:00Z',
      observaciones_devolucion: null, email_destinatario: null,
    }]);
    expect(f.fecha_prestamo).toBe('2026-11-10');
    expect(f.fecha_devolucion_real).toBe('2026-11-11 02:30:00.000');
    expect(f.created_at).toBe('2026-11-10 10:00:00.000');
  });

  it('acepta objetos Date y trunca microsegundos a milisegundos', () => {
    const [f] = aMysql('repuestos', [{
      id: ID, categoria: 'Otro', marca: null, modelo: null, cantidad: 1, ubicacion: null, observaciones: null,
      created_at: new Date('2026-01-02T03:04:05.678Z'), updated_at: '2026-01-02 03:04:05.123456+00',
    }]);
    expect(f.created_at).toBe('2026-01-02 03:04:05.678');
    expect(f.updated_at).toBe('2026-01-02 03:04:05.123');
  });

  it('texto con acentos idéntico', () => {
    const [f] = aMysql('movimientos', [{
      id: ID, equipo_id: EQ, tipo_movimiento: 'Préstamo', descripcion: 'Préstamo — Ñandú', usuario: 'x', fecha: '2026-01-01T00:00:00Z',
    }]);
    expect(f.descripcion).toBe('Préstamo — Ñandú');
    expect(f.tipo_movimiento).toBe('Préstamo');
  });

  it('solicitudes_cambio: jsonb -> texto JSON', () => {
    const [f] = aMysql('solicitudes_cambio', [{
      id: ID, tipo_accion: 'Alta', equipo_id: null, datos_propuestos: { b: 1, a: 'ñ' }, datos_anteriores: null,
      estado: 'Pendiente', solicitado_por: null, solicitado_por_email: null, fecha_solicitud: '2026-01-01T00:00:00Z',
      resuelto_por: null, fecha_resolucion: null, comentario_resolucion: null,
    }]);
    expect(JSON.parse(f.datos_propuestos)).toEqual({ a: 'ñ', b: 1 });
    expect(f.datos_anteriores).toBeNull();
  });

  it('usuarios: id = user_roles.id, hash de auth.users por email (sin distinguir mayúsculas), sin login -> null', () => {
    const roles = [
      { id: ID, email: 'Ana@x.com', rol: 'admin', nombre: 'Ana', sede: 'Central', habilitado: true, created_at: '2026-01-01T00:00:00Z' },
      { id: EQ, email: 'sin@login.com', rol: 'director', nombre: null, sede: null, habilitado: false, created_at: '2026-01-01T00:00:00Z' },
    ];
    const auth = [{ id: 'zzz', email: 'ana@x.com', encrypted_password: '$2a$10$abc' }];
    const [a, b] = aMysql('usuarios', roles, { authUsers: auth });
    expect(a.id).toBe(ID);
    expect(a.password_hash).toBe('$2a$10$abc');
    expect(a.habilitado).toBe(1);
    expect(b.password_hash).toBeNull();
    expect(b.habilitado).toBe(0);
  });
});

describe('aPostgres (MySQL -> Postgres)', () => {
  it('DATETIME(3) UTC vuelve como ISO UTC y la fecha queda igual', () => {
    const [f] = aPostgres('prestamos', [{
      id: ID, equipo_id: EQ, persona: 'Ana', sector: null,
      fecha_prestamo: '2026-11-10', fecha_devolucion_estimada: '2026-11-12',
      fecha_devolucion_real: '2026-11-11 02:30:00.000',
      observaciones_entrega: null, registrado_por: null, created_at: '2026-11-10 10:00:00.000',
      observaciones_devolucion: null, email_destinatario: null,
    }]);
    expect(f.fecha_devolucion_real).toBe('2026-11-11T02:30:00.000Z');
    expect(new Date(f.fecha_devolucion_real).toISOString()).toBe('2026-11-11T02:30:00.000Z');
    expect(f.fecha_prestamo).toBe('2026-11-10');
  });

  it('JSON como string u objeto -> objeto; usuarios -> user_roles con booleano', () => {
    const base = {
      id: ID, tipo_accion: 'Alta', equipo_id: null, datos_anteriores: null, estado: 'Pendiente',
      solicitado_por: null, solicitado_por_email: null, fecha_solicitud: '2026-01-01 00:00:00.000',
      resuelto_por: null, fecha_resolucion: null, comentario_resolucion: null,
    };
    const [s, o] = aPostgres('solicitudes_cambio', [
      { ...base, datos_propuestos: '{"a":"ñ"}' }, { ...base, datos_propuestos: { a: 'ñ' } },
    ]);
    expect(s.datos_propuestos).toEqual({ a: 'ñ' });
    expect(o.datos_propuestos).toEqual({ a: 'ñ' });
    const [u] = aPostgres('usuarios', [{
      id: ID, email: 'a@x.com', password_hash: 'h', nombre: 'A', rol: 'admin', sede: null, habilitado: 1,
      created_at: '2026-01-01 00:00:00.000', updated_at: '2026-01-02 00:00:00.000',
    }]);
    expect(u.habilitado).toBe(true);
    expect(u).not.toHaveProperty('password_hash');
    expect(u).not.toHaveProperty('updated_at');
  });
});

// ---- Integración: requiere Postgres local con la copia y MariaDB local (ver test/helpers.js) ----
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll } from 'vitest';
import { crearDbDeTest, limpiar } from './helpers.js';
import { migrar } from '../scripts/migrar.js';
import { verificar } from '../scripts/verificar.js';

const PG_COPIA = process.env.TEST_PG_COPIA_URL || 'postgresql://stlukesit_pg:pg_local_pw@127.0.0.1:5432/stlukesit_pg_copia';
const urlDe = (base, db) => { const u = new URL(base); u.pathname = `/${db}`; return u.toString(); };
const mysqlUrl = (pool) => {
  const c = pool.pool.config.connectionConfig;
  return `mysql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.password)}@${c.host}:${c.port}/${c.database}`;
};
const silencio = { log: () => {}, warn: () => {} };

async function pgAdmin(fn, base = PG_COPIA) {
  const c = new pg.Client({ connectionString: urlDe(base, 'postgres') });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

describe('integración: migración completa', () => {
  let pool, urlMy, nombreClon, urlClon;
  beforeAll(async () => {
    pool = await crearDbDeTest();
    urlMy = mysqlUrl(pool);
  });
  afterAll(async () => {
    if (nombreClon) await pgAdmin((c) => c.query(`DROP DATABASE IF EXISTS "${nombreClon}"`));
    await limpiar(pool);
  });

  it('Postgres (copia) -> MySQL: verificar OK en todas las tablas; fechas y acentos exactos', async () => {
    const avisos = [];
    await migrar({ desde: 'supabase', hacia: 'mysql', pgUrl: PG_COPIA, mysqlUrl: urlMy, log: () => {}, warn: (m) => avisos.push(m) });
    const res = await verificar({ pgUrl: PG_COPIA, mysqlUrl: urlMy });
    expect(res.map((r) => r.tabla).sort()).toEqual(
      ['equipos', 'feedback_desarrollador', 'movimientos', 'prestamos', 'repuestos', 'solicitudes_cambio', 'usuarios']);
    for (const r of res) expect(r, r.tabla).toMatchObject({ ok: true });
    expect(res.find((r) => r.tabla === 'equipos').mysql).toBeGreaterThan(0);
    // Idempotente: una segunda corrida deja lo mismo.
    await migrar({ desde: 'supabase', hacia: 'mysql', pgUrl: PG_COPIA, mysqlUrl: urlMy, ...silencio });
    for (const r of await verificar({ pgUrl: PG_COPIA, mysqlUrl: urlMy })) expect(r.ok, r.tabla).toBe(true);
  });

  it('verificar detecta diferencias (DIFERENCIA en la tabla alterada, OK en las demás)', async () => {
    await migrar({ desde: 'supabase', hacia: 'mysql', pgUrl: PG_COPIA, mysqlUrl: urlMy, ...silencio });
    await pool.query("UPDATE repuestos SET cantidad = cantidad + 1 LIMIT 1");
    const res = await verificar({ pgUrl: PG_COPIA, mysqlUrl: urlMy });
    expect(res.filter((r) => !r.ok).map((r) => r.tabla)).toEqual(['repuestos']);
  });

  it('ida y vuelta: Postgres -> MySQL -> clon de Postgres; verificar OK contra clon y contra el original', async () => {
    nombreClon = `stlukesit_pg_test_${randomBytes(5).toString('hex')}`;
    await pgAdmin((c) => c.query(`CREATE DATABASE "${nombreClon}" TEMPLATE stlukesit_pg_copia`));
    urlClon = urlDe(PG_COPIA, nombreClon);

    await migrar({ desde: 'supabase', hacia: 'mysql', pgUrl: PG_COPIA, mysqlUrl: urlMy, ...silencio });
    const antes = await contar(urlClon);
    await migrar({ desde: 'mysql', hacia: 'supabase', pgUrl: urlClon, mysqlUrl: urlMy, ...silencio });
    expect(await contar(urlClon)).toEqual(antes); // auth.users y aprobaciones intactos

    for (const url of [urlClon, PG_COPIA]) {
      for (const r of await verificar({ pgUrl: url, mysqlUrl: urlMy })) expect(r.ok, r.tabla).toBe(true);
    }

    // Cambio de contraseña posterior al corte: solo se actualiza encrypted_password del que ya existe.
    const [{ email }] = await consulta(urlClon, 'SELECT email FROM auth.users ORDER BY email LIMIT 1');
    const my = await (await import('mysql2/promise')).createConnection(urlMy);
    await my.query('UPDATE usuarios SET password_hash = ? WHERE email = ?', ['$2a$12$nuevoHashDePrueba................................................', email]);
    await my.end();
    await migrar({ desde: 'mysql', hacia: 'supabase', pgUrl: urlClon, mysqlUrl: urlMy, ...silencio });
    const [{ encrypted_password: ep }] = await consulta(urlClon, 'SELECT encrypted_password FROM auth.users WHERE email = $1', [email]);
    expect(ep).toMatch(/^\$2a\$12\$nuevoHash/);
    expect(await contar(urlClon)).toEqual(antes);
  });
});

async function consulta(url, sql, params) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
}
async function contar(url) {
  const [r] = await consulta(url, `SELECT (SELECT count(*) FROM auth.users) AS auth, (SELECT count(*) FROM aprobaciones) AS aprob`);
  return r;
}
