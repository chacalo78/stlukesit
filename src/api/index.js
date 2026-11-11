// Capa de datos del frontend. Los componentes importan de acá y nunca
// de '../supabase' directamente. Por ahora solo existe la implementación
// sobre Supabase.
export * as auth from './supabase/auth.js'
export * as usuarios from './supabase/usuarios.js'
