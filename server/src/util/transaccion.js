import { randomUUID } from 'node:crypto';

export async function enTransaccion(db, fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

// Única implementación del INSERT en `movimientos` (equivale a movimientos.registrar del frontend, pero
// dentro de la transacción de quien lo llama). equipoId opcional (los movimientos de usuarios no tienen).
export const movimiento = (conn, tipo, descripcion, usuario, equipoId = null) => conn.query(
  'INSERT INTO movimientos (id, equipo_id, tipo_movimiento, descripcion, usuario) VALUES (?, ?, ?, ?, ?)',
  [randomUUID(), equipoId, tipo, descripcion, usuario],
);
