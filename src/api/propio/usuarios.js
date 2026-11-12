import { pedir, seg } from './http'

// Perfil del usuario en sesión, o null si no hay / falla (igual que antes: el error se ignoraba).
export async function miPerfil() {
  try {
    return await pedir('GET', '/api/auth/sesion')
  } catch {
    return null
  }
}

export function listar() {
  return pedir('GET', '/api/usuarios')
}

// datos: { email, nombre, rol, sede }. El servidor registra el movimiento con el actor de la sesión.
// Devuelve { usuario, mailError? } (mailError si no salió la invitación).
export function crear(datos) {
  const { email, nombre, rol, sede } = datos
  return pedir('POST', '/api/usuarios', { email, nombre, rol, sede })
}

// Solo se actualizan nombre, rol y sede.
export async function actualizar(id, datos) {
  const { nombre, rol, sede } = datos
  await pedir('PATCH', `/api/usuarios/${seg(id)}`, { nombre, rol, sede })
}

export async function eliminar(id) {
  await pedir('DELETE', `/api/usuarios/${seg(id)}`)
}

export async function cambiarHabilitado(id, habilitado) {
  await pedir('POST', `/api/usuarios/${seg(id)}/habilitado`, { habilitado })
}

export async function restablecerPassword(id, passwordNueva) {
  return pedir('POST', `/api/usuarios/${seg(id)}/password`, { passwordNueva })
}
