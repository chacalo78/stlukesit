import { supabase } from '../../supabase'

// Lo que baja ExportarDB: todos los equipos (incluida la Baja Definitiva),
// ordenados por número de inventario. La generación del archivo es del componente.
export async function todo() {
  const { data, error } = await supabase.from('equipos').select('*').order('numero_inventario', { ascending: true })
  if (error) throw new Error(error.message)
  return { equipos: data || [] }
}
