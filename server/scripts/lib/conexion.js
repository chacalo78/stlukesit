import pg from 'pg';
import mysql from 'mysql2/promise';

// DATE (1082), timestamptz (1184) y timestamp (1114) llegan como texto crudo: sin conversión a Date
// por zona horaria local ni redondeo de microsegundos (la conversión a UTC/ms la hace transformar.js).
const crudo = new Set([1082, 1184, 1114]);
const types = { getTypeParser: (oid, fmt) => (crudo.has(oid) ? (s) => s : pg.types.getTypeParser(oid, fmt)) };

export async function abrirPg(url) {
  const c = new pg.Client({ connectionString: url, types });
  await c.connect();
  return c;
}

export async function abrirMysql(url) {
  return mysql.createConnection({ uri: url, dateStrings: true, timezone: 'Z', charset: 'utf8mb4' });
}

export function resolverUrls(opts = {}, env = process.env) {
  return { pgUrl: opts.pgUrl ?? env.PG_URL, mysqlUrl: opts.mysqlUrl ?? env.MYSQL_URL };
}

// Parseo manual de --clave=valor o --clave valor.
export function parsearArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Argumento no reconocido: ${a}`);
    const eq = a.indexOf('=');
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else out[a.slice(2)] = argv[++i];
  }
  return out;
}
