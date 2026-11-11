import { COLUMNAS } from './transformar.js';

// Columnas que existen en la base pero que NO se copian/hashean a propósito.
const EXCLUIDAS_PG = { usuarios: [] };
const EXCLUIDAS_MYSQL = { usuarios: ['updated_at'] }; // se completa con created_at al migrar
const nombrePg = (t) => (t === 'usuarios' ? 'user_roles' : t);

// Aborta si alguna tabla migrada tiene en la base (Postgres o MySQL) una columna que no está en COLUMNAS:
// de lo contrario no se copiaría ni se hashearía y verificar diría OK igualmente.
export async function validarEsquema(pgc, my) {
  const sobrantes = [];
  for (const t of Object.keys(COLUMNAS)) {
    const conocidas = new Set(COLUMNAS[t].map(([c]) => c));
    const rp = await pgc.query(
      "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", [nombrePg(t)]);
    for (const { c } of rp.rows) {
      if (!conocidas.has(c) && !(EXCLUIDAS_PG[t] ?? []).includes(c)) sobrantes.push(`${nombrePg(t)}.${c} (Postgres)`);
    }
    const [rm] = await my.query(
      'SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?', [t]);
    for (const { c } of rm) {
      if (!conocidas.has(c) && !(EXCLUIDAS_MYSQL[t] ?? []).includes(c)) sobrantes.push(`${t}.${c} (MySQL)`);
    }
  }
  if (sobrantes.length) {
    throw new Error(`Esquema no cubierto por la migración, columna(s) sin mapear: ${sobrantes.join(', ')}. Actualice COLUMNAS en scripts/lib/transformar.js.`);
  }
}
