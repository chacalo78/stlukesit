import 'dotenv/config';
import { leerConfig } from './config.js';
import { crearPool } from './db.js';
import { crearApp } from './app.js';
import { crearMailer } from './mail/mailer.js';

const config = leerConfig(); // falla rápido si falta algo requerido
const db = crearPool(config.db);
const app = crearApp({ db, mailer: crearMailer(config), config });
app.listen(config.port, () => console.log(`API escuchando en el puerto ${config.port}`));
