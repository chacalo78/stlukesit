// Backup lógico de la base MySQL a ~/backups/stlukesit/<DB_NAME>-YYYYMMDD-HHMMSS.sql.gz (conserva los 30 más nuevos).
//   node scripts/backup.js
// Pensado para cron (entorno mínimo, cwd arbitrario). Credenciales, por clave y en este orden:
//   1) variables de entorno del proceso  2) .env en la raíz de la app (donde está package.json)
//   3) ~/.stlukesit-backup.env
// Usa `mysqldump` si está en el PATH (y funciona); si no, un volcado en Node puro con mysql2.
// Los datos de `sesiones` (efímeros, con secretos de sesión) no se incluyen; su CREATE TABLE sí.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { once } from 'node:events';
import { homedir } from 'node:os';
import { join } from 'node:path';
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
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Borra los backups de ESTA base más allá de los `conservar` más nuevos. No toca archivos de otras bases.
export function rotar(dir, database, conservar = CONSERVAR) {
  const re = new RegExp(`^${escRe(database)}-\\d{8}-\\d{6}\\.sql\\.gz$`);
  const archivos = readdirSync(dir).filter((f) => re.test(f)).sort().reverse();
  const borrar = archivos.slice(conservar);
  for (const f of borrar) unlinkSync(join(dir, f));
  return borrar.length;
}

// Escritura con contrapresión.
async function escribir(stream, datos) {
  if (!stream.write(datos)) await once(stream, 'drain');
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
async function volcarConNode(c, salida) {
  const con = await abrir(c);
  try {
    await con.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await con.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const tablas = await listarTablas(con);
    await escribir(salida, CABECERA);
    for (const t of tablas) {
      const [[r]] = await con.query(`SHOW CREATE TABLE ${q(t)}`);
      await escribir(salida, `\n-- Estructura de ${t}\n${r['Create Table']};\n`);
    }
    for (const t of tablas) {
      if (TABLAS_SIN_DATOS.has(t)) continue;
      await escribir(salida, `\n-- Datos de ${t}\n`);
      const cols = [];
      const rs = con.connection.query({ sql: `SELECT * FROM ${q(t)}`, typeCast, rowsAsArray: true });
      rs.on('fields', (f) => cols.push(...f.map((x) => q(x.name))));
      let lote = [];
      const volcar = async () => {
        if (!lote.length) return;
        await escribir(salida, `INSERT INTO ${q(t)} (${cols.join(', ')}) VALUES\n${lote.join(',\n')};\n`);
        lote = [];
      };
      const stream = rs.stream({ highWaterMark: 100 });
      for await (const fila of stream) {
        lote.push(`(${fila.map(literal).join(', ')})`);
        if (lote.length >= LOTE_FILAS) await volcar();
      }
      await volcar();
    }
    await escribir(salida, PIE);
    await con.query('COMMIT');
    return tablas.length;
  } finally {
    await con.end().catch(() => {});
  }
}

let ayudaMysqldump;
function ayuda(bin) {
  return new Promise((res, rej) => {
    const p = spawn(bin, ['--help'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', rej);
    p.on('close', () => res(out));
  });
}

function correrMysqldump(bin, args, c, salida) {
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { env: { ...process.env, MYSQL_PWD: c.password }, stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { if (err.length < 2000) err += d; });
    p.on('error', rej);
    p.stdout.on('data', (d) => { if (!salida.write(d)) { p.stdout.pause(); salida.once('drain', () => p.stdout.resume()); } });
    p.on('close', (code) => (code === 0 ? res() : rej(new Error(`mysqldump terminó con código ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`))));
  });
}

async function volcarConMysqldump(c, salida, bin = 'mysqldump') {
  ayudaMysqldump ??= {};
  const help = (ayudaMysqldump[bin] ??= await ayuda(bin)); // lanza ENOENT si no existe
  const base = [`--host=${c.host}`, `--port=${c.port}`, `--user=${c.user}`, '--protocol=tcp',
    '--single-transaction', '--quick', '--routines=false', '--default-character-set=utf8mb4'];
  if (help.includes('--no-tablespaces')) base.push('--no-tablespaces');
  // Estructura de todo, y datos de todo salvo las tablas efímeras.
  await correrMysqldump(bin, [...base, '--no-data', c.database], c, salida);
  const ignorar = [...TABLAS_SIN_DATOS].map((t) => `--ignore-table=${c.database}.${t}`);
  await correrMysqldump(bin, [...base, '--no-create-info', ...ignorar, c.database], c, salida);
}

// Hace el backup. Devuelve { archivo, bytes, tablas, metodo }. Lanza Error (sin secretos) si falla.
export async function hacerBackup({ credenciales, metodo = process.env.BACKUP_METODO || 'auto', mysqldumpBin = 'mysqldump', ahora = new Date() } = {}) {
  const c = credenciales ?? resolverCredenciales();
  if (!['auto', 'node', 'mysqldump'].includes(metodo)) throw new Error(`Método de backup desconocido: ${metodo}`);
  mkdirSync(c.dir, { recursive: true, mode: 0o700 });
  const final = join(c.dir, `${c.database}-${sello(ahora)}.sql.gz`);
  const tmp = `${final}.tmp`;
  const archivo = createWriteStream(tmp, { mode: 0o600 });
  const gz = createGzip();
  gz.pipe(archivo);
  const terminado = new Promise((res, rej) => { archivo.on('finish', res); archivo.on('error', rej); gz.on('error', rej); });
  terminado.catch(() => {}); // evita rechazo no manejado; se espera abajo
  let usado;
  let tablas;
  try {
    const intentarNode = async () => { usado = 'node'; return volcarConNode(c, gz); };
    if (metodo === 'node') {
      tablas = await intentarNode();
    } else {
      // El objetivo de mysqldump se vuelca a un gz propio para poder reintentar con Node si falla.
      try {
        usado = 'mysqldump';
        await volcarConMysqldump(c, gz, mysqldumpBin);
        const con = await abrir(c);
        try { tablas = (await listarTablas(con)).length; } finally { await con.end().catch(() => {}); }
      } catch (err) {
        if (metodo === 'mysqldump') throw err;
        // Reiniciar el archivo: lo escrito parcialmente no es válido.
        gz.unpipe(archivo);
        throw Object.assign(new Error('reintento'), { causa: err, reintentar: true });
      }
    }
    gz.end();
    await terminado;
  } catch (err) {
    if (err.reintentar) {
      try { gz.destroy(); archivo.destroy(); unlinkSync(tmp); } catch { /* ya no existe */ }
      const aviso = `mysqldump no se pudo usar (${String(err.causa.message).slice(0, 300)}); se usa el volcado en Node`;
      const r = await hacerBackup({ credenciales: c, metodo: 'node', ahora });
      return { ...r, aviso };
    }
    try { gz.destroy(); archivo.destroy(); } catch { /* ignorar */ }
    try { unlinkSync(tmp); } catch { /* ignorar */ }
    throw err;
  }
  renameSync(tmp, final);
  const borrados = rotar(c.dir, c.database);
  return { archivo: final, bytes: statSync(final).size, tablas, metodo: usado, borrados };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const r = await hacerBackup();
    if (r.aviso) console.warn(`AVISO: ${r.aviso}`);
    console.log(`backup OK: ${r.archivo} (${r.bytes} bytes, ${r.tablas} tablas, método ${r.metodo}, rotados ${r.borrados})`);
  } catch (err) {
    console.error(`backup FALLÓ: ${err.message}`);
    process.exit(1);
  }
}
