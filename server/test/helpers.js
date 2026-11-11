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
  let creada = false;
  try {
    await admin.query(`CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    creada = true;
    await admin.query(`USE \`${nombre}\``);
    await admin.query(readFileSync(SCHEMA, 'utf8'));
  } catch (err) {
    // Si falló el schema, no dejar la base huérfana.
    if (creada) await admin.query(`DROP DATABASE IF EXISTS \`${nombre}\``).catch(() => {});
    throw err;
  } finally {
    await admin.end();
  }
  const pool = crearPool({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: nombre });
  pool.nombreDbTest = nombre;
  return pool;
}

// Cierra el pool y borra la base temporal.
export async function limpiar(pool) {
  if (!pool) return;
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

// Inicia sesión por la API y devuelve la cookie lista para reenviar ("sid=..."). El agente de supertest no
// reenvía cookies Secure por http, así que los tests la reenvían a mano con .set('Cookie', cookie).
export async function iniciarSesionComo(app, email, password, origin = 'https://inventario.chacalo.com.ar') {
  const request = (await import('supertest')).default;
  const r = await request(app).post('/api/auth/login')
    .set('Origin', origin).set('X-Forwarded-Proto', 'https').send({ email, password });
  if (r.status !== 200) throw new Error(`iniciarSesionComo: login falló con ${r.status}`);
  const sid = (r.headers['set-cookie'] || []).find((c) => c.startsWith('sid='));
  return sid.split(';')[0];
}

// Mailer falso: guarda los mails en `enviados`. `fallarCon(error)` hace que el próximo envío (y los siguientes) rechacen.
export function crearMailerFalso() {
  const m = {
    enviados: [],
    error: null,
    fallarCon(e = new Error('SMTP caído')) { m.error = e; },
    async enviar(msg) {
      if (m.error) throw m.error;
      m.enviados.push(msg);
    },
  };
  return m;
}
