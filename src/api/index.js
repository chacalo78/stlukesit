// Capa de datos del frontend. Los componentes importan de acá y nunca
// de '../supabase' directamente. '@backend' lo resuelve vite.config.js en
// tiempo de build: src/api/supabase (por defecto) o src/api/propio
// (VITE_BACKEND=propio), así el otro backend no entra al bundle.
export * as auth from '@backend/auth.js'
export * as usuarios from '@backend/usuarios.js'
export * as equipos from '@backend/equipos.js'
export * as movimientos from '@backend/movimientos.js'
export * as solicitudes from '@backend/solicitudes.js'
export * as prestamos from '@backend/prestamos.js'
export * as repuestos from '@backend/repuestos.js'
export * as feedback from '@backend/feedback.js'
export * as exportar from '@backend/exportar.js'
