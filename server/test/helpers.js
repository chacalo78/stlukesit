import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { crearPool } from '../src/db.js';

const SCHEMA = fileURLToPath(new URL('../db/schema.sql', import.meta.url));

function cfgTest() {
  return {
    host: process.env.TEST_DB_HOST || '127.0.0.1',
    port: Number(process.env.TEST_DB_PORT || 3306),
    user: process.env.TEST_DB_USER || 'stlukesit_test',
    password: process.env.TEST_DB_PASSWORD || 'test_local_pw',
  };
}

// Crea una base temporal (stlukesit_test_<random>), aplica schema.sql y devuelve un pool sobre ella.
export async function crearDbDeTest() {
  const cfg = cfgTest();
  const nombre = `stlukesit_test_${randomBytes(6).toString('hex')}`;
  // multipleStatements solo en esta conexión auxiliar, nunca en el pool de la app.
  const admin = await mysql.createConnection({ ...cfg, multipleStatements: true });
  try {
    await admin.query(`CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`USE \`${nombre}\``);
    await admin.query(readFileSync(SCHEMA, 'utf8'));
  } finally {
    await admin.end();
  }
  const pool = crearPool({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: nombre });
  pool.nombreDbTest = nombre;
  return pool;
}

// Cierra el pool y borra la base temporal.
export async function limpiar(pool) {
  const nombre = pool.nombreDbTest;
  await pool.end();
  if (!nombre?.startsWith('stlukesit_test_')) return;
  const admin = await mysql.createConnection(cfgTest());
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${nombre}\``);
  } finally {
    await admin.end();
  }
}
