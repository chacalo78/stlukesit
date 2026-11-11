import { supabase } from '../../supabase'

export async function listar() {
  const { data, error } = await supabase.from('repuestos').select('*').order('categoria', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

export async function crear(datos) {
  const { error } = await supabase.from('repuestos').insert(datos)
  if (error) throw new Error(error.message)
}

export async function actualizar(id, datos) {
  const { error } = await supabase.from('repuestos').update(datos).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function eliminar(id) {
  const { error } = await supabase.from('repuestos').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
