import 'dotenv/config';
import { leerConfig } from './config.js';
import { crearPool } from './db.js';
import { crearApp } from './app.js';

const config = leerConfig(); // falla rápido si falta algo requerido
const db = crearPool(config.db);
const app = crearApp({ db, mailer: null, config });
app.listen(config.port, () => console.log(`API escuchando en el puerto ${config.port}`));
