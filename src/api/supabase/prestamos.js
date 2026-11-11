import { supabase } from '../../supabase'
import { registrar as registrarMovimiento } from './movimientos'

// Préstamos con la ubicación del equipo (lo usa el Dashboard).
export async function listarActivos() {
  const { data, error } = await supabase
    .from('prestamos')
    .select('*, equipos(ubicacion)')
    .is('fecha_devolucion_real', null)
  if (error) throw new Error(error.message)
  return data || []
}

export async function listar() {
  const { data, error } = await supabase
    .from('prestamos')
    .select('*, equipos(id, numero_inventario, tipo, marca, modelo, ubicacion)')
    .order('fecha_prestamo', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

// Envía el mail de notify-prestamo (se espera igual que antes). Devuelve el
// detalle del error si falló, o undefined si salió bien. Nunca lanza.
async function enviarMail(body, etiqueta) {
  try {
    const { data: mailData, error: mailError } = await supabase.functions.invoke('notify-prestamo', { body })
    if (mailError || mailData?.warning) {
      console.error(`Error enviando mail de ${etiqueta}:`, mailError, mailData)
      return mailData?.detail || mailError?.message || 'motivo desconocido'
    }
  } catch (e) {
    console.error(`Error enviando mail de ${etiqueta}:`, e)
    return e?.message || 'motivo desconocido'
  }
}

// datos: { equipo_id, persona, email_destinatario, sector, fecha_devolucion_estimada,
//          observaciones_entrega, registrado_por }
// equipo: el equipo prestado (para el texto del movimiento y del mail), puede ser undefined.
// Inserta el préstamo, pasa el equipo a 'Prestado', registra el movimiento 'Préstamo'
// y envía el mail. Si el mail falla el préstamo igual queda registrado y devuelve
// { mailError }; si el préstamo no se puede insertar, lanza Error.
export async function crear(datos, equipo, actor) {
  const { error } = await supabase.from('prestamos').insert(datos)
  if (error) throw new Error(error.message)

  // Igual que antes: si este update falla, se ignora.
  await supabase.from('equipos').update({ estado: 'Prestado', usuario: datos.persona }).eq('id', datos.equipo_id)
  await registrarMovimiento({
    equipo_id: datos.equipo_id,
    tipo_movimiento: 'Préstamo',
    descripcion: `Equipo prestado a ${datos.persona}${equipo ? ` (${equipo.numero_inventario})` : ''}`,
    usuario: actor || 'Sistema'
  })

  if (datos.email_destinatario) {
    const mailError = await enviarMail({
      email: datos.email_destinatario,
      persona: datos.persona,
      numeroInventario: equipo?.numero_inventario || '',
      tipo: equipo?.tipo || '',
      marca: equipo?.marca || '',
      modelo: equipo?.modelo || '',
      fechaDevolucion: datos.fecha_devolucion_estimada,
    }, 'préstamo')
    if (mailError) return { mailError }
  }
  return {}
}

// prestamo: la fila completa (con equipos(...)). Marca la devolución, deja el
// equipo 'Activo', registra el movimiento 'Devolución' y envía el mail.
// Mismo manejo de errores de mail que crear.
export async function devolver(prestamo, observaciones, actor) {
  const p = prestamo
  const fechaDevolucionReal = new Date().toISOString()

  const { error } = await supabase.from('prestamos').update({
    fecha_devolucion_real: fechaDevolucionReal,
    observaciones_devolucion: observaciones
  }).eq('id', p.id)
  if (error) throw new Error(error.message)

  await supabase.from('equipos').update({ estado: 'Activo', usuario: null }).eq('id', p.equipo_id)
  await registrarMovimiento({
    equipo_id: p.equipo_id,
    tipo_movimiento: 'Devolución',
    descripcion: `Equipo devuelto por ${p.persona}${p.equipos ? ` (${p.equipos.numero_inventario})` : ''}`,
    usuario: actor || 'Sistema'
  })

  if (p.email_destinatario) {
    const mailError = await enviarMail({
      accion: 'devolucion',
      email: p.email_destinatario,
      persona: p.persona,
      numeroInventario: p.equipos?.numero_inventario || '',
      tipo: p.equipos?.tipo || '',
      marca: p.equipos?.marca || '',
      modelo: p.equipos?.modelo || '',
      fechaDevolucion: fechaDevolucionReal,
      observaciones: observaciones || '',
    }, 'devolución')
    if (mailError) return { mailError }
  }
  return {}
}
