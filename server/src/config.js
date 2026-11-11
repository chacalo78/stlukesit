const REQUERIDAS = [
  'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'SESSION_SECRET', 'APP_URL', 'CORS_ORIGINS',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL',
];

// Normaliza un origen: sin espacios, sin "/" final, esquema y host en minúsculas.
function normalizarOrigen(s) {
  return s.trim().replace(/\/+$/, '').replace(/^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)/i, (_, esquema, host) => esquema.toLowerCase() + host.toLowerCase());
}

function leerTrustProxy(valor) {
  if (valor === undefined || valor === '') return 1;
  if (!/^\d+$/.test(String(valor).trim())) {
    throw new Error('TRUST_PROXY debe ser un entero no negativo (cantidad de proxies delante de Node)');
  }
  return Number(valor);
}

export function leerConfig(env = process.env) {
  const faltan = REQUERIDAS.filter((k) => !env[k] || !String(env[k]).trim());
  if (faltan.length) throw new Error(`Faltan variables de entorno: ${faltan.join(', ')}`);
  if (env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres');
  const corsOrigins = [...new Set(env.CORS_ORIGINS.split(',').map(normalizarOrigen).filter(Boolean))];
  if (!corsOrigins.length) throw new Error('Faltan variables de entorno: CORS_ORIGINS (sin orígenes válidos)');
  return {
    port: Number(env.PORT) || 3000,
    db: {
      host: env.DB_HOST,
      port: Number(env.DB_PORT) || 3306,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
    },
    sessionSecret: env.SESSION_SECRET,
    cookieDomain: env.COOKIE_DOMAIN || undefined, // '.chacalo.com.ar' en producción
    smtp: {
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT) || 465,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      fromName: env.SMTP_FROM_NAME || 'Sistema IT de ST. Luke´s',
      fromEmail: env.SMTP_FROM_EMAIL,
    },
    appUrl: env.APP_URL.replace(/\/+$/, ''),
    corsOrigins,
    trustProxy: leerTrustProxy(env.TRUST_PROXY),
    diagnostico: env.DIAGNOSTICO === '1',
  };
}
