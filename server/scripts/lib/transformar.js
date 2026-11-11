// Transformaciones puras entre filas de Postgres (Supabase) y MySQL. Sin acceso a base de datos.
//
// Tipos de columna: t = texto/uuid/int (sin cambios), ts = timestamp, d = date, j = json, b = booleano.
// Los timestamptz de Postgres tienen microsegundos; MySQL DATETIME(3) solo milisegundos: se TRUNCAN
// (no se redondean) a ms. verificar.js compara a precisión de ms.

export const TABLAS_DATOS = [
  'equipos', 'movimientos', 'prestamos', 'solicitudes_cambio', 'feedback_desarrollador', 'repuestos',
];

// Columnas comunes a ambos lados, en orden. 'usuarios' (MySQL) equivale a 'user_roles' (Postgres).
export const COLUMNAS = {
  equipos: [
    ['id', 't'], ['numero_inventario', 't'], ['tipo', 't'], ['marca', 't'], ['modelo', 't'], ['numero_serie', 't'],
    ['estado', 't'], ['ubicacion', 't'], ['fecha_adquisicion', 'd'], ['garantia_hasta', 'd'], ['observaciones', 't'],
    ['created_at', 'ts'], ['updated_at', 'ts'], ['sector', 't'], ['usuario', 't'], ['id_red', 't'], ['procesador', 't'],
    ['ram', 't'], ['disco', 't'], ['tipo_disco', 't'], ['sistema_operativo', 't'], ['fecha_baja_definitiva', 'ts'],
    ['dado_de_baja_definitiva_por', 't'],
  ],
  movimientos: [
    ['id', 't'], ['equipo_id', 't'], ['tipo_movimiento', 't'], ['descripcion', 't'], ['usuario', 't'], ['fecha', 'ts'],
  ],
  prestamos: [
    ['id', 't'], ['equipo_id', 't'], ['persona', 't'], ['sector', 't'], ['fecha_prestamo', 'd'],
    ['fecha_devolucion_estimada', 'd'], ['fecha_devolucion_real', 'ts'], ['observaciones_entrega', 't'],
    ['registrado_por', 't'], ['created_at', 'ts'], ['observaciones_devolucion', 't'], ['email_destinatario', 't'],
  ],
  solicitudes_cambio: [
    ['id', 't'], ['tipo_accion', 't'], ['equipo_id', 't'], ['datos_propuestos', 'j'], ['datos_anteriores', 'j'],
    ['estado', 't'], ['solicitado_por', 't'], ['solicitado_por_email', 't'], ['fecha_solicitud', 'ts'],
    ['resuelto_por', 't'], ['fecha_resolucion', 'ts'], ['comentario_resolucion', 't'],
  ],
  feedback_desarrollador: [
    ['id', 't'], ['tipo', 't'], ['seccion', 't'], ['asunto', 't'], ['descripcion', 't'], ['estado', 't'],
    ['reportado_por', 't'], ['reportado_por_email', 't'], ['created_at', 'ts'],
  ],
  repuestos: [
    ['id', 't'], ['categoria', 't'], ['marca', 't'], ['modelo', 't'], ['cantidad', 't'], ['ubicacion', 't'],
    ['observaciones', 't'], ['created_at', 'ts'], ['updated_at', 'ts'],
  ],
  // Columnas comparables de usuarios (sin updated_at, que no existe en user_roles).
  usuarios: [
    ['id', 't'], ['email', 't'], ['password_hash', 't'], ['nombre', 't'], ['rol', 't'], ['sede', 't'],
    ['habilitado', 'b'], ['created_at', 'ts'],
  ],
};

const RE_TS = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

// Devuelve un Date (UTC) desde Date | string de Postgres/ISO/MySQL (sin zona = UTC). Trunca a ms.
export function parseTs(v) {
  if (v instanceof Date) return v;
  const m = RE_TS.exec(String(v).trim());
  if (!m) throw new Error(`Timestamp no reconocido: ${String(v).slice(0, 40)}`);
  const ms = (m[3] ?? '').padEnd(3, '0').slice(0, 3);
  let tz = m[4] ?? 'Z';
  if (/^[+-]\d{2}$/.test(tz)) tz += ':00';
  else if (/^[+-]\d{4}$/.test(tz)) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const d = new Date(`${m[1]}T${m[2]}.${ms}${tz}`);
  if (Number.isNaN(d.getTime())) throw new Error(`Timestamp inválido: ${String(v).slice(0, 40)}`);
  return d;
}

export const aIsoMs = (v) => parseTs(v).toISOString(); // 2026-11-11T02:30:00.000Z
export const aMysqlDt = (v) => aIsoMs(v).replace('T', ' ').replace('Z', ''); // 2026-11-11 02:30:00.000

// DATE: se conserva la cadena YYYY-MM-DD sin tocar zonas horarias.
export function aFecha(v) {
  if (typeof v === 'string') return v.slice(0, 10);
  const p = (n) => String(n).padStart(2, '0');
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`; // fallback: no debería ocurrir
}

const aObjeto = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

// JSON con claves ordenadas recursivamente (para hash comparable).
export function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function mapear(tabla, fila, fn) {
  const out = {};
  for (const [col, tipo] of COLUMNAS[tabla]) {
    const v = fila[col];
    out[col] = v === undefined || v === null ? null : fn(tipo, v);
  }
  return out;
}

const aMy = (tipo, v) => {
  if (tipo === 'ts') return aMysqlDt(v);
  if (tipo === 'd') return aFecha(v);
  if (tipo === 'j') return JSON.stringify(aObjeto(v));
  if (tipo === 'b') return v ? 1 : 0;
  return v;
};
const aPg = (tipo, v) => {
  if (tipo === 'ts') return aIsoMs(v);
  if (tipo === 'd') return aFecha(v);
  if (tipo === 'j') return aObjeto(v);
  if (tipo === 'b') return Boolean(v);
  return v;
};

// Postgres -> MySQL. Para 'usuarios', `filas` son las de user_roles y ctx.authUsers las de auth.users.
// Devuelve filas con las columnas de la tabla MySQL (usuarios incluye password_hash y updated_at).
export function aMysql(tabla, filas, ctx = {}) {
  if (tabla === 'usuarios') {
    const hashes = new Map();
    for (const a of ctx.authUsers ?? []) {
      const k = String(a.email).toLowerCase();
      if (!hashes.has(k)) hashes.set(k, a.encrypted_password ?? null);
    }
    return filas.map((f) => {
      const o = mapear('usuarios', f, aMy);
      o.password_hash = hashes.get(String(f.email).toLowerCase()) ?? null;
      o.updated_at = o.created_at;
      return o;
    });
  }
  return filas.map((f) => mapear(tabla, f, aMy));
}

// MySQL -> Postgres. Para 'usuarios' devuelve filas de user_roles (sin password_hash ni updated_at).
export function aPostgres(tabla, filas) {
  if (tabla === 'usuarios') {
    return filas.map((f) => {
      const o = mapear('usuarios', f, aPg);
      delete o.password_hash;
      return o;
    });
  }
  return filas.map((f) => mapear(tabla, f, aPg));
}
