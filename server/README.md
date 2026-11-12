# Servidor (API Express + MySQL)

## Tests locales (MariaDB)

```
apt-get install -y mariadb-server
service mariadb start
mysql -uroot <<'SQL'
CREATE USER 'stlukesit_test'@'localhost' IDENTIFIED BY 'test_local_pw';
CREATE USER 'stlukesit_test'@'127.0.0.1' IDENTIFIED BY 'test_local_pw';
GRANT ALL PRIVILEGES ON `stlukesit\_test%`.* TO 'stlukesit_test'@'localhost';
GRANT ALL PRIVILEGES ON `stlukesit\_test%`.* TO 'stlukesit_test'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
npm install && npm test
```

Variables opcionales: `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USER`, `TEST_DB_PASSWORD`. Cada corrida crea una base `stlukesit_test_<random>`, aplica `db/schema.sql` y la borra al terminar.

## Despliegue en Hostinger

1. **Base de datos**: en hPanel, Bases de datos > MySQL, crear la base y el usuario. Anotar host, nombre, usuario y contraseña.
2. **Esquema**: aplicar `db/schema.sql` a esa base, ya sea importándolo en phpMyAdmin (Importar > elegir el archivo) o con el cliente: `mysql -h HOST -u USUARIO -p NOMBRE_BASE < db/schema.sql`.
3. **Variables de entorno**: en hPanel (aplicación Node.js > Variables de entorno) cargar todas las de `.env.example`: base, `SESSION_SECRET` (32+ caracteres), `APP_URL`, `CORS_ORIGINS`, SMTP, `TRUST_PROXY=1`. El servidor no arranca si falta alguna requerida y lo dice en el log.
4. **Instalar**: `npm ci --omit=dev` (Node 22.x).
5. **Arranque**: comando `npm start` (archivo de entrada `src/index.js`).
6. **Verificar**: `GET https://api-inventario.chacalo.com.ar/health` debe devolver `{"ok":true,"db":true}`.
7. **Verificar el proxy**: poner `DIAGNOSTICO=1`, reiniciar y consultar `GET /api/diagnostico`. Debe responder `protocolo: "https"`, `seguro: true` y tu IP pública en `ip`. Si no, ajustar `TRUST_PROXY` (cantidad de proxies delante de Node). Después volver a `DIAGNOSTICO=0` y reiniciar (la ruta devuelve 404 cuando está apagada).
8. **Migrar datos desde Supabase** (primero contra beta), con `PG_URL` y `MYSQL_URL` definidas en el entorno de la terminal:
   ```
   node scripts/migrar.js --desde=supabase --hacia=mysql --confirmar=NOMBRE_BASE_DESTINO
   node scripts/verificar.js
   ```
   `--confirmar` es obligatorio en `migrar.js` y debe ser el nombre exacto de la base de destino; sin él el script aborta. `verificar.js` solo lee y compara conteos y hashes por tabla (sale con código 1 si hay diferencias). Las URLs se toman de `PG_URL` / `MYSQL_URL` o de `--pg-url` / `--mysql-url`.

Notas:
- **Supabase**: usar el host del *session pooler* (IPv4) en `PG_URL`; la conexión directa de Supabase es solo IPv6 y suele fallar desde Hostinger.
- **MySQL remoto**: si el script se corre desde fuera de Hostinger (tu PC), activar en hPanel Bases de datos > MySQL remoto y autorizar tu IP; el host a usar en `MYSQL_URL` es el que muestra hPanel, no `localhost`.
- DNS: el subdominio de la API va como registro A en Cloudflare con la nube gris (solo DNS), así delante de Node queda un único proxy (el de Hostinger).

## Producción

Copiar `.env.example` a `.env` (o cargar las variables en hPanel). `npm start` falla al arrancar si faltan las variables requeridas (base de datos, `SESSION_SECRET` de 32+ caracteres, `APP_URL`, `CORS_ORIGINS` y SMTP).

## Backups

`scripts/backup.js` hace un volcado lógico de la base y lo guarda en `~/backups/stlukesit/<DB_NAME>-YYYYMMDD-HHMMSS.sql.gz` (directorio 700, archivo 600, fuera de `public_html`). Conserva los 30 más nuevos de esa base. Se escribe a un `.tmp` y se renombra al terminar, así un volcado a medias nunca parece válido. No incluye los datos de `sesiones` (efímeros, con secretos de sesión); sí su estructura.

Credenciales, clave por clave y en este orden: variables de entorno del proceso, `.env` en la raíz de la app (junto a `package.json`) y `~/.stlukesit-backup.env` (formato `DB_HOST=`, `DB_PORT=`, `DB_USER=`, `DB_PASSWORD=`, `DB_NAME=`). Opcional: `BACKUP_DIR` para cambiar el destino y `BACKUP_METODO=node|mysqldump` para forzar el método (por defecto usa `mysqldump` si existe y, si falla o no está, un volcado en Node puro).

Cron diario en Hostinger (hPanel > Avanzado > Cron Jobs, o el conector de Hostinger), 03:00:

```
0 3 * * * /usr/bin/env node /home/u850855608/domains/api-inventario.chacalo.com.ar/hbuilds/current/nodejs/scripts/backup.js
```

La ruta de `node` puede ser otra (Hostinger instala varias versiones; si `/usr/bin/env node` no encuentra una 22.x, usar la ruta completa del binario). Revisar la salida del cron al día siguiente: una línea `backup OK: ...` con archivo, tamaño, tablas y método, o `backup FALLÓ: ...` (código de salida 1) con el motivo, sin contraseñas. Correrlo a mano con `npm run backup` desde el directorio de la app.

Restaurar en una base **vacía** (la base destino sale de `DB_NAME`; `--confirmar` debe ser su nombre exacto):

```
DB_NAME=base_vacia node scripts/restaurar.js --archivo=$HOME/backups/stlukesit/ARCHIVO.sql.gz --confirmar=base_vacia
```

`restaurar.js` se niega a tocar una base con tablas. Con cliente MySQL también sirve: `gunzip -c ARCHIVO.sql.gz | mysql -u USUARIO -p BASE_VACIA`.
