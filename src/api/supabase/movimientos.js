import { supabase } from '../../supabase'

// columnasEquipo: qué columnas del equipo asociado se traen (el Historial usa
// todas, el Dashboard solo la ubicación). limite: sin límite si se omite.
export async function listar({ limite, columnasEquipo = '*' } = {}) {
  let query = supabase
    .from('movimientos')
    .select(`*, equipos(${columnasEquipo})`)
    .order('fecha', { ascending: false })
  if (limite) query = query.limit(limite)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

export async function listarPorEquipo(equipoId) {
  const { data, error } = await supabase
    .from('movimientos')
    .select('*')
    .eq('equipo_id', equipoId)
    .order('fecha', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

// Única implementación del insert en `movimientos` (la usan también los demás
// módulos de api). Igual que antes en los componentes, un error al registrar
// NO interrumpe la operación principal (se ignora). equipo_id es opcional.
export async function registrar({ equipo_id, tipo_movimiento, descripcion, usuario }) {
  await supabase.from('movimientos').insert({ equipo_id, tipo_movimiento, descripcion, usuario })
}
