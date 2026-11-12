import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import { crearDbDeTest, limpiar } from './helpers.js';
import { hacerBackup, resolverCredenciales, rotar } from '../scripts/backup.js';
import { restaurar } from '../scripts/restaurar.js';

const CFG = {
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT || 3306),
  user: process.env.TEST_DB_USER || 'stlukesit_test',
  password: process.env.TEST_DB_PASSWORD || 'test_local_pw',
};
const TABLAS = ['usuarios', 'sesiones', 'tokens_password', 'equipos', 'movimientos', 'prestamos', 'repuestos', 'solicitudes_cambio', 'feedback_desarrollador'];
const hayMysqldump = spawnSync('mysqldump', ['--version']).status === 0;
const U1 = '11111111-1111-4111-8111-111111111111';
const EQ = '22222222-2222-4222-8222-222222222222';

let pool;
let tmp;
let creds;
const destinos = [];

async function admin() { return mysql.createConnection({ ...CFG, dateStrings: true, timezone: 'Z' }); }

async function crearVacia() {
  const nombre = `stlukesit_test_${randomBytes(6).toString('hex')}`;
  const a = await admin();
  await a.query(`CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await a.end();
  destinos.push(nombre);
  return nombre;
}

async function volcarTabla(db, t) {
  const c = await admin();
  try {
    const [r] = await c.query(`SELECT * FROM \`${db}\`.\`${t}\` ORDER BY 1`);
    return r;
  } finally { await c.end(); }
}

beforeAll(async () => {
  pool = await crearDbDeTest();
  tmp = mkdtempSync(join(tmpdir(), 'bk-'));
  creds = { ...CFG, database: pool.nombreDbTest, dir: join(tmp, 'out') };
  await pool.query("INSERT INTO usuarios (id, email, nombre, rol, sede, created_at) VALUES (?, 'ñandú@x.com', 'Ñandú 😀 \\\\ \" '' ', 'admin', NULL, '2026-01-02 03:04:05.678')", [U1]);
  await pool.query("INSERT INTO equipos (id, tipo, marca, observaciones, fecha_adquisicion, fecha_baja_definitiva) VALUES (?, 'Notebook', NULL, 'línea1\nlínea2 ✓ 日本語; DROP TABLE x;--', '2025-12-31', '2026-03-04 05:06:07.089')", [EQ]);
  await pool.query("INSERT INTO sesiones (session_id, expires, data) VALUES ('secreto', 4000000000, '{\"cookie\":1}')");
  await pool.query("INSERT INTO tokens_password (id, usuario_id, token_hash, tipo, expira_at) VALUES (?, ?, ?, 'recuperacion', '2026-05-05 00:00:00.001')", [EQ, U1, 'a'.repeat(64)]);
});

afterAll(async () => {
  const a = await admin();
  for (const d of destinos) await a.query(`DROP DATABASE IF EXISTS \`${d}\``);
  await a.end();
  rmSync(tmp, { recursive: true, force: true });
  await limpiar(pool);
});

const metodos = ['node', ...(hayMysqldump ? ['mysqldump'] : [])];

describe.each(metodos)('backup y restauración (método %s)', (metodo) => {
  it('el gz restaura en una base vacía con los mismos datos y sin sesiones', async () => {
    const dir = join(tmp, `m-${metodo}`);
    const r = await hacerBackup({ credenciales: { ...creds, dir }, metodo });
    expect(r.metodo).toBe(metodo);
    expect(r.tablas).toBe(TABLAS.length);
    expect(statSync(r.archivo).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(gunzipSync(readFileSync(r.archivo)).toString('utf8')).not.toContain('secreto');

    const destino = await crearVacia();
    const res = await restaurar({ archivo: r.archivo, confirmar: destino, credenciales: { ...CFG, database: destino } });
    expect(res.tablas).toBe(TABLAS.length);
    for (const t of TABLAS) {
      const origen = await volcarTabla(pool.nombreDbTest, t);
      const copia = await volcarTabla(destino, t);
      if (t === 'sesiones') { expect(copia).toEqual([]); continue; }
      expect(copia).toEqual(origen);
    }
    const [u] = await volcarTabla(destino, 'usuarios');
    expect(u.nombre).toBe('Ñandú 😀 \\ " \' ');
    expect(u.sede).toBeNull();
    expect(u.created_at).toBe('2026-01-02 03:04:05.678');
    const [e] = await volcarTabla(destino, 'equipos');
    expect(e.observaciones).toBe('línea1\nlínea2 ✓ 日本語; DROP TABLE x;--');
    expect(e.fecha_baja_definitiva).toBe('2026-03-04 05:06:07.089');
    expect((await volcarTabla(destino, 'tokens_password'))).toHaveLength(1);
  });
});

describe('fallos y fallback', () => {
  it('no deja .tmp si falla (credenciales malas) y el error no contiene la contraseña', async () => {
    const dir = join(tmp, 'fallo');
    const mala = { ...creds, dir, password: 'clave-secreta-incorrecta' };
    const err = await hacerBackup({ credenciales: mala, metodo: 'node' }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain('clave-secreta-incorrecta');
    expect(readdirSync(dir)).toEqual([]);
  });

  it('mysqldump forzado e inexistente falla sin dejar archivos; en auto cae a Node', async () => {
    const dir = join(tmp, 'sinbin');
    await expect(hacerBackup({ credenciales: { ...creds, dir }, metodo: 'mysqldump', mysqldumpBin: 'no-existe-mysqldump' })).rejects.toThrow();
    expect(readdirSync(dir)).toEqual([]);
    const r = await hacerBackup({ credenciales: { ...creds, dir }, metodo: 'auto', mysqldumpBin: 'no-existe-mysqldump' });
    expect(r.metodo).toBe('node');
    expect(r.aviso).toMatch(/volcado en Node/);
    expect(readdirSync(dir)).toEqual([r.archivo.split('/').pop()]);
  });
});

describe('rotación', () => {
  it('conserva los 30 más nuevos de esa base y no toca otras', () => {
    const dir = join(tmp, 'rot');
    mkdirSync(dir);
    const nombres = [];
    for (let i = 1; i <= 35; i++) nombres.push(`midb-202601${String(i).padStart(2, '0')}-030000.sql.gz`);
    const otros = ['otra-20200101-030000.sql.gz', 'midb-extra-20200101-030000.sql.gz', 'midb-20200101-030000.sql.gz.tmp', 'nota.txt'];
    for (const f of [...nombres, ...otros]) writeFileSync(join(dir, f), 'x');
    expect(rotar(dir, 'midb')).toBe(5);
    const quedan = readdirSync(dir).sort();
    expect(quedan).toEqual([...nombres.slice(5), ...otros].sort());
  });
});

describe('credenciales', () => {
  it('orden: entorno, luego .env de la app, luego ~/.stlukesit-backup.env (por clave)', () => {
    const app = mkdtempSync(join(tmp, 'app-'));
    const home = mkdtempSync(join(tmp, 'home-'));
    writeFileSync(join(app, '.env'), 'DB_USER=user_app\nDB_NAME="nombre_app"\nDB_HOST=host_app # comentario\n');
    writeFileSync(join(home, '.stlukesit-backup.env'), 'DB_USER=user_home\nDB_PASSWORD=pw_home\nDB_NAME=nombre_home\nDB_PORT=3307\n');
    const c = resolverCredenciales({ env: { DB_USER: 'user_env' }, appRoot: app, home });
    expect(c).toMatchObject({ user: 'user_env', database: 'nombre_app', host: 'host_app', password: 'pw_home', port: 3307 });
    expect(c.dir).toBe(join(home, 'backups', 'stlukesit'));
    expect(c.origenes.DB_USER).toBe('entorno');
    expect(c.origenes.DB_PASSWORD).toBe('~/.stlukesit-backup.env');
  });

  it('host y puerto por defecto, y error claro si faltan credenciales (sin valores)', () => {
    const vacio = mkdtempSync(join(tmp, 'vacio-'));
    const c = resolverCredenciales({ env: { DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'n' }, appRoot: vacio, home: vacio });
    expect(c).toMatchObject({ host: '127.0.0.1', port: 3306 });
    expect(() => resolverCredenciales({ env: { DB_USER: 'u', DB_PASSWORD: 'secreto' }, appRoot: vacio, home: vacio })).toThrow(/DB_NAME/);
  });
});

describe('restaurar: guardas', () => {
  it('exige --confirmar exacto y base vacía', async () => {
    const archivo = (await hacerBackup({ credenciales: { ...creds, dir: join(tmp, 'g') }, metodo: 'node' })).archivo;
    await expect(restaurar({ archivo, credenciales: { ...CFG, database: pool.nombreDbTest } })).rejects.toThrow(/--confirmar/);
    await expect(restaurar({ archivo, confirmar: 'otra', credenciales: { ...CFG, database: pool.nombreDbTest } })).rejects.toThrow(/no coincide/);
    await expect(restaurar({ archivo, confirmar: pool.nombreDbTest, credenciales: { ...CFG, database: pool.nombreDbTest } })).rejects.toThrow(/vacía/);
  });
});
