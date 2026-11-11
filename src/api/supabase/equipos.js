import { supabase } from '../../supabase'
import { identificarEquipo, camposModificados } from '../../constants'
import { registrar as registrarMovimiento } from './movimientos'

// Equipos operativos (sin 'Baja Definitiva'). sede: filtra por ubicación.
// ordenado: ordena por numero_inventario (Equipos); Dashboard y Reportes no ordenan.
export async function listar({ sede, ordenado = false } = {}) {
  let query = supabase.from('equipos').select('*').neq('estado', 'Baja Definitiva')
  if (ordenado) query = query.order('numero_inventario', { ascending: true })
  if (sede) query = query.eq('ubicacion', sede)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

export async function obtener(id) {
  const { data, error } = await supabase.from('equipos').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return data
}

export async function listarBajasDefinitivas() {
  const { data, error } = await supabase
    .from('equipos')
    .select('*')
    .eq('estado', 'Baja Definitiva')
    .order('fecha_baja_definitiva', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

// Alta + movimiento 'Alta'. actor: nombre de quien opera (para el historial).
export async function crear(datos, actor) {
  const { data, error } = await supabase.from('equipos').insert(datos).select().single()
  if (error) throw new Error(error.message)
  await registrarMovimiento({
    equipo_id: data.id,
    tipo_movimiento: 'Alta',
    descripcion: `Equipo dado de alta: ${identificarEquipo(datos)}`,
    usuario: actor || 'Sistema'
  })
  return data
}

// anterior: el equipo antes de editar (para el detalle de cambios del historial).
export async function actualizar(id, datos, anterior, actor) {
  const { error } = await supabase.from('equipos').update(datos).eq('id', id)
  if (error) throw new Error(error.message)
  const cambios = camposModificados(anterior, datos)
  const cambiosTxt = cambios.length ? ` — ${cambios.join('; ')}` : ''
  await registrarMovimiento({
    equipo_id: id,
    tipo_movimiento: 'Modificación',
    descripcion: `Equipo modificado: ${identificarEquipo(datos)}${cambiosTxt}`,
    usuario: actor || 'Sistema'
  })
}

// Baja (estado 'De baja') + movimiento 'Baja'. equipo: el equipo completo.
export async function darDeBaja(equipo, actor) {
  const { error } = await supabase.from('equipos').update({ estado: 'De baja' }).eq('id', equipo.id)
  if (error) throw new Error(error.message)
  await registrarMovimiento({
    equipo_id: equipo.id,
    tipo_movimiento: 'Baja',
    descripcion: `Equipo dado de baja: ${identificarEquipo(equipo)}`,
    usuario: actor || 'Sistema'
  })
}

// Pasa a 'Baja Definitiva' + movimiento. equipo: el equipo completo.
export async function bajaDefinitiva(equipo, actor) {
  const { error } = await supabase.from('equipos').update({
    estado: 'Baja Definitiva',
    fecha_baja_definitiva: new Date().toISOString(),
    dado_de_baja_definitiva_por: actor || 'Sistema'
  }).eq('id', equipo.id)
  if (error) throw new Error(error.message)
  await registrarMovimiento({
    equipo_id: equipo.id,
    tipo_movimiento: 'Baja Definitiva',
    descripcion: `Equipo dado de baja definitiva: ${identificarEquipo(equipo)}`,
    usuario: actor || 'Sistema'
  })
}

// Restaura desde Bajas Definitivas a 'Activo' + movimiento 'Modificación'.
export async function restaurar(equipo, actor) {
  const { error } = await supabase.from('equipos').update({ estado: 'Activo' }).eq('id', equipo.id)
  if (error) throw new Error(error.message)
  await registrarMovimiento({
    equipo_id: equipo.id,
    tipo_movimiento: 'Modificación',
    descripcion: `Equipo restaurado desde Bajas Definitivas: ${identificarEquipo(equipo)}`,
    usuario: actor || 'Sistema'
  })
}
