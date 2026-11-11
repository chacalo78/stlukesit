# Final fix report (etapa-b)

- I-1: `TRUST_PROXY` (entero >=0, default 1, falla si es invalido) en `server/src/config.js`; `app.js` usa `config.trustProxy ?? 1`. Ruta `GET /api/diagnostico` solo con `DIAGNOSTICO=1` (404 si no). Tests: `test/config.test.js`, `test/app.test.js` (describe "diagnostico de proxy").
- I-2: `config.js` exige `CORS_ORIGINS` y SMTP_* (mensaje en espanol con la lista), normaliza origenes (trim, sin "/" final, esquema+host en minusculas, sin duplicados), `SESSION_SECRET` >= 32, `SMTP_FROM_NAME` default `Sistema IT de ST. Luke´s`. `.env.example` reescrito (todas las vars + seccion PG_URL/MYSQL_URL comentada). `package.json`: engines `22.x`, `cookie-signature@1.2.2` en devDependencies (lock actualizado); `pg` queda en dependencies (lo usan los scripts de migracion). README: seccion "Despliegue en Hostinger". Nota: `verificar.js` no acepta `--confirmar` (solo lee); `--confirmar=<nombre-base-destino>` es de `migrar.js`, y asi quedo documentado.
- I-3: `tokens.test.js` acepta 71 o 72; `vitest.config.js` con `testTimeout: 20000`, `hookTimeout: 30000`.
- m-1: `publico()` en `src/auth/rutas.js` incluye `id` (login y `/sesion`); tests de auth actualizados.
- m-2: el handler 500 loguea `Error 500 en <METODO> <path> (code=..., errno=...)`, sin sql/sqlMessage/cuerpo/query. Test captura console.error con un error de DB forzado y verifica que no aparecen e-mail, hash, token de query ni SQL.

## Resultados
- Suite completa: `Test Files 12 passed (12) / Tests 514 passed (514)`.
- Bucle 10x (`npx vitest run` x10): 10/10 verdes, cada corrida `Test Files 12 passed (12)  Tests 514 passed (514)`.
