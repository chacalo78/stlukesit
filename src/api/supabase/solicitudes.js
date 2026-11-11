import { supabase } from '../../supabase'
import { identificarEquipo, camposModificados } from '../../constants'
import { registrar as registrarMovimiento } from './movimientos'

// emailSolicitante: si se pasa, solo las solicitudes de ese usuario.
export async function listar(emailSolicitante) {
  let query = supabase
    .from('solicitudes_cambio')
    .select('*, equipos(numero_inventario, tipo, marca, modelo)')
    .order('fecha_solicitud', { ascending: false })
  if (emailSolicitante !== undefined) query = query.eq('solicitado_por_email', emailSolicitante)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

// ids de equipos con alguna solicitud pendiente.
export async function equiposConPendientes() {
  const { data, error } = await supabase
    .from('solicitudes_cambio')
    .select('equipo_id')
    .eq('estado', 'Pendiente')
    .not('equipo_id', 'is', null)
  if (error) throw new Error(error.message)
  return (data || []).map(p => p.equipo_id)
}

// datos: { tipo_accion, equipo_id, datos_propuestos, datos_anteriores, solicitado_por, solicitado_por_email }
export async function crear(datos) {
  const { error } = await supabase.from('solicitudes_cambio').insert(datos)
  if (error) throw new Error(error.message)
}

// solicitud: la fila completa. Aplica el cambio en equipos, registra el
// movimiento y marca la solicitud como aprobada. Si falla aplicar el cambio,
// lanza Error y no toca la solicitud.
export async function aprobar(solicitud, actor) {
  const s = solicitud
  const usuario = actor || 'Sistema'
  if (s.tipo_accion === 'Alta') {
    const { data, error } = await supabase.from('equipos').insert(s.datos_propuestos).select().single()
    if (error) throw new Error(error.message)
    await registrarMovimiento({
      equipo_id: data.id,
      tipo_movimiento: 'Alta',
      descripcion: `Equipo dado de alta: ${identificarEquipo(s.datos_propuestos)} (solicitado por ${s.solicitado_por})`,
      usuario
    })
  } else if (s.tipo_accion === 'Modificación') {
    const { error } = await supabase.from('equipos').update(s.datos_propuestos).eq('id', s.equipo_id)
    if (error) throw new Error(error.message)
    const cambios = camposModificados(s.datos_anteriores, s.datos_propuestos)
    const cambiosTxt = cambios.length ? ` — ${cambios.join('; ')}` : ''
    await registrarMovimiento({
      equipo_id: s.equipo_id,
      tipo_movimiento: 'Modificación',
      descripcion: `Equipo modificado: ${identificarEquipo(s.datos_propuestos)}${cambiosTxt} (solicitado por ${s.solicitado_por})`,
      usuario
    })
  } else {
    const { error } = await supabase.from('equipos').update({ estado: 'De baja' }).eq('id', s.equipo_id)
    if (error) throw new Error(error.message)
    await registrarMovimiento({
      equipo_id: s.equipo_id,
      tipo_movimiento: 'Baja',
      descripcion: `Equipo dado de baja: ${identificarEquipo(s.datos_anteriores)} (solicitado por ${s.solicitado_por})`,
      usuario
    })
  }

  // Igual que antes: si este último update falla, se ignora.
  await supabase.from('solicitudes_cambio').update({
    estado: 'Aprobado',
    resuelto_por: usuario,
    fecha_resolucion: new Date().toISOString()
  }).eq('id', s.id)
}

export async function rechazar(id, comentario, actor) {
  const { error } = await supabase.from('solicitudes_cambio').update({
    estado: 'Rechazado',
    resuelto_por: actor || 'Sistema',
    fecha_resolucion: new Date().toISOString(),
    comentario_resolucion: comentario
  }).eq('id', id)
  if (error) throw new Error(error.message)
}
