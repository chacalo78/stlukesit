import mysql from 'mysql2/promise';

export const SET_SESION =
  "SET time_zone = '+00:00', sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'";

export function crearPool(config) {
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    dateStrings: ['DATE'],
    connectionLimit: config.connectionLimit ?? 5,
  });
  // R26 + m-9: toda conexión del pool trabaja en UTC y en modo estricto (Hostinger trae sql_mode no estricto, que
  // recortaría datos en silencio). Los comandos de una conexión se encolan en orden, así que el SET corre antes de
  // cualquier consulta que la use. Si falla, se descarta la conexión: mejor un error que datos recortados.
  pool.pool.on('connection', (conn) => {
    conn.query(SET_SESION, (err) => {
      if (err) {
        console.error('No se pudo configurar la conexión MySQL (time_zone/sql_mode):', err.code || err.message);
        conn.destroy();
      }
    });
  });
  return pool;
}
