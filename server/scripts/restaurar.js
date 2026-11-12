// Restaura un backup .sql.gz en una base VACÍA.
//   node scripts/restaurar.js --archivo=<ruta.sql.gz> --confirmar=<nombre exacto de la base destino>
// La base destino sale de DB_NAME (mismas fuentes de credenciales que backup.js). Se niega a tocar una base con tablas.
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import mysql from 'mysql2/promise';
import { parsearArgs } from './lib/conexion.js';
import { resolverCredenciales } from './backup.js';

async function leerGz(ruta) {
  const partes = [];
  for await (const p of createReadStream(ruta).pipe(createGunzip())) partes.push(p);
  return Buffer.concat(partes).toString('utf8');
}

export async function restaurar({ archivo, confirmar, credenciales }) {
  const c = credenciales ?? resolverCredenciales();
  if (!archivo) throw new Error('Falta --archivo=<ruta.sql.gz>.');
  if (!confirmar) throw new Error('Falta --confirmar=<nombre-de-la-base-de-destino> (obligatorio).');
  if (confirmar !== c.database) {
    throw new Error(`La base de destino es "${c.database}" y no coincide con --confirmar "${confirmar}". No se modificó nada.`);
  }
  const sql = await leerGz(archivo);
  const con = await mysql.createConnection({
    host: c.host, port: c.port, user: c.user, password: c.password, database: c.database,
    charset: 'utf8mb4', multipleStatements: true,
  });
  try {
    const [tablas] = await con.query('SHOW TABLES');
    if (tablas.length) throw new Error(`La base "${c.database}" ya tiene ${tablas.length} tabla(s); se restaura solo en una base vacía. No se modificó nada.`);
    await con.query(sql);
    const [t2] = await con.query('SHOW TABLES');
    return { tablas: t2.length };
  } finally {
    await con.end().catch(() => {});
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const a = parsearArgs(process.argv.slice(2));
    const r = await restaurar({ archivo: a.archivo, confirmar: a.confirmar });
    console.log(`restauración OK: ${r.tablas} tablas`);
  } catch (err) {
    console.error(`restauración FALLÓ: ${err.message}`);
    process.exit(1);
  }
}
