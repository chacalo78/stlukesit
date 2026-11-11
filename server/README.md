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

## Producción

Copiar `.env.example` a `.env` (o cargar las variables en hPanel). `npm start` falla al arrancar si faltan las variables de base de datos o `SESSION_SECRET`.
