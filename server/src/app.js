import express from 'express';
import helmet from 'helmet';
import { errorHttp } from './errores.js';

const LECTURA = new Set(['GET', 'HEAD', 'OPTIONS']);

// CORS escrito a mano: es una lista exacta de orígenes con credenciales, ~10 líneas, y evita una dependencia.
function cors(permitidos) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    res.vary('Origin');
    if (origin && permitidos.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        res.set('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type');
        res.set('Access-Control-Max-Age', '600');
        return res.sendStatus(204);
      }
    }
    next();
  };
}

function protegerEscrituras(permitidos) {
  return (req, res, next) => {
    if (LECTURA.has(req.method)) return next();
    if (!req.headers.origin || !permitidos.has(req.headers.origin)) {
      return next(errorHttp(403, 'Origen no permitido'));
    }
    const tieneCuerpo = req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length'] || 0) > 0;
    const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (tieneCuerpo && tipo !== 'application/json') {
      return next(errorHttp(415, 'El contenido debe ser application/json'));
    }
    next();
  };
}

// `extra(app)` permite registrar rutas antes del 404 (lo usan las rutas de las tareas siguientes y los tests).
export function crearApp({ db, mailer, config, extra }) {
  const permitidos = new Set(config.corsOrigins);
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors(permitidos));
  app.use(protegerEscrituras(permitidos));
  app.use(express.json({ limit: '1mb' }));
  app.locals.db = db;
  app.locals.mailer = mailer;
  app.locals.config = config;

  app.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ ok: true, db: true });
    } catch {
      res.status(503).json({ ok: false, error: 'Base de datos no disponible' });
    }
  });

  extra?.(app);

  app.use((req, res, next) => next(errorHttp(404, 'No encontrado')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El contenido es demasiado grande' });
    if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  });
  return app;
}
