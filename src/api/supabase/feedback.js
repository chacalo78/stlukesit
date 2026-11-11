import { supabase } from '../../supabase'

export async function listar() {
  const { data, error } = await supabase.from('feedback_desarrollador').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function crear(datos) {
  const { error } = await supabase.from('feedback_desarrollador').insert(datos)
  if (error) throw new Error(error.message)
}

export async function actualizar(id, datos) {
  const { error } = await supabase.from('feedback_desarrollador').update(datos).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function eliminar(id) {
  const { error } = await supabase.from('feedback_desarrollador').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
