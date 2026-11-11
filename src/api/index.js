// Capa de datos del frontend. Los componentes importan de acá y nunca
// de '../supabase' directamente. Por ahora solo existe la implementación
// sobre Supabase.
export * as auth from './supabase/auth.js'
export * as usuarios from './supabase/usuarios.js'
export * as equipos from './supabase/equipos.js'
export * as movimientos from './supabase/movimientos.js'
export * as solicitudes from './supabase/solicitudes.js'
export * as prestamos from './supabase/prestamos.js'
