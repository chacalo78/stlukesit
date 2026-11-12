// Backup lógico de la base MySQL a ~/backups/stlukesit/<DB_NAME>-YYYYMMDD-HHMMSS.sql.gz (hora UTC) (conserva los 30 más nuevos).
//   node scripts/backup.js
// Pensado para cron (entorno mínimo, cwd arbitrario). Credenciales, por clave y en este orden:
//   1) variables de entorno del proceso  2) .env en la raíz de la app (donde está package.json)
//   3) ~/.stlukesit-backup.env
// Usa `mysqldump` si está en el PATH (y funciona); si no, un volcado en Node puro con mysql2.
// Los datos de `sesiones` (efímeros, con secretos de sesión) no se incluyen; su CREATE TABLE sí.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { once } from 'node:events';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const RAIZ_APP = fileURLToPath(new URL('..', import.meta.url));
export const CONSERVAR = 30;
const TABLAS_SIN_DATOS = new Set(['sesiones']);
const CLAVES = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'BACKUP_DIR'];

function leerArchivoEnv(ruta) {
  try {
    if (!existsSync(ruta)) return {};
    return dotenv.parse(readFileSync(ruta));
  } catch {
    return {};
  }
}

// Devuelve { host, port, user, password, database, dir, origenes }. `origenes` dice de dónde salió cada clave (sin valores).
export function resolverCredenciales({ env = process.env, appRoot = RAIZ_APP, home = homedir() } = {}) {
  const fuentes = [
    ['entorno', env],
    ['.env de la app', leerArchivoEnv(join(appRoot, '.env'))],
    ['~/.stlukesit-backup.env', leerArchivoEnv(join(home, '.stlukesit-backup.env'))],
  ];
  const v = {};
  const origenes = {};
  for (const k of CLAVES) {
    for (const [nombre, src] of fuentes) {
      if (src[k] !== undefined && String(src[k]) !== '') { v[k] = String(src[k]); origenes[k] = nombre; break; }
    }
  }
  const faltan = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'].filter((k) => !v[k]);
  if (faltan.length) throw new Error(`Faltan credenciales de base de datos: ${faltan.join(', ')} (se buscaron en el entorno, ${join(appRoot, '.env')} y ${join(home, '.stlukesit-backup.env')})`);
  return {
    host: v.DB_HOST || '127.0.0.1',
    port: Number(v.DB_PORT) || 3306,
    user: v.DB_USER,
    password: v.DB_PASSWORD,
    database: v.DB_NAME,
    dir: v.BACKUP_DIR || join(home, 'backups', 'stlukesit'),
    origenes,
  };
}

const pad = (n, l = 2) => String(n).padStart(l, '0');
export function sello(d = new Date()) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Borra los backups de ESTA base más allá de los `conservar` más nuevos. No toca archivos de otras bases.
export function rotar(dir, database, conservar = CONSERVAR, proteger = null) {
  const re = new RegExp(`^${escRe(database)}-\\d{8}-\\d{6}\\.sql\\.gz$`);
  const archivos = readdirSync(dir).filter((f) => re.test(f) && f !== proteger).sort().reverse();
  const borrar = archivos.slice(Math.max(conservar - (proteger ? 1 : 0), 0));
  for (const f of borrar) unlinkSync(join(dir, f));
  return borrar.length;
}

// True si este módulo es el que se ejecutó (resuelve symlinks: en Hostinger `hbuilds/current` es un enlace).
export function esPrincipal(metaUrl) {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

// Escritura con contrapresión; se interrumpe si `signal` aborta (error de escritura, timeout).
async function escribir(stream, datos, signal) {
  signal?.throwIfAborted();
  if (!stream.write(datos)) await once(stream, 'drain', { signal });
}

const CABECERA = [
  '-- Backup lógico stlukesit',
  '/*!40101 SET NAMES utf8mb4 */;',
  "SET time_zone = '+00:00';",
  'SET FOREIGN_KEY_CHECKS = 0;',
  'SET UNIQUE_CHECKS = 0;',
  "SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';",
  '',
].join('\n');
const PIE = '\nSET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n';

const q = (id) => `\`${id.replace(/`/g, '``')}\``;
const TIPOS_BINARIOS = new Set(['BLOB', 'TINY_BLOB', 'MEDIUM_BLOB', 'LONG_BLOB', 'BIT', 'GEOMETRY']);
function typeCast(field) {
  if (TIPOS_BINARIOS.has(field.type)) return field.buffer();
  return field.string();
}
const literal = (x) => (x === null ? 'NULL' : Buffer.isBuffer(x) ? (x.length ? `X'${x.toString('hex')}'` : "''") : mysql.escape(x));

async function abrir(c) {
  const con = await mysql.createConnection({
    host: c.host, port: c.port, user: c.user, password: c.password, database: c.database,
    charset: 'utf8mb4', dateStrings: true, timezone: 'Z', supportBigNumbers: true, bigNumberStrings: true,
  });
  await con.query("SET SESSION time_zone = '+00:00'");
  return con;
}

async function listarTablas(con) {
  const [filas] = await con.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  return filas.map((f) => Object.values(f)[0]).sort();
}

const LOTE_FILAS = 200;

// Volcado en Node puro dentro de una transacción de snapshot consistente.
// No vuelca vistas, triggers ni rutinas (el esquema no tiene; si se agregan, hay que extender esto).
async function volcarConNode(c, salida, signal) {
  const con = await abrir(c);
  try {
    await con.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await con.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const tablas = await listarTablas(con);
    signal.addEventListener('abort', () => con.destroy(), { once: true });
    await escribir(salida, CABECERA, signal);
    for (const t of tablas) {
      const [[r]] = await con.query(`SHOW CREATE TABLE ${q(t)}`);
      await escribir(salida, `\n-- Estructura de ${t}\n${r['Create Table']};\n`, signal);
    }
    for (const t of tablas) {
      if (TABLAS_SIN_DATOS.has(t)) continue;
      await escribir(salida, `\n-- Datos de ${t}\n`, signal);
      const cols = [];
      const rs = con.connection.query({ sql: `SELECT * FROM ${q(t)}`, typeCast, rowsAsArray: true });
      rs.on('fields', (f) => cols.push(...f.map((x) => q(x.name))));
      let lote = [];
      const volcar = async () => {
        if (!lote.length) return;
        await escribir(salida, `INSERT INTO ${q(t)} (${cols.join(', ')}) VALUES\n${lote.join(',\n')};\n`, signal);
        lote = [];
      };
      const stream = rs.stream({ highWaterMark: 100 });
      for await (const fila of stream) {
        lote.push(`(${fila.map(literal).join(', ')})`);
        if (lote.length >= LOTE_FILAS) await volcar();
      }
      await volcar();
    }
    await escribir(salida, PIE, signal);
    await con.query('COMMIT');
    return tablas.length;
  } finally {
    await con.end().catch(() => {});
  }
}


function ayuda(bin) {
  return new Promise((res, rej) => {
    const p = spawn(bin, ['--help'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', rej);
    p.on('close', () => res(out));
  });
}

function correrMysqldump(bin, args, c, salida, signal) {
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { env: { ...process.env, MYSQL_PWD: c.password }, stdio: ['ignore', 'pipe', 'pipe'] });
    const matar = () => p.kill('SIGKILL');
    signal.addEventListener('abort', matar, { once: true });
    let err = '';
    p.stderr.on('data', (d) => { if (err.length < 2000) err += d; });
    p.on('error', rej);
    p.stdout.on('data', (d) => {
      if (!salida.write(d)) { p.stdout.pause(); once(salida, 'drain', { signal }).then(() => p.stdout.resume(), () => {}); }
    });
    p.on('close', (code) => {
      signal.removeEventListener('abort', matar);
      if (signal.aborted) return rej(signal.reason);
      return code === 0 ? res() : rej(new Error(`${bin} terminó con código ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`));
    });
  });
}

// Dos pasadas (estructura y datos): no comparten snapshot, pero el esquema no cambia en la práctica.
async function volcarConMysqldump(c, salida, bin, signal) {
  const help = await ayuda(bin); // lanza ENOENT si no existe
  const base = [`--host=${c.host}`, `--port=${c.port}`, `--user=${c.user}`, '--protocol=tcp',
    '--single-transaction', '--quick', '--routines=false', '--default-character-set=utf8mb4'];
  if (help.includes('--no-tablespaces')) base.push('--no-tablespaces');
  await correrMysqldump(bin, [...base, '--no-data', c.database], c, salida, signal);
  const ignorar = [...TABLAS_SIN_DATOS].map((t) => `--ignore-table=${c.database}.${t}`);
  await correrMysqldump(bin, [...base, '--no-create-info', ...ignorar, c.database], c, salida, signal);
}

const limpiarMotivo = (e, c) => String(e?.code === 'ENOENT' ? 'no está en el PATH' : e?.message ?? e)
  .split(c.password).join('***').replace(/\s+/g, ' ').slice(0, 200);

// Un intento completo con un método concreto ('node' o el binario de mysqldump). Devuelve { archivo, bytes, tablas }.
async function generar(c, bin, { ahora, timeoutMs, crearSalida }) {
  mkdirSync(c.dir, { recursive: true, mode: 0o700 });
  const final = join(c.dir, `${c.database}-${sello(ahora)}.sql.gz`);
  const tmp = `${final}.${process.pid}.tmp`;
  const archivo = crearSalida ? crearSalida(tmp) : createWriteStream(tmp, { mode: 0o600, flags: 'wx' });
  const gz = createGzip();
  const ac = new AbortController();
  const abortar = (e) => { if (!ac.signal.aborted) ac.abort(e); };
  const pip = pipeline(gz, archivo).catch((e) => { abortar(e); throw e; });
  pip.catch(() => {});
  const abortado = new Promise((_, rej) => ac.signal.addEventListener('abort', () => rej(ac.signal.reason), { once: true }));
  abortado.catch(() => {});
  const reloj = setTimeout(() => abortar(new Error(`Se superó el tiempo máximo del backup (${Math.round(timeoutMs / 1000)} s)`)), timeoutMs);
  try {
    const volcado = bin === 'node' ? volcarConNode(c, gz, ac.signal) : volcarConMysqldump(c, gz, bin, ac.signal);
    volcado.catch(() => {});
    await Promise.race([volcado, abortado]);
    let tablas;
    if (bin === 'node') tablas = await volcado;
    else {
      const con = await abrir(c);
      try { tablas = (await listarTablas(con)).length; } finally { await con.end().catch(() => {}); }
    }
    gz.end();
    await Promise.race([pip, abortado]);
    renameSync(tmp, final);
    return { archivo: final, bytes: statSync(final).size, tablas };
  } catch (err) {
    abortar(err);
    gz.destroy();
    // Esperar el cierre: si el open() de 'wx' aún no terminó, borrar antes dejaría el .tmp huérfano
    // y el siguiente intento (mismo segundo y pid, p. ej. el fallback a Node) fallaría con EEXIST.
    if (!archivo.closed) { const cerrado = new Promise((res) => archivo.once('close', res)); archivo.destroy(); await cerrado; }
    try { unlinkSync(tmp); } catch { /* no existía */ }
    throw err;
  } finally {
    clearTimeout(reloj);
  }
}

// Hace el backup. Devuelve { archivo, bytes, tablas, metodo, respaldo?, borrados }. Lanza Error (sin secretos) si falla.
// `mysqldumpBin` puede ser un binario o una lista; en auto se prueban en orden y, si todos fallan, se usa Node.
export async function hacerBackup({
  credenciales, metodo = process.env.BACKUP_METODO || 'auto', mysqldumpBin = ['mysqldump', 'mariadb-dump'], ahora = new Date(),
  timeoutMs = Number(process.env.BACKUP_TIMEOUT_MS) || 600000, crearSalida, aviso = console.warn,
} = {}) {
  const c = credenciales ?? resolverCredenciales();
  if (!['auto', 'node', 'mysqldump'].includes(metodo)) throw new Error(`Método de backup desconocido: ${metodo}`);
  const opts = { ahora, timeoutMs, crearSalida };
  const bins = [].concat(mysqldumpBin);
  const motivos = [];
  let r;
  let usado;
  if (metodo !== 'node') {
    for (const bin of bins) {
      try { r = await generar(c, bin, opts); usado = bin; break; } catch (err) {
        motivos.push(`${bin} falló: ${limpiarMotivo(err, c)}`);
      }
    }
    if (!r && metodo === 'mysqldump') throw new Error(motivos.join('; '));
  }
  if (!r) { r = await generar(c, 'node', opts); usado = 'node'; }
  let borrados = 0;
  try { borrados = rotar(c.dir, c.database, CONSERVAR, basename(r.archivo)); } catch (err) {
    aviso(`AVISO: el backup se guardó pero no se pudo rotar los viejos: ${limpiarMotivo(err, c)}`);
  }
  return { ...r, metodo: usado === 'node' ? 'node' : 'mysqldump', binario: usado, respaldo: metodo === 'auto' && usado === 'node' && motivos.length ? motivos.join('; ') : undefined, borrados };
}

if (esPrincipal(import.meta.url)) {
  try {
    const r = await hacerBackup();
    const m = r.respaldo ? `node (respaldo: ${r.respaldo})` : r.binario;
    console.log(`backup OK: ${r.archivo} (${r.bytes} bytes, ${r.tablas} tablas, método=${m}, rotados ${r.borrados})`);
  } catch (err) {
    console.error(`backup FALLÓ: ${err.message}`);
    process.exit(1);
  }
}
