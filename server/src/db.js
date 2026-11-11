import mysql from 'mysql2/promise';

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
  // R26: toda conexión del pool trabaja en UTC (DEFAULT CURRENT_TIMESTAMP, NOW(), etc.). Los comandos de una
  // conexión se encolan en orden, así que el SET corre antes de cualquier consulta que la use.
  pool.pool.on('connection', (conn) => { conn.query("SET time_zone = '+00:00'", () => {}); });
  return pool;
}
