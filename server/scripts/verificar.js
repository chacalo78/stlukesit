// Compara conteos y un hash por tabla entre Postgres y MySQL.
//   node scripts/verificar.js --pg-url=... --mysql-url=...   (o env PG_URL / MYSQL_URL)
// Cada fila se normaliza igual en ambos lados (orden por id, timestamps ISO ms UTC, fechas YYYY-MM-DD,
// JSON canónico, booleanos 0/1, NULL explícito) y se hashea con SHA-256. Sale con código 1 si hay diferencias.
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { abrirPg, abrirMysql, resolverUrls, parsearArgs } from './lib/conexion.js';
import { validarEsquema } from './lib/esquema.js';
import { COLUMNAS, aIsoMs, aFecha, canonico } from './lib/transformar.js';

const TABLAS = ['usuarios', 'equipos', 'movimientos', 'prestamos', 'solicitudes_cambio', 'feedback_desarrollador', 'repuestos'];
const nombres = (t) => COLUMNAS[t].map(([c]) => c);

function normalizar(tabla, fila) {
  return COLUMNAS[tabla].map(([c, tipo]) => {
    const v = fila[c];
    if (v === null || v === undefined) return null;
    if (tipo === 'ts') return aIsoMs(v);
    if (tipo === 'd') return aFecha(v);
    if (tipo === 'b') return v ? 1 : 0;
    if (tipo === 'j') return canonico(typeof v === 'string' ? JSON.parse(v) : v);
    return String(v);
  });
}

export function hashTabla(tabla, filas) {
  const ordenadas = filas.map((f) => normalizar(tabla, f)).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const h = createHash('sha256');
  for (const f of ordenadas) h.update(`${JSON.stringify(f)}\n`);
  return { cantidad: ordenadas.length, hash: h.digest('hex') };
}

function consultaPg(t) {
  if (t === 'usuarios') {
    return `SELECT r.id, r.email, a.encrypted_password AS password_hash, r.nombre, r.rol, r.sede, r.habilitado, r.created_at
            FROM user_roles r LEFT JOIN auth.users a ON lower(a.email) = lower(r.email)`;
  }
  return `SELECT ${nombres(t).join(', ')} FROM ${t}`;
}

export async function verificar({ pgUrl, mysqlUrl }) {
  if (!pgUrl || !mysqlUrl) throw new Error('Faltan las URLs: use --pg-url y --mysql-url (o PG_URL y MYSQL_URL).');
  const pgc = await abrirPg(pgUrl);
  const my = await abrirMysql(mysqlUrl);
  const resultados = [];
  try {
    await validarEsquema(pgc, my);
    for (const t of TABLAS) {
      const p = hashTabla(t, (await pgc.query(consultaPg(t))).rows);
      const [rows] = await my.query(`SELECT ${nombres(t).join(', ')} FROM \`${t}\``);
      const m = hashTabla(t, rows);
      resultados.push({ tabla: t, ok: p.hash === m.hash && p.cantidad === m.cantidad, pg: p.cantidad, mysql: m.cantidad, hashPg: p.hash, hashMysql: m.hash });
    }
  } finally {
    await my.end().catch(() => {});
    await pgc.end().catch(() => {});
  }
  return resultados;
}

export function formatear(r) {
  return `${r.ok ? 'OK         ' : 'DIFERENCIA '} ${r.tabla.padEnd(24)} postgres=${r.pg} mysql=${r.mysql} hash_pg=${r.hashPg.slice(0, 12)} hash_mysql=${r.hashMysql.slice(0, 12)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const a = parsearArgs(process.argv.slice(2));
    const res = await verificar(resolverUrls({ pgUrl: a['pg-url'], mysqlUrl: a['mysql-url'] }));
    for (const r of res) console.log(formatear(r));
    if (res.some((r) => !r.ok)) {
      console.error('ERROR: hay tablas con diferencias.');
      process.exit(1);
    }
  } catch (err) {
    console.error(`ERROR: no se pudo verificar. ${err.message}`);
    process.exit(1);
  }
}
