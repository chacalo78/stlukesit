const REQUERIDAS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'SESSION_SECRET', 'APP_URL'];

export function leerConfig(env = process.env) {
  const faltan = REQUERIDAS.filter((k) => !env[k]);
  if (faltan.length) throw new Error(`Faltan variables de entorno: ${faltan.join(', ')}`);
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
      fromName: env.SMTP_FROM_NAME,
      fromEmail: env.SMTP_FROM_EMAIL,
    },
    appUrl: env.APP_URL.replace(/\/+$/, ''),
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}
