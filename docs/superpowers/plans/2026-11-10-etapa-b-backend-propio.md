# Etapa B — Backend propio en Hostinger (adiós Supabase) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar Supabase (base, login, permisos y Edge Functions) por un backend Node.js + MySQL en el hosting de Hostinger, sin cortar el servicio y con vuelta atrás posible en cada paso.

**Architecture:** El frontend estático sigue en `inventario.chacalo.com.ar` (deploy FTPS actual). Se agrega una API Express en `api-inventario.chacalo.com.ar` (app Node.js de Hostinger) sobre MySQL de Hostinger. La clave de la migración "pacífica" es una **capa de datos única en el frontend (`src/api/`)** con dos implementaciones intercambiables (Supabase y API propia) elegidas en el build por `VITE_BACKEND`: primero se refactoriza sin cambiar comportamiento, después se prueba la API propia en un sitio beta con una copia de los datos, y el corte final es solo un redeploy del frontend.

**Tech Stack:** Node.js 22 · Express 5 · mysql2 · bcryptjs · express-session + express-mysql-session · zod · nodemailer · helmet · express-rate-limit · vitest + supertest (tests, contra MariaDB local) · `pg` (solo para el script de migración).

**Spec:** Este documento (sección "Diseño" abajo). Contexto previo: memoria del proyecto `project_stlukesit_hostinger_migration` y `project_stlukesit_overview`.

---

## Estado actual (relevado 2026-11-10)

| Pieza | Hoy |
|---|---|
| Datos | Postgres Supabase, 13 MB: `equipos` 820, `movimientos` 1038, `prestamos` 3, `repuestos` 51, `solicitudes_cambio` 4, `user_roles` 12, `feedback_desarrollador` 10, `aprobaciones` 0 (sin uso en el código) |
| Login | Supabase Auth, 4 cuentas (2 super_admin, 2 admin), hashes bcrypt `$2a$` |
| Hallazgo | 8 usuarios (4 coordinador, 4 director) tienen fila en `user_roles` pero **no tienen cuenta de login**: la app no crea cuentas, hoy no pueden entrar |
| Permisos | RLS por tabla (ver matriz en Tarea 9) + helpers `is_admin_or_super()`, `can_manage_equipos()`, etc. |
| Funciones | `reset-password`, `toggle-user-access`, `notify-prestamo`, `notify-password-changed` (SMTP Gmail `tecnico@colegiosanlucas.edu.ar`) |
| Frontend | 64 llamadas a `supabase.*` en 19 archivos; joins usados: `movimientos→equipos`, `prestamos→equipos`, `solicitudes_cambio→equipos` |
| Sin uso | Storage, Realtime, RPC |

## Diseño

**Principios de la migración pacífica**
1. Producción nunca depende de algo no probado: todo lo nuevo se prueba primero en beta con una copia de los datos.
2. Cada fase se puede deshacer sola. Supabase queda intacto (solo lectura) 30 días después del corte.
3. Los usuarios no notan el cambio salvo un único re-login: misma URL, mismas contraseñas, mismas pantallas.
4. El corte se hace en una ventana corta acordada (fuera del horario escolar), con los datos migrados de nuevo justo en ese momento.

**Fases**

| Fase | Qué | Riesgo en producción | Vuelta atrás |
|---|---|---|---|
| 0 | Verificar Hostinger (Node, MySQL, SMTP, SSH) | ninguno | — |
| 1 | Capa `src/api/` sobre Supabase (refactor) | bajo | redeploy versión anterior |
| 2 | Esquema MySQL + script de migración ida y vuelta | ninguno | — |
| 3 | API Express (login, permisos, endpoints, mails) | ninguno (no la usa nadie aún) | — |
| 4 | Frontend con `VITE_BACKEND=propio` en `beta-inventario` + deploy de la API | ninguno | — |
| 5 | Ensayo general con todos los roles | ninguno | — |
| 6 | Corte | medio, acotado a la ventana | redeploy frontend Supabase + script inverso |
| 7 | Retiro de Supabase (≥30 días después) | ninguno | backup `pg_dump` |

**Decisiones de diseño**
- **Sesiones en servidor** (tabla `sesiones` en MySQL), cookie `sid` `HttpOnly; Secure; SameSite=Lax; Domain=.chacalo.com.ar`. Inhabilitar un usuario borra sus sesiones (efecto inmediato, mejor que el ban de Supabase).
- `inventario.` y `api-inventario.` son *same-site* (`chacalo.com.ar`) → la cookie viaja con `fetch(..., { credentials: 'include' })`; CORS con origen exacto `https://inventario.chacalo.com.ar` (y el de beta) y `credentials: true`.
- **CSRF:** SameSite=Lax + la API exige `Content-Type: application/json` en toda escritura y verifica `Origin` contra la lista permitida.
- **UUIDs** como `CHAR(36)` generados en Node (`crypto.randomUUID()`), conservando los IDs existentes.
- **Fechas:** `timestamptz` → `DATETIME(3)` en UTC; `date` → `DATE`. La API devuelve timestamps como ISO con `Z` y fechas como `YYYY-MM-DD` (igual que Supabase hoy), así el frontend no cambia su formateo.
- **Charset:** `utf8mb4` / `utf8mb4_0900_ai_ci` (o `utf8mb4_unicode_ci` si es MariaDB) en base, tablas y conexión — hubo problemas de acentos en el pasado.
- **Contraseñas:** se migran los hashes bcrypt tal cual a `usuarios.password_hash`; bcryptjs verifica `$2a$`. Hashes nuevos con costo 12.
- **Alta de usuario crea la cuenta de login** y manda un mail de invitación "Creá tu contraseña" (token de un solo uso, 72 h). Resuelve el hallazgo de los 8 usuarios sin login.
- **Operaciones de varios pasos se hacen en una transacción en el servidor** (aprobar solicitud, baja definitiva, préstamo/devolución con cambio de estado + movimiento), en vez de varias llamadas desde el navegador.
- La forma de los datos que devuelve la API es **la misma que devuelve hoy supabase-js** (incluidos los objetos anidados `equipos: {...}`), para que los componentes no cambien.
- `aprobaciones` (tabla sin uso) **no se migra**.

## Global Constraints

- Node.js 22.x (soportado por Hostinger: 18/20/22/24).
- Toda respuesta de error de la API: `{ "error": "<mensaje en español>" }` con status HTTP adecuado (400/401/403/404/409/429/500).
- Textos de UI y mails en español rioplatense, igual tono que los actuales.
- Secretos solo en variables de entorno (hPanel / `.env`), nunca en el repo: `DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME SESSION_SECRET SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM_NAME SMTP_FROM_EMAIL APP_URL CORS_ORIGINS`.
- Cada push a `main` que toque el frontend sube `APP_VERSION` +0.001 en `src/version.js`.
- Ninguna escritura sobre Supabase ni sobre la MySQL de producción sin confirmación explícita del usuario en ese momento.
- Mismos valores de dominio que hoy: estados de equipo `Activo, En reparación, Requiere atención, De baja, En depósito, Prestado, Baja Definitiva`; tipos de movimiento `Alta, Baja, Modificación, Traslado, Reparación, Préstamo, Devolución, Alta usuario, Modificación usuario, Baja usuario, Inhabilitado, Habilitado, Restablecimiento de contraseña, Baja Definitiva`; roles `super_admin, admin, coordinador, director`.

## Review Focus

1. **Escalada de privilegios:** un admin o coordinador intentando crear/editar/borrar/inhabilitar un admin o super_admin, o cambiarse el propio rol → 403. Test en Tarea 9 (matriz) y Tarea 10.
2. **Usuario inhabilitado con sesión abierta:** al inhabilitarlo, su próxima request → 401 y la sesión desaparece. Test en Tarea 10.
3. **Acentos y ñ** (`Modificación`, `Préstamo`, `Ñuñez`) sobreviven ida y vuelta Postgres → MySQL → API → Postgres sin cambios. Test en Tarea 6.
4. **Corrimiento de fechas por zona horaria:** `fecha_prestamo` `2026-11-10` (DATE) y `fecha_devolucion_real` con hora no se mueven un día ni 3 horas al migrar ni al leer por la API. Test en Tareas 6 y 13.
5. **Doble clic / doble aprobación:** aprobar dos veces la misma solicitud → la segunda devuelve 409 y hay un solo movimiento. Test en Tarea 12.

---

## Fase 0 — Verificar Hostinger

### Tarea 0: Prueba de concepto en Hostinger

Sin código de producción. Resultado: una sección "Datos de Hostinger" agregada a este documento.

- [ ] **Paso 1:** El usuario crea en hPanel una base MySQL `stlukesit` + usuario, y anota versión (MySQL 8 o MariaDB), host y si permite acceso remoto (lista de IPs).
- [ ] **Paso 2:** El usuario crea una app Node.js en el subdominio `api-inventario.chacalo.com.ar` (registro A en Cloudflare, nube gris, SSL en Hostinger). Anotar: cómo se despliega (repo GitHub con subcarpeta `server/`, o subida de zip), comando de inicio, dónde se cargan variables de entorno, si reinicia sola.
- [ ] **Paso 3:** Desplegar un `server/hello.js` mínimo (Express, `GET /health` que hace `SELECT 1` en MySQL y devuelve `{ok:true, db:"<versión>"}`). Verificar: `curl https://api-inventario.chacalo.com.ar/health` → `{"ok":true,...}`.
- [ ] **Paso 4:** Desde esa app, enviar un mail de prueba por `smtp.gmail.com:465` con las credenciales actuales. Si Hostinger bloquea SMTP saliente: plan B = cuenta de correo de Hostinger o puerto 587; anotar cuál funcionó.
- [ ] **Paso 5:** Verificar si hay SSH (hPanel → Avanzado → SSH) y cron jobs. Determina desde dónde corre el script de migración (Tarea 6) y los backups (Tarea 15).
- [ ] **Paso 6:** Borrar `hello.js`, commit de la sección "Datos de Hostinger".

---

## Fase 1 — Capa de datos en el frontend (sobre Supabase)

Objetivo: que **ningún componente** importe `supabase`; todo pasa por `src/api/`. Sin cambio de comportamiento. Se sube a producción al terminar cada tarea.

**Estructura:**
```
src/api/
  index.js            // reexporta el backend elegido: import.meta.env.VITE_BACKEND === 'propio' ? propio : supabase
  supabase/           // implementación actual (Fase 1)
    auth.js usuarios.js equipos.js movimientos.js solicitudes.js prestamos.js repuestos.js feedback.js
  propio/             // implementación REST (Fase 4), mismos nombres y firmas
    http.js auth.js usuarios.js ... (idem)
```

**Contrato común** (lo que ambas implementaciones exportan; todas las funciones son `async` y **lanzan `Error` con mensaje en español** en vez de devolver `{data, error}`):

| Módulo | Funciones |
|---|---|
| `auth` | `obtenerSesion(): {email}\|null` · `alCambiarSesion(cb): () => void` · `iniciarSesion(email, password)` · `cerrarSesion()` · `pedirRecuperacion(email)` · `cambiarPassword(passwordNueva, passwordActual?)` · `establecerPasswordConToken(token, password)` (solo `propio`; en `supabase` usa la sesión de recuperación) |
| `usuarios` | `miPerfil(): {email,nombre,rol,sede,habilitado}` · `listar()` · `crear(datos)` · `actualizar(id, datos)` · `eliminar(id)` · `cambiarHabilitado(id, habilitado)` · `restablecerPassword(id, passwordNueva)` |
| `equipos` | `listar()` · `obtener(id)` · `crear(datos)` · `actualizar(id, datos)` · `bajaDefinitiva(id)` · `listarBajasDefinitivas()` |
| `movimientos` | `listar({limite?})` (con `equipos(*)`) · `listarPorEquipo(equipoId)` · `registrar({equipo_id, tipo_movimiento, descripcion})` |
| `solicitudes` | `listar()` (con `equipos(numero_inventario,tipo,marca,modelo)`) · `crear(datos)` · `aprobar(id)` · `rechazar(id, comentario)` |
| `prestamos` | `listar()` (con `equipos(id,numero_inventario,tipo,marca,modelo,ubicacion)`) · `crear(datos)` · `devolver(id, observaciones)` |
| `repuestos` | `listar()` · `crear(datos)` · `actualizar(id, datos)` · `eliminar(id)` |
| `feedback` | `listar()` · `crear(datos)` · `actualizar(id, datos)` · `eliminar(id)` |
| `exportar` | `todo(): {equipos, movimientos, prestamos, repuestos, ...}` |

Las firmas exactas de `datos` se toman de lo que cada componente inserta/actualiza hoy (no se agregan ni quitan campos).

### Tarea 1: `src/api` — auth y usuarios

**Files:**
- Create: `src/api/index.js`, `src/api/supabase/auth.js`, `src/api/supabase/usuarios.js`
- Modify: `src/App.jsx`, `src/hooks/useUserRole.js`, `src/hooks/useIdleLogout.js`, `src/components/Login.jsx`, `src/components/UpdatePassword.jsx`, `src/components/ModalCambiarPassword.jsx`, `src/components/ModalResetPassword.jsx`, `src/components/Usuarios.jsx`, `src/components/Layout.jsx`

**Interfaces:** Produces `auth.*` y `usuarios.*` del contrato.

- [ ] **Paso 1:** Implementar `src/api/supabase/auth.js` y `usuarios.js` moviendo literalmente las llamadas actuales; `restablecerPassword` invoca `reset-password`, `cambiarHabilitado` invoca `toggle-user-access` y luego actualiza `user_roles.habilitado` (mismo orden que hoy en `Usuarios.jsx:128-136`).
- [ ] **Paso 2:** Reemplazar en los componentes listados; `grep -n "supabase" <archivos>` → sin resultados.
- [ ] **Paso 3:** `npm run lint` (0 errores) y `npm run build`.
- [ ] **Paso 4:** Prueba manual en `npm run dev`: login, logout, cierre por inactividad, cambiar contraseña, "olvidé mi contraseña", listar/crear/editar/inhabilitar usuario. Todo igual que antes.
- [ ] **Paso 5:** Bump versión, commit, push, verificar deploy (flujo habitual).

### Tarea 2: `src/api` — equipos, movimientos, solicitudes

**Files:**
- Create: `src/api/supabase/equipos.js`, `movimientos.js`, `solicitudes.js`
- Modify: `src/components/Equipos.jsx`, `ModalEquipo.jsx`, `BajasDefinitivas.jsx`, `Historial.jsx`, `Aprobaciones.jsx`, `Dashboard.jsx`, `Reportes.jsx`

- [ ] **Paso 1:** Implementar los tres módulos con las queries actuales (mismos `select`, `order`, filtros).
- [ ] **Paso 2:** Reemplazar en componentes; grep sin `supabase`.
- [ ] **Paso 3:** Lint + build.
- [ ] **Paso 4:** Prueba manual como admin: alta/edición/baja/baja definitiva de equipo, historial por equipo, Historial general, Dashboard y Reportes muestran los mismos números que antes del cambio (anotar 3 cifras del Dashboard antes y comparar). Como coordinador (ver Tarea 10 para tener cuenta; si aún no hay, probar con un admin cambiando temporalmente su rol en la base **con confirmación**): crear solicitud, aprobarla como admin.
- [ ] **Paso 5:** Bump, commit, push, verificar.

### Tarea 3: `src/api` — préstamos, repuestos, feedback, exportar

**Files:**
- Create: `src/api/supabase/prestamos.js`, `repuestos.js`, `feedback.js`, `exportar.js`
- Modify: `src/components/Prestamos.jsx`, `Repuestos.jsx`, `FeedbackDev.jsx`, `ModalReportarProblema.jsx`, `ExportarDB.jsx`, `src/supabase.js` (solo lo importa `src/api/supabase/*`)

- [ ] **Paso 1:** Implementar; `prestamos.crear` y `devolver` incluyen el envío de mail (`notify-prestamo`) y devuelven `{ mailError?: string }` para que el toast siga mostrando el error real.
- [ ] **Paso 2:** Reemplazar en componentes. Verificar: `grep -rln "from '.*supabase'" src | grep -v "^src/api/supabase/"` → vacío.
- [ ] **Paso 3:** Lint + build.
- [ ] **Paso 4:** Prueba manual: préstamo con mail, devolución con mail, repuestos ABM, reportar problema, exportar DB.
- [ ] **Paso 5:** Bump, commit, push, verificar.

---

## Fase 2 — Base MySQL y migración de datos

### Tarea 4: Esqueleto del servidor y entorno de tests

**Files:**
- Create: `server/package.json`, `server/src/app.js` (`crearApp({db, mailer}): express.Application`), `server/src/index.js` (arranque, lee env), `server/src/db.js` (`crearPool(config): mysql2 Pool` con `timezone: 'Z'`, `dateStrings: ['DATE']`, `charset: 'utf8mb4'`), `server/src/config.js`, `server/test/helpers.js` (`crearDbDeTest()`: crea base temporal, aplica `schema.sql`, devuelve pool; `limpiar(pool)`), `server/vitest.config.js`, `server/.env.example`
- Modify: `.gitignore` (`server/.env`, `server/node_modules`)

- [ ] **Paso 1:** Instalar MariaDB local para tests en el sandbox (`apt-get install -y mariadb-server`) — anotar el comando en `server/README.md`.
- [ ] **Paso 2:** Test `GET /health → 200 {ok:true}` (supertest). Falla.
- [ ] **Paso 3:** Implementar `crearApp` con helmet, `express.json({limit:'1mb'})`, CORS según `CORS_ORIGINS`, manejador de errores que devuelve `{error}`. Test pasa.
- [ ] **Paso 4:** Test: request con `Origin: https://evil.example` a ruta de escritura → 403. Implementar verificación de `Origin`. Pasa.
- [ ] **Paso 5:** Commit.

### Tarea 5: Esquema MySQL

**Files:**
- Create: `server/db/schema.sql`, `server/test/schema.test.js`

Tablas: `usuarios` (fusiona `auth.users` + `user_roles`: `id CHAR(36) PK, email VARCHAR(255) UNIQUE, password_hash VARCHAR(100) NULL, nombre, rol ENUM(...), sede, habilitado BOOL, created_at, updated_at`), `sesiones` (formato express-mysql-session), `tokens_password` (`id, usuario_id FK, token_hash CHAR(64) UNIQUE, tipo ENUM('recuperacion','invitacion'), expira_at, usado_at`), `equipos`, `movimientos`, `prestamos`, `repuestos`, `solicitudes_cambio`, `feedback_desarrollador` con las mismas columnas, defaults y CHECK/ENUM que hoy (ver "Estado actual" y Global Constraints). FKs: `movimientos.equipo_id ON DELETE CASCADE`; `prestamos.equipo_id` y `solicitudes_cambio.equipo_id` sin cascade. `equipos.updated_at ... ON UPDATE CURRENT_TIMESTAMP(3)` reemplaza el trigger.

- [ ] **Paso 1:** Tests: insertar equipo con `estado='Inexistente'` → error; borrar equipo borra sus movimientos; borrar equipo con préstamo → error FK; `email` duplicado en `usuarios` → error; guardar y leer `'Préstamo — Ñandú'` → idéntico.
- [ ] **Paso 2:** Escribir `schema.sql` (`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`). Tests pasan.
- [ ] **Paso 3:** Commit.

### Tarea 6: Script de migración ida y vuelta

**Files:**
- Create: `server/scripts/migrar.js` (`node migrar.js --desde=supabase --hacia=mysql` y `--desde=mysql --hacia=supabase`), `server/scripts/verificar.js` (compara conteos y un hash por tabla), `server/test/migrar.test.js`

Reglas: idempotente (vacía las tablas destino dentro de una transacción y recarga todo); fusiona `auth.users.encrypted_password` en `usuarios.password_hash` por email (los 8 sin login quedan con `password_hash NULL`); no migra `aprobaciones`; convierte `timestamptz` a UTC; el sentido inverso solo toca tablas de datos y `user_roles`/`auth.users.encrypted_password` (para usuarios que cambiaron su contraseña después del corte).

- [ ] **Paso 1:** Tests con una base Postgres de prueba (o fixtures en JSON leídos por una función pura `transformar(tabla, filas)`): `fecha_prestamo '2026-11-10'` sigue igual; `fecha_devolucion_real '2026-11-10T23:30:00-03:00'` → `'2026-11-11 02:30:00.000'` UTC y vuelve a `2026-11-11T02:30:00Z`; texto con acentos idéntico; usuario sin cuenta de login → `password_hash null`.
- [ ] **Paso 2:** Implementar `transformar` y el script. Tests pasan.
- [ ] **Paso 3:** Correr contra la MySQL **de beta** (base aparte `stlukesit_beta`) y `verificar.js` → todas las tablas `OK`, conteos = Supabase.
- [ ] **Paso 4:** Commit.

---

## Fase 3 — API Express

Formato de rutas: `/api/<recurso>`. Respuestas con la misma forma que supabase-js (`data` directo, sin envoltorio).

### Tarea 7: Login y sesiones

**Files:**
- Create: `server/src/auth/rutas.js`, `server/src/auth/sesion.js` (`requiereSesion` middleware: carga `req.usuario` de la base en cada request; si no existe o `habilitado=false` → destruye sesión y 401), `server/test/auth.test.js`

Rutas: `POST /api/auth/login {email,password}` · `POST /api/auth/logout` · `GET /api/auth/sesion → {email,nombre,rol,sede,habilitado}|401` · `POST /api/auth/password {passwordActual,passwordNueva}`.

- [ ] **Paso 1:** Tests: login correcto con hash `$2a$` migrado → 200 + cookie `sid` HttpOnly Secure SameSite=Lax; contraseña mal → 401 `"Email o contraseña incorrectos"` (mismo mensaje si el email no existe); usuario `habilitado=false` → 403 `"Tu usuario está inhabilitado"`; usuario con `password_hash NULL` → 401; 6º intento fallido en 15 min desde la misma IP+email → 429; `GET /sesion` sin cookie → 401; cambiar password con actual incorrecta → 400; logout invalida la cookie.
- [ ] **Paso 2:** Implementar (bcryptjs costo 12, express-session con store MySQL, `cookie.maxAge` 12 h, `rolling: true`, `regenerate` al loguear). Tests pasan.
- [ ] **Paso 3:** Commit.

### Tarea 8: Mails, recuperación e invitación

**Files:**
- Create: `server/src/mail/mailer.js` (`crearMailer(config): {enviar({para, asunto, html})}`), `server/src/mail/plantillas.js` (portar las 5 plantillas actuales tal cual: préstamo, devolución, contraseña cambiada, contraseña restablecida, recuperación; + nueva "invitación"), `server/src/auth/tokens.js`, `server/test/tokens.test.js`

Rutas: `POST /api/auth/recuperar {email}` (siempre 200, no revela si el email existe) · `POST /api/auth/token {token, password}`. Link: `${APP_URL}/?token=<token>&tipo=recuperacion|invitacion`.

- [ ] **Paso 1:** Tests (mailer falso que guarda los mails): recuperar email existente → 1 mail con link que contiene token; email inexistente → 200 y 0 mails; token válido cambia la contraseña y manda "contraseña cambiada"; reusar token → 400 `"El enlace ya fue usado o venció"`; token vencido (recuperación 1 h, invitación 72 h) → 400; solo se guarda `sha256(token)`.
- [ ] **Paso 2:** Implementar. Tests pasan.
- [ ] **Paso 3:** Commit.

### Tarea 9: Autorización — matriz de permisos

**Files:**
- Create: `server/src/auth/permisos.js` (`puede(usuario, accion, recurso?): boolean` y middleware `exige(accion)`), `server/test/permisos.test.js`

Matriz (traducción exacta de las políticas RLS actuales):

| Acción | super_admin | admin | coordinador | director |
|---|---|---|---|---|
| leer equipos / movimientos / préstamos | ✓ | ✓ | ✓ (solo su sede*) | ✓ (solo su sede*) |
| crear/editar/baja/baja definitiva equipo | ✓ | ✓ | ✗ (usa solicitud) | ✗ |
| registrar movimiento, crear/devolver préstamo | ✓ | ✓ | ✓ | ✗ |
| borrar/editar movimiento o préstamo | ✓ | ✓ | ✗ (editar préstamo ✓ = devolver) | ✗ |
| repuestos (todo) | ✓ | ✓ | ✗ | ✗ |
| crear solicitud de cambio | ✓ | ✓ | ✓ (a su nombre, estado Pendiente) | ✗ |
| ver solicitudes | todas | todas | solo propias | ✗ |
| aprobar/rechazar solicitud | ✓ | ✓ | ✗ | ✗ |
| feedback: crear | ✓ | ✓ | ✓ | ✓ |
| feedback: ver | ✓ | ✓ | ✗ | ✗ |
| feedback: editar/borrar | ✓ | ✗ | ✗ | ✗ |
| usuarios: ver | todos | todos | solo sí mismo | solo sí mismo |
| usuarios coordinador/director: crear/editar/borrar/inhabilitar/reset | ✓ | ✓ | ✗ | ✗ |
| usuarios admin/super_admin: ídem | ✓ | ✗ | ✗ | ✗ |
| inhabilitar a un admin/super_admin | ✗ | ✗ | ✗ | ✗ |

\* Hoy el filtro por sede es solo del frontend (RLS deja leer todo). Se mantiene igual en la API para no cambiar comportamiento; anotarlo como mejora posible.

- [ ] **Paso 1:** Test parametrizado que recorre **cada celda** de la matriz (4 roles × acciones) contra `puede()`.
- [ ] **Paso 2:** Implementar `permisos.js`. Pasa.
- [ ] **Paso 3:** Commit.

### Tarea 10: Endpoints de usuarios

**Files:**
- Create: `server/src/rutas/usuarios.js`, `server/test/usuarios.test.js`

Rutas: `GET /api/usuarios` · `POST /api/usuarios` (crea cuenta sin contraseña + manda invitación; registra movimiento "Alta usuario") · `PATCH /api/usuarios/:id` · `DELETE /api/usuarios/:id` (borra usuario y sus sesiones; movimiento "Baja usuario") · `POST /api/usuarios/:id/habilitado {habilitado}` · `POST /api/usuarios/:id/password {passwordNueva}` (mail "restablecida") · `POST /api/usuarios/:id/invitacion` (reenviar).

- [ ] **Paso 1:** Tests: admin crea coordinador → 201 + mail de invitación; admin crea admin → 403; admin edita un super_admin → 403; admin se cambia su propio rol a super_admin → 403; nadie puede inhabilitar un admin → 403; **coordinador inhabilitado con sesión abierta → su siguiente `GET /api/auth/sesion` da 401** (Review Focus 2); director `GET /api/usuarios` → solo su fila.
- [ ] **Paso 2:** Implementar usando `exige()` de Tarea 9. Tests pasan.
- [ ] **Paso 3:** Commit.

### Tarea 11: Endpoints de equipos y movimientos

**Files:**
- Create: `server/src/rutas/equipos.js`, `server/src/rutas/movimientos.js`, `server/test/equipos.test.js`

Rutas: `GET /api/equipos` · `GET /api/equipos/:id` · `POST /api/equipos` · `PATCH /api/equipos/:id` · `DELETE /api/equipos/:id` (baja definitiva: solo si `estado='De baja'`, transacción: borrar + movimiento con `equipo_id NULL`) · `GET /api/equipos/bajas-definitivas` · `GET /api/movimientos?limite=` (con `equipos` anidado) · `GET /api/equipos/:id/movimientos` · `POST /api/movimientos`. Validación con zod de los mismos campos que el formulario.

- [ ] **Paso 1:** Tests: alta como admin → 201 y la respuesta tiene la misma forma que hoy; coordinador `POST /api/equipos` → 403; baja definitiva de equipo `Activo` → 409; baja definitiva de `De baja` → 200, el movimiento final sobrevive con `equipo_id null`; `GET /api/movimientos` devuelve `equipos: {...}` o `null`.
- [ ] **Paso 2:** Implementar. Pasan.
- [ ] **Paso 3:** Commit.

### Tarea 12: Solicitudes de cambio (aprobaciones)

**Files:**
- Create: `server/src/rutas/solicitudes.js`, `server/test/solicitudes.test.js`

Rutas: `GET /api/solicitudes` · `POST /api/solicitudes` · `POST /api/solicitudes/:id/aprobar` · `POST /api/solicitudes/:id/rechazar {comentario}`. Aprobar = transacción con `SELECT ... FOR UPDATE`: aplica Alta/Modificación/Baja al equipo + movimiento (texto con `camposModificados`, portar de `src/constants.js`) + marca `Aprobado`.

- [ ] **Paso 1:** Tests: coordinador crea solicitud a nombre de otro email → se fuerza el suyo; coordinador ve solo las propias; **aprobar dos veces en paralelo → una 200 y otra 409, un solo movimiento** (Review Focus 5); rechazar no toca `equipos`.
- [ ] **Paso 2:** Implementar. Pasan.
- [ ] **Paso 3:** Commit.

### Tarea 13: Préstamos, repuestos, feedback, exportar

**Files:**
- Create: `server/src/rutas/prestamos.js`, `repuestos.js`, `feedback.js`, `exportar.js`, `server/test/prestamos.test.js`, `server/test/varios.test.js`

Rutas: `GET/POST /api/prestamos` · `POST /api/prestamos/:id/devolver {observaciones}` (transacción: préstamo + estado del equipo + movimiento; luego mail; responde `{prestamo, mailError?}`) · CRUD `/api/repuestos` · `GET/POST/PATCH/DELETE /api/feedback` · `GET /api/exportar`.

- [ ] **Paso 1:** Tests: préstamo sin `email_destinatario` válido → 400; préstamo crea movimiento "Préstamo" y manda mail; si el SMTP falla, el préstamo se guarda igual y vuelve `mailError`; **`fecha_prestamo '2026-11-10'` se devuelve `'2026-11-10'` y `fecha_devolucion_real` con `Z`** (Review Focus 4); director `POST /api/prestamos` → 403; coordinador `GET /api/repuestos` → 403; feedback de director con `reportado_por_email` ajeno → se fuerza el suyo.
- [ ] **Paso 2:** Implementar. Pasan.
- [ ] **Paso 3:** Commit.

---

## Fase 4 — Beta en paralelo

### Tarea 14: Implementación `propio` del frontend + sitio beta

**Files:**
- Create: `src/api/propio/http.js` (`pedir(metodo, ruta, cuerpo?)`: `fetch(VITE_API_URL + ruta, {credentials:'include'})`, lanza `Error(json.error)`; ante 401 dispara `alCambiarSesion(null)`), `src/api/propio/{auth,usuarios,equipos,movimientos,solicitudes,prestamos,repuestos,feedback,exportar}.js`
- Modify: `src/api/index.js`, `src/components/UpdatePassword.jsx` (lee `?token=&tipo=` y llama `establecerPasswordConToken`), `.github/workflows/deploy.yml` (job `beta`: build con `VITE_BACKEND=propio VITE_API_URL=https://api-inventario.chacalo.com.ar` → FTPS a la carpeta de `beta-inventario.chacalo.com.ar`)

- [ ] **Paso 1:** Implementar cada módulo con el mismo contrato de Fase 1.
- [ ] **Paso 2:** Verificar que el build de producción (sin `VITE_BACKEND`) no incluye código de `propio` y viceversa: `grep -c "api-inventario" dist/assets/*.js` → 0 en prod.
- [ ] **Paso 3:** El usuario crea subdominio `beta-inventario` (DNS Cloudflare + SSL + cuenta FTP). Cargar secrets, push, verificar que beta carga.
- [ ] **Paso 4:** Commit.

### Tarea 15: Despliegue de la API y backups

**Files:**
- Modify: según Tarea 0 (workflow o integración GitHub de Hostinger para `server/`)
- Create: `server/scripts/backup.sh` (mysqldump comprimido con fecha, conserva 30)

- [ ] **Paso 1:** Configurar variables de entorno en hPanel (`DB_NAME=stlukesit_beta` por ahora, `CORS_ORIGINS=https://beta-inventario.chacalo.com.ar`, `APP_URL=https://beta-inventario.chacalo.com.ar`).
- [ ] **Paso 2:** Desplegar; aplicar `schema.sql`; correr `migrar.js --hacia=mysql` contra beta y `verificar.js` → OK.
- [ ] **Paso 3:** Cron diario 03:00 de `backup.sh`; verificar que al día siguiente hay un `.sql.gz` y que se restaura en una base vacía.
- [ ] **Paso 4:** Commit.

---

## Fase 5 — Ensayo general

### Tarea 16: Prueba completa en beta con todos los roles

- [ ] **Paso 1:** Crear en beta un usuario de prueba por rol (o usar los reales: en beta los datos son copia y se descartan). Los 4 coordinadores/directores reciben invitación **solo si el usuario lo aprueba** (son mails reales).
- [ ] **Paso 2:** Recorrer el checklist por rol: login, olvidé mi contraseña, cambiar contraseña, cierre por inactividad; Dashboard (mismas cifras que producción con la misma copia de datos), Equipos ABM, solicitud→aprobación, préstamo y devolución con mail, repuestos, Historial, Reportes + PowerPoint, Usuarios ABM/inhabilitar/reset, Reportar problema, Exportar DB.
- [ ] **Paso 3:** Medir tiempos: Dashboard y Equipos cargan en ≤ lo que tardan hoy.
- [ ] **Paso 4:** Ensayar el corte completo (Tarea 17 pasos 2-6) contra beta, cronometrado. Ensayar la vuelta atrás (`migrar.js --hacia=supabase` contra un proyecto/base de prueba, **nunca** el Supabase real sin confirmación).
- [ ] **Paso 5:** El usuario da el OK y elige fecha/hora de corte.

---

## Fase 6 — Corte

### Tarea 17: Corte a producción (ventana ~30 min)

- [ ] **Paso 1:** Aviso a los usuarios con 48 h: fecha, hora, "van a tener que volver a iniciar sesión, con la misma contraseña".
- [ ] **Paso 2:** Modo mantenimiento: deploy de `index.html` de mantenimiento en `inventario.` (o banner + bloqueo de escrituras) → nadie escribe en Supabase.
- [ ] **Paso 3:** Crear base `stlukesit` (prod), aplicar `schema.sql`, `migrar.js --hacia=mysql`, `verificar.js` → OK. Backup `pg_dump` completo de Supabase guardado fuera del repo.
- [ ] **Paso 4:** Cambiar env de la API a la base de prod y `CORS_ORIGINS`/`APP_URL` a `https://inventario.chacalo.com.ar`.
- [ ] **Paso 5:** Deploy del frontend con `VITE_BACKEND=propio` (bump de versión) en `inventario.`.
- [ ] **Paso 6:** Prueba de humo como super_admin y como coordinador: login, Dashboard, un movimiento real, un mail. Fin de mantenimiento.
- [ ] **Vuelta atrás** (si algo crítico falla en los primeros días): modo mantenimiento → `migrar.js --desde=mysql --hacia=supabase` (con confirmación) → redeploy del frontend con `VITE_BACKEND=supabase`.

---

## Fase 7 — Retiro de Supabase

### Tarea 18: Limpieza (≥ 30 días después del corte, con confirmación)

- [ ] **Paso 1:** `pg_dump` final de Supabase guardado (fuera del repo).
- [ ] **Paso 2:** Borrar `src/api/supabase/`, `src/supabase.js`, la dependencia `@supabase/supabase-js`, `supabase/functions/`, `supabase/email-templates/`, secrets `VITE_SUPABASE_*`; `src/api/index.js` exporta solo `propio`.
- [ ] **Paso 3:** Lint, build, deploy, verificar.
- [ ] **Paso 4:** Con confirmación del usuario: pausar el proyecto en Supabase; borrarlo más adelante si nadie lo extraña.
