import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { errorHttp } from '../errores.js';

const HORAS = { recuperacion: 1, invitacion: 72 };
export const MSG_ENLACE = 'El enlace ya fue usado o venció';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Crea un token de un solo uso. En la base queda solo sha256(token). Un token nuevo del mismo tipo para el mismo
// usuario deja inválidos (usado_at) los anteriores sin usar.
export async function crearToken(db, usuarioId, tipo) {
  if (!HORAS[tipo]) throw new Error('Tipo de token inválido');
  const token = randomBytes(32).toString('base64url');
  await db.query(
    'UPDATE tokens_password SET usado_at = UTC_TIMESTAMP(3) WHERE usuario_id = ? AND tipo = ? AND usado_at IS NULL',
    [usuarioId, tipo],
  );
  await db.query(
    'INSERT INTO tokens_password (id, usuario_id, token_hash, tipo, expira_at) VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? HOUR))',
    [randomUUID(), usuarioId, sha256(token), tipo, HORAS[tipo]],
  );
  return token;
}

// Consume el token de forma atómica: el UPDATE condicional hace que solo un pedido gane.
export async function consumirToken(db, token) {
  if (typeof token !== 'string' || !token || token.length > 200) throw errorHttp(400, MSG_ENLACE);
  const hash = sha256(token);
  const [r] = await db.query(
    'UPDATE tokens_password SET usado_at = UTC_TIMESTAMP(3) WHERE token_hash = ? AND usado_at IS NULL AND expira_at > UTC_TIMESTAMP(3)',
    [hash],
  );
  if (r.affectedRows !== 1) throw errorHttp(400, MSG_ENLACE);
  const [f] = await db.query('SELECT usuario_id, tipo FROM tokens_password WHERE token_hash = ?', [hash]);
  return { usuarioId: f[0].usuario_id, tipo: f[0].tipo };
}
