import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import { crearRutasAuth } from '../auth/rutas.js';
import { crearRutasUsuarios } from './usuarios.js';
import { crearRutasEquipos } from './equipos.js';
import { crearRutasMovimientos } from './movimientos.js';
import { NOMBRE_COOKIE, MAX_AGE_MS, opcionesCookie } from '../auth/sesion.js';

const MySQLStore = MySQLStoreFactory(session);

// Monta sesiones y todas las rutas reales de la API. Las tareas siguientes agregan sus routers acá.
export function montarRutas(app, { db, config }) {
  const store = new MySQLStore({
    createDatabaseTable: false,
    clearExpired: false, // se limpia abajo con manejo de errores (el intervalo del store no captura rechazos)
    endConnectionOnClose: false, // el pool es de la app
    expiration: MAX_AGE_MS,
    schema: { tableName: 'sesiones', columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' } },
  }, db);
  const limpieza = setInterval(() => store.clearExpiredSessions().catch(() => {}), 15 * 60 * 1000);
  limpieza.unref();
  app.locals.sessionStore = store;

  app.use(session({
    name: NOMBRE_COOKIE,
    secret: config.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { ...opcionesCookie(config), maxAge: MAX_AGE_MS },
  }));

  app.use('/api/auth', crearRutasAuth({ ahora: config.ahora }));
  app.use('/api/usuarios', crearRutasUsuarios());
  app.use('/api/equipos', crearRutasEquipos());
  app.use('/api/movimientos', crearRutasMovimientos());
}
