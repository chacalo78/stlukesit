import { supabase } from '../../supabase'
import { ROLE_LABELS } from '../../roles'
import { registrar as registrarMovimiento } from './movimientos'

// Fila de user_roles del usuario en sesión, o null si no existe / falla
// la consulta (igual que antes: el error se ignoraba).
export async function miPerfil() {
  const { data: { session } } = await supabase.auth.getSession()
  const { data } = await supabase
    .from('user_roles')
    .select('*')
    .eq('email', session?.user?.email)
    .single()
  return data || null
}

export async function listar() {
  const { data, error } = await supabase.from('user_roles').select('*').order('nombre', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

// datos: { email, nombre, rol, sede }. actor: nombre de quien opera (para el historial).
export async function crear(datos, actor) {
  const { error } = await supabase.from('user_roles').insert(datos)
  if (error) throw new Error(error.message)
  await registrarMovimiento({
    tipo_movimiento: 'Alta usuario',
    descripcion: `Usuario dado de alta: ${datos.nombre} (${datos.email}) — Rol: ${ROLE_LABELS[datos.rol]}`,
    usuario: actor || 'Sistema'
  })
}

// datos: { email, nombre, rol, sede }; solo se actualizan nombre, rol y sede.
export async function actualizar(id, datos, actor) {
  const { error } = await supabase.from('user_roles')
    .update({ nombre: datos.nombre, rol: datos.rol, sede: datos.sede })
    .eq('id', id)
  if (error) throw new Error(error.message)
  await registrarMovimiento({
    tipo_movimiento: 'Modificación usuario',
    descripcion: `Usuario modificado: ${datos.nombre} (${datos.email}) — Rol: ${ROLE_LABELS[datos.rol]}${datos.sede ? `, Sede: ${datos.sede}` : ''}`,
    usuario: actor || 'Sistema'
  })
}

// usuario: { nombre, email } del usuario dado de baja (para el historial).
export async function eliminar(id, usuario, actor) {
  const { error } = await supabase.from('user_roles').delete().eq('id', id)
  if (error) throw new Error('Error al dar de baja')
  await registrarMovimiento({
    tipo_movimiento: 'Baja usuario',
    descripcion: `Usuario dado de baja: ${usuario.nombre || usuario.email}`,
    usuario: actor || 'Sistema'
  })
}

// usuario: { nombre, email } del usuario afectado.
export async function cambiarHabilitado(id, habilitado, usuario, actor) {
  const { data, error } = await supabase.functions.invoke('toggle-user-access', {
    body: { targetEmail: usuario.email, habilitado }
  })
  if (error || data?.error) throw new Error(data?.error || 'Error al actualizar el acceso')

  const { error: dbError } = await supabase.from('user_roles').update({ habilitado }).eq('id', id)
  if (dbError) throw new Error('Error al guardar el estado')
  await registrarMovimiento({
    tipo_movimiento: habilitado ? 'Habilitado' : 'Inhabilitado',
    descripcion: `Usuario ${habilitado ? 'habilitado' : 'inhabilitado'}: ${usuario.nombre || usuario.email}`,
    usuario: actor || 'Sistema'
  })
}

// usuario: { nombre, email } del usuario afectado.
export async function restablecerPassword(id, passwordNueva, usuario, actor) {
  const { data, error } = await supabase.functions.invoke('reset-password', {
    body: { targetEmail: usuario.email, newPassword: passwordNueva }
  })
  if (error || data?.error) throw new Error(data?.error || 'No pudimos actualizar la contraseña. Probá de nuevo.')
  await registrarMovimiento({
    tipo_movimiento: 'Restablecimiento de contraseña',
    descripcion: `Contraseña restablecida para: ${usuario.nombre || usuario.email}`,
    usuario: actor || 'Sistema'
  })
}
