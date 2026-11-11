import { supabase } from '../../supabase'

// Préstamos sin devolver, con la ubicación del equipo (lo usa el Dashboard).
// El resto del módulo (listar/crear/devolver) lo agrega la tarea de préstamos.
export async function listarActivos() {
  const { data, error } = await supabase
    .from('prestamos')
    .select('*, equipos(ubicacion)')
    .is('fecha_devolucion_real', null)
  if (error) throw new Error(error.message)
  return data || []
}
