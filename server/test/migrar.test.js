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
import { randomBytes, randomUUID } from 'node:crypto';
import mysql2 from 'mysql2/promise';
import pg from 'pg';
import { afterAll, beforeAll } from 'vitest';
import { crearDbDeTest, limpiar } from './helpers.js';
import { migrar } from '../scripts/migrar.js';
import { verificar } from '../scripts/verificar.js';

const PG_COPIA = process.env.TEST_PG_COPIA_URL || 'postgresql://stlukesit_pg:pg_local_pw@127.0.0.1:5432/stlukesit_pg_copia';
const urlDe = (base, db) => { const u = new URL(base); u.pathname = `/${db}`; return u.toString(); };
const nombreDe = (url) => new URL(url).pathname.slice(1);
const mysqlUrl = (pool) => {
  const c = pool.pool.config.connectionConfig;
  return `mysql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.password)}@${c.host}:${c.port}/${c.database}`;
};
const silencio = { log: () => {}, warn: () => {} };

async function pgAdmin(fn) {
  const c = new pg.Client({ connectionString: urlDe(PG_COPIA, 'postgres') });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
async function consulta(url, sql, params) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
}
async function contar(url) {
  const [r] = await consulta(url, 'SELECT (SELECT count(*) FROM auth.users) AS auth, (SELECT count(*) FROM aprobaciones) AS aprob');
  return r;
}
const dif = (res) => res.filter((r) => !r.ok).map((r) => r.tabla).sort();

describe('integración: migración completa', () => {
  let pool, urlMy, nombreMy;
  const clones = [];
  async function clonar() {
    const nombre = `stlukesit_pg_test_${randomBytes(5).toString('hex')}`;
    await pgAdmin((c) => c.query(`CREATE DATABASE "${nombre}" TEMPLATE stlukesit_pg_copia`));
    clones.push(nombre);
    return urlDe(PG_COPIA, nombre);
  }
  const ida = (pgUrl, extra = {}) => migrar({ desde: 'supabase', hacia: 'mysql', pgUrl, mysqlUrl: urlMy, confirmar: nombreMy, forzar: true, ...silencio, ...extra });
  const vuelta = (pgUrl, extra = {}) => migrar({ desde: 'mysql', hacia: 'supabase', pgUrl, mysqlUrl: urlMy, confirmar: nombreDe(pgUrl), forzar: true, ...silencio, ...extra });
  async function conMy(fn) {
    const c = await mysql2.createConnection(urlMy);
    try { return await fn(c); } finally { await c.end(); }
  }

  beforeAll(async () => {
    pool = await crearDbDeTest();
    urlMy = mysqlUrl(pool);
    nombreMy = pool.nombreDbTest;
  });
  afterAll(async () => {
    for (const n of clones) await pgAdmin((c) => c.query(`DROP DATABASE IF EXISTS "${n}"`));
    await limpiar(pool);
  });

  it('Postgres (copia) -> MySQL: verificar OK en todas las tablas; idempotente', async () => {
    await ida(PG_COPIA);
    const res = await verificar({ pgUrl: PG_COPIA, mysqlUrl: urlMy });
    expect(res.map((r) => r.tabla).sort()).toEqual(
      ['equipos', 'feedback_desarrollador', 'movimientos', 'prestamos', 'repuestos', 'solicitudes_cambio', 'usuarios']);
    for (const r of res) expect(r, r.tabla).toMatchObject({ ok: true });
    expect(res.find((r) => r.tabla === 'equipos').mysql).toBeGreaterThan(0);
    await ida(PG_COPIA);
    expect(dif(await verificar({ pgUrl: PG_COPIA, mysqlUrl: urlMy }))).toEqual([]);
  });

  it('verificar detecta diferencias (DIFERENCIA solo en la tabla alterada)', async () => {
    await ida(PG_COPIA);
    await pool.query('UPDATE repuestos SET cantidad = cantidad + 1 LIMIT 1');
    expect(dif(await verificar({ pgUrl: PG_COPIA, mysqlUrl: urlMy }))).toEqual(['repuestos']);
  });

  it('--confirmar con un nombre distinto aborta sin tocar datos (ambos sentidos)', async () => {
    await ida(PG_COPIA);
    await expect(ida(PG_COPIA, { confirmar: 'otra_base' })).rejects.toThrow(/--confirmar/);
    await expect(ida(PG_COPIA, { confirmar: undefined })).rejects.toThrow(/--confirmar/);
    const clon = await clonar();
    await expect(vuelta(clon, { confirmar: 'otra_base' })).rejects.toThrow(/--confirmar/);
    expect(dif(await verificar({ pgUrl: PG_COPIA, mysqlUrl: urlMy }))).toEqual([]);
    expect(dif(await verificar({ pgUrl: clon, mysqlUrl: urlMy }))).toEqual([]);
  });

  it('ida y vuelta con cambios en MySQL: el clon los recibe; la copia original difiere solo en las tablas tocadas', async () => {
    const clon = await clonar();
    await ida(PG_COPIA);
    const antes = await contar(clon);
    await conMy(async (my) => {
      const [[eq]] = await my.query('SELECT id FROM equipos LIMIT 1');
      await my.query("UPDATE equipos SET observaciones = 'Revisión — Ñandú' WHERE id = ?", [eq.id]);
      await my.query("INSERT INTO movimientos (id, equipo_id, tipo_movimiento, descripcion, usuario) VALUES (?, ?, 'Modificación', 'Acción — Ñandú ✓', 'Tést')",
        [randomUUID(), eq.id]);
      await my.query('DELETE FROM repuestos LIMIT 1');
      await my.query('UPDATE usuarios SET habilitado = 1 - habilitado LIMIT 1');
    });
    await vuelta(clon);
    expect(await contar(clon)).toEqual(antes);
    expect(dif(await verificar({ pgUrl: clon, mysqlUrl: urlMy }))).toEqual([]);
    expect(dif(await verificar({ pgUrl: PG_COPIA, mysqlUrl: urlMy }))).toEqual(['equipos', 'movimientos', 'repuestos', 'usuarios']);
    const [m] = await consulta(clon, "SELECT descripcion FROM movimientos WHERE usuario = 'Tést'");
    expect(m.descripcion).toBe('Acción — Ñandú ✓');
  });

  it('un cambio de contraseña en MySQL solo actualiza auth.users.encrypted_password', async () => {
    const clon = await clonar();
    await ida(PG_COPIA);
    const antes = await contar(clon);
    const [{ email }] = await consulta(clon, 'SELECT email FROM auth.users ORDER BY email LIMIT 1');
    await conMy((my) => my.query('UPDATE usuarios SET password_hash = ? WHERE email = ?', ['$2a$12$nuevoHashDePrueba'.padEnd(60, '.'), email]));
    await vuelta(clon);
    const [{ encrypted_password: ep }] = await consulta(clon, 'SELECT encrypted_password FROM auth.users WHERE email = $1', [email]);
    expect(ep).toMatch(/^\$2a\$12\$nuevoHash/);
    expect(await contar(clon)).toEqual(antes);
    expect(dif(await verificar({ pgUrl: clon, mysqlUrl: urlMy }))).toEqual([]);
  });

  it('sentido inverso con aprobaciones no vacía: aborta, hace rollback y deja todo intacto', async () => {
    const clon = await clonar();
    await ida(PG_COPIA);
    const [{ id: eqId }] = await consulta(clon, 'SELECT id FROM equipos LIMIT 1');
    await consulta(clon, "INSERT INTO aprobaciones (equipo_id, tipo) VALUES ($1, 'Baja')", [eqId]);
    await conMy((my) => my.query('DELETE FROM repuestos LIMIT 1'));
    await expect(vuelta(clon)).rejects.toThrow(/aprobaciones/);
    expect((await contar(clon)).aprob).toBe('1');
    // El clon sigue igual que la copia original (el borrado en MySQL no llegó).
    const [{ n }] = await consulta(clon, 'SELECT count(*) AS n FROM repuestos');
    const [{ n: n0 }] = await consulta(PG_COPIA, 'SELECT count(*) AS n FROM repuestos');
    expect(n).toBe(n0);
    expect(dif(await verificar({ pgUrl: clon, mysqlUrl: urlMy }))).toEqual(['repuestos']);
    expect(dif(await verificar({ pgUrl: PG_COPIA, mysqlUrl: urlMy }))).toEqual(['repuestos']);
  });

  describe('guarda de fecha (--forzar) y huérfanos de auth.users', () => {
    const movNuevo = (my, fecha) => my.query(
      "INSERT INTO movimientos (id, equipo_id, tipo_movimiento, descripcion, usuario, fecha) SELECT ?, id, 'Modificación', 'nuevo', 'Guarda', ? FROM equipos LIMIT 1",
      [randomUUID(), fecha]);
    const cuentaMov = (my) => my.query("SELECT COUNT(*) AS n FROM movimientos WHERE usuario = 'Guarda'").then(([[r]]) => Number(r.n));

    it('destino más nuevo que el origen: aborta sin tocar nada; con forzar procede', async () => {
      await ida(PG_COPIA);
      await conMy((my) => movNuevo(my, '2099-01-01 00:00:00.000'));
      await expect(ida(PG_COPIA, { forzar: false })).rejects.toThrow(/más nuevos.*--forzar/);
      expect(await conMy(cuentaMov)).toBe(1);
      await ida(PG_COPIA, { forzar: true });
      expect(await conMy(cuentaMov)).toBe(0);
    });
    it('destino más nuevo también aborta en sentido inverso (Postgres); procede con forzar', async () => {
      const clon = await clonar();
      await ida(PG_COPIA);
      await consulta(clon, "INSERT INTO movimientos (id, equipo_id, tipo_movimiento, descripcion, usuario, fecha) SELECT gen_random_uuid(), id, 'Modificación', 'nuevo', 'Guarda', '2099-01-01T00:00:00Z' FROM equipos LIMIT 1");
      await expect(vuelta(clon, { forzar: false })).rejects.toThrow(/más nuevos/);
      expect((await consulta(clon, "SELECT count(*) AS n FROM movimientos WHERE usuario = 'Guarda'"))[0].n).toBe('1');
      await vuelta(clon, { forzar: true });
      expect((await consulta(clon, "SELECT count(*) AS n FROM movimientos WHERE usuario = 'Guarda'"))[0].n).toBe('0');
    });
    it('procede sin forzar cuando el origen es más nuevo o el destino está vacío; imprime host, base y conteos', async () => {
      const clon = await clonar();
      await ida(PG_COPIA);
      await conMy((my) => movNuevo(my, '2099-01-01 00:00:00.000')); // MySQL (origen de la vuelta) más nuevo
      const lineas = [];
      await vuelta(clon, { forzar: false, log: (l) => lineas.push(l) });
      const txt = lineas.join('\n');
      expect(txt).toContain(`base ${nombreDe(clon)}`);
      expect(txt).toMatch(/host 127\.0\.0\.1/);
      expect(txt).toMatch(/equipos: \d+ fila\(s\) que se van a borrar/);
      await conMy(async (my) => {
        await my.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const t of ['sesiones', 'tokens_password', 'usuarios', 'equipos', 'movimientos', 'prestamos', 'solicitudes_cambio', 'feedback_desarrollador', 'repuestos']) await my.query(`DELETE FROM \`${t}\``);
      });
      await ida(PG_COPIA, { forzar: false }); // destino vacío
      expect(dif(await verificar({ pgUrl: PG_COPIA, mysqlUrl: urlMy }))).toEqual([]);
    });
    it('vuelta: cuentas de auth.users sin user_roles quedan con encrypted_password NULL y se avisa por email', async () => {
      const clon = await clonar();
      await ida(PG_COPIA);
      const [{ email }] = await consulta(clon, 'SELECT email FROM auth.users ORDER BY email LIMIT 1');
      await conMy((my) => my.query('DELETE FROM usuarios WHERE email = ?', [email]));
      const avisos = [];
      const res = await vuelta(clon, { warn: (m) => avisos.push(m) });
      expect(res.sinRolBloqueados).toEqual([email]);
      expect(avisos.join('\n')).toContain(email);
      const [a] = await consulta(clon, 'SELECT encrypted_password FROM auth.users WHERE email = $1', [email]);
      expect(a.encrypted_password).toBeNull();
      const [{ n }] = await consulta(clon, 'SELECT count(*) AS n FROM auth.users WHERE encrypted_password IS NULL');
      expect(n).toBe('1'); // solo el huérfano
    });
  });

  it('falla a mitad de la carga hacia MySQL: rollback, MySQL queda igual que antes', async () => {
    const clon = await clonar();
    await ida(PG_COPIA);
    // Valor que excede VARCHAR(255): con sql_mode estricto el INSERT falla después de haber borrado todo.
    await consulta(clon, "UPDATE equipos SET tipo = repeat('x', 300) WHERE id = (SELECT id FROM equipos LIMIT 1)");
    await expect(ida(clon)).rejects.toThrow();
    expect(dif(await verificar({ pgUrl: PG_COPIA, mysqlUrl: urlMy }))).toEqual([]);
  });

  it('falla a mitad de la carga hacia Postgres: rollback, el clon queda igual que antes', async () => {
    const clon = await clonar();
    await ida(PG_COPIA);
    // Restricción solo existente en Postgres: el INSERT de repuestos (último) falla tras borrar y cargar el resto.
    await consulta(clon, 'ALTER TABLE repuestos ADD CONSTRAINT cant_max CHECK (cantidad < 1000)');
    const [{ id, cantidad }] = await conMy(async (my) => (await my.query('SELECT id, cantidad FROM repuestos LIMIT 1'))[0]);
    await conMy((my) => my.query('UPDATE repuestos SET cantidad = 5000, updated_at = updated_at WHERE id = ?', [id]));
    await expect(vuelta(clon)).rejects.toThrow(/cant_max/);
    await conMy((my) => my.query('UPDATE repuestos SET cantidad = ?, updated_at = updated_at WHERE id = ?', [cantidad, id]));
    expect(dif(await verificar({ pgUrl: clon, mysqlUrl: urlMy }))).toEqual([]);
  });

  it('columna nueva sin mapear: migrar (ambos sentidos) y verificar abortan nombrando tabla.columna', async () => {
    const clon = await clonar();
    await ida(PG_COPIA);
    await consulta(clon, 'ALTER TABLE repuestos ADD COLUMN extra_pg text');
    await expect(ida(clon)).rejects.toThrow(/repuestos\.extra_pg/);
    await expect(verificar({ pgUrl: clon, mysqlUrl: urlMy })).rejects.toThrow(/repuestos\.extra_pg/);
    await consulta(clon, 'ALTER TABLE repuestos DROP COLUMN extra_pg');
    await conMy((my) => my.query('ALTER TABLE equipos ADD COLUMN extra_my VARCHAR(10) NULL'));
    await expect(vuelta(clon)).rejects.toThrow(/equipos\.extra_my/);
    await expect(verificar({ pgUrl: clon, mysqlUrl: urlMy })).rejects.toThrow(/equipos\.extra_my/);
    await conMy((my) => my.query('ALTER TABLE equipos DROP COLUMN extra_my'));
  });
});
