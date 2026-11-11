// Migración ida y vuelta Supabase-Postgres <-> MySQL.
//   node scripts/migrar.js --desde=supabase --hacia=mysql --pg-url=... --mysql-url=... --confirmar=<nombre-base-destino>
//   node scripts/migrar.js --desde=mysql --hacia=supabase --pg-url=... --mysql-url=... --confirmar=<nombre-base-destino>
// URLs también por env PG_URL / MYSQL_URL. Idempotente: en una transacción sobre el destino vacía las
// tablas de datos y recarga todo. No hace DROP/TRUNCATE. `aprobaciones` no se migra.
import { fileURLToPath } from 'node:url';
import { abrirPg, abrirMysql, resolverUrls, parsearArgs } from './lib/conexion.js';
import { validarEsquema } from './lib/esquema.js';
import { COLUMNAS, TABLAS_DATOS, aMysql, aPostgres } from './lib/transformar.js';

// Orden de carga (padres primero); el borrado usa el orden inverso.
const ORDEN_CARGA = ['usuarios', 'equipos', 'movimientos', 'prestamos', 'solicitudes_cambio', 'feedback_desarrollador', 'repuestos'];
const ORDEN_BORRADO = [...ORDEN_CARGA].reverse();
const LOTE = 200;
const nombrePg = (t) => (t === 'usuarios' ? 'user_roles' : t);
const cols = (t) => COLUMNAS[t].map(([c]) => c);
const colsPg = (t) => cols(t).filter((c) => !(t === 'usuarios' && c === 'password_hash'));

async function leerPg(pgc) {
  const datos = {};
  await pgc.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    for (const t of ORDEN_CARGA) {
      const r = await pgc.query(`SELECT ${colsPg(t).join(', ')} FROM ${nombrePg(t)}`);
      datos[t] = r.rows;
    }
    datos.auth = (await pgc.query('SELECT id, email, encrypted_password FROM auth.users')).rows;
  } finally {
    await pgc.query('ROLLBACK');
  }
  return datos;
}

async function supabaseAMysql({ pgc, my, log, warn }) {
  const datos = await leerPg(pgc);

  const emailsRoles = new Set(datos.usuarios.map((u) => u.email.toLowerCase()));
  const sinRol = datos.auth.filter((a) => !emailsRoles.has(String(a.email).toLowerCase()));
  if (sinRol.length) warn(`ADVERTENCIA: ${sinRol.length} cuenta(s) de auth.users sin fila en user_roles NO se migran: ${sinRol.map((a) => a.email).join(', ')}`);
  const emailsAuth = new Set(datos.auth.map((a) => String(a.email).toLowerCase()));
  const sinLogin = datos.usuarios.filter((u) => !emailsAuth.has(u.email.toLowerCase()));
  if (sinLogin.length) warn(`ADVERTENCIA: ${sinLogin.length} usuario(s) sin cuenta de login quedan con password_hash NULL`);

  const filas = {};
  for (const t of ORDEN_CARGA) filas[t] = aMysql(t, datos[t], { authUsers: datos.auth });

  try {
    await my.beginTransaction();
    for (const t of ['sesiones', 'tokens_password', ...ORDEN_BORRADO]) await my.query(`DELETE FROM \`${t}\``);
    for (const t of ORDEN_CARGA) {
      const c = t === 'usuarios' ? [...cols(t), 'updated_at'] : cols(t);
      for (let i = 0; i < filas[t].length; i += LOTE) {
        const lote = filas[t].slice(i, i + LOTE).map((f) => c.map((k) => f[k]));
        await my.query(`INSERT INTO \`${t}\` (${c.map((k) => `\`${k}\``).join(', ')}) VALUES ?`, [lote]);
      }
      log(`${t}: ${filas[t].length} filas copiadas a MySQL`);
    }
    await my.commit();
  } catch (err) {
    await my.rollback().catch(() => {});
    throw err;
  }
  return { advertencias: { sinRol: sinRol.length, sinLogin: sinLogin.length } };
}

async function insertarPg(pgc, t, filas) {
  const c = colsPg(t);
  const tipos = Object.fromEntries(COLUMNAS[t]);
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const params = [];
    const grupos = lote.map((f) => `(${c.map((k) => {
      const v = f[k];
      params.push(tipos[k] === 'j' && v !== null ? JSON.stringify(v) : v);
      return tipos[k] === 'j' ? `$${params.length}::jsonb` : `$${params.length}`;
    }).join(', ')})`);
    await pgc.query(`INSERT INTO ${nombrePg(t)} (${c.join(', ')}) VALUES ${grupos.join(', ')}`, params);
  }
}

// aprobaciones no se migra, pero en Postgres tiene ON DELETE CASCADE hacia equipos: borrar equipos la vaciaría.
async function contarAprobaciones(pgc) {
  const { rows: [r] } = await pgc.query("SELECT to_regclass('public.aprobaciones') AS t");
  if (!r.t) return 0;
  return Number((await pgc.query('SELECT count(*) AS n FROM public.aprobaciones')).rows[0].n);
}

async function mysqlASupabase({ pgc, my, log, warn }) {
  const crudo = {};
  await my.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
  try {
    for (const t of ORDEN_CARGA) {
      const [rows] = await my.query(`SELECT ${cols(t).join(', ')} FROM \`${t}\``);
      crudo[t] = rows;
    }
  } finally {
    await my.query('ROLLBACK');
  }
  const filas = {};
  for (const t of ORDEN_CARGA) filas[t] = aPostgres(t, crudo[t]);

  let actualizadas = 0;
  let sinAuth = [];
  try {
    await pgc.query('BEGIN');
    const aprob = await contarAprobaciones(pgc);
    if (aprob > 0) {
      throw new Error(`La tabla aprobaciones tiene ${aprob} fila(s) y no se migra; borrar equipos las eliminaría en cascada. No se modificó nada.`);
    }
    for (const t of ORDEN_BORRADO) await pgc.query(`DELETE FROM ${nombrePg(t)}`);
    for (const t of ORDEN_CARGA) {
      await insertarPg(pgc, t, filas[t]);
      log(`${t}: ${filas[t].length} filas copiadas a Postgres`);
    }
    // auth.users: solo se actualiza la contraseña cuando difiere; nunca INSERT/DELETE.
    const auth = (await pgc.query('SELECT lower(email) AS email FROM auth.users')).rows;
    const emailsAuth = new Set(auth.map((a) => a.email));
    sinAuth = crudo.usuarios.filter((u) => !emailsAuth.has(u.email.toLowerCase())).map((u) => u.email);
    for (const u of crudo.usuarios) {
      if (!u.password_hash) continue;
      const r = await pgc.query(
        'UPDATE auth.users SET encrypted_password = $1 WHERE lower(email) = lower($2) AND encrypted_password IS DISTINCT FROM $1',
        [u.password_hash, u.email],
      );
      actualizadas += r.rowCount;
    }
    if ((await contarAprobaciones(pgc)) !== aprob) throw new Error('aprobaciones cambió durante la migración; se revierte todo.');
    await pgc.query('COMMIT');
  } catch (err) {
    await pgc.query('ROLLBACK').catch(() => {});
    throw err;
  }
  log(`auth.users: ${actualizadas} contraseña(s) actualizada(s)`);
  if (sinAuth.length) warn(`ADVERTENCIA: ${sinAuth.length} usuario(s) sin cuenta en auth.users (no podrán entrar a Supabase): ${sinAuth.join(', ')}`);
  return { advertencias: { sinAuth: sinAuth.length }, passwordsActualizadas: actualizadas };
}

// `confirmar` es obligatorio: debe ser el nombre exacto de la base de destino (se lee de la conexión).
export async function migrar({ desde, hacia, pgUrl, mysqlUrl, confirmar, log = console.log, warn = console.warn }) {
  if (!pgUrl || !mysqlUrl) throw new Error('Faltan las URLs: use --pg-url y --mysql-url (o PG_URL y MYSQL_URL).');
  const ida = desde === 'supabase' && hacia === 'mysql';
  const vuelta = desde === 'mysql' && hacia === 'supabase';
  if (!ida && !vuelta) throw new Error('Use --desde=supabase --hacia=mysql  o  --desde=mysql --hacia=supabase.');
  if (!confirmar) throw new Error('Falta --confirmar <nombre-de-la-base-de-destino> (obligatorio).');

  const pgc = await abrirPg(pgUrl);
  let my;
  try {
    my = await abrirMysql(mysqlUrl);
    await validarEsquema(pgc, my);
    const destino = ida
      ? (await my.query('SELECT DATABASE() AS n'))[0][0].n
      : (await pgc.query('SELECT current_database() AS n')).rows[0].n;
    if (destino !== confirmar) {
      throw new Error(`La base de destino es "${destino}" y no coincide con --confirmar "${confirmar}". No se modificó nada.`);
    }
    return await (ida ? supabaseAMysql : mysqlASupabase)({ pgc, my, log, warn });
  } finally {
    await my?.end().catch(() => {});
    await pgc.end().catch(() => {});
  }
}

export { TABLAS_DATOS };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const a = parsearArgs(process.argv.slice(2));
    const urls = resolverUrls({ pgUrl: a['pg-url'], mysqlUrl: a['mysql-url'] });
    await migrar({ desde: a.desde, hacia: a.hacia, confirmar: a.confirmar, ...urls });
    console.log('Migración completada. Ejecute verificar.js para comparar ambos lados.');
  } catch (err) {
    console.error(`ERROR: ${err.message} (si el destino llegó a modificarse, la transacción se revirtió)`);
    process.exit(1);
  }
}
