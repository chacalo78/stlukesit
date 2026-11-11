import mysql from 'mysql2/promise';

export function crearPool(config) {
  return mysql.createPool({
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
}
