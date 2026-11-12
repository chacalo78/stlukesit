import { pedir, sesion, fijarSesion, emitirSesion, suscribir } from './http'

const MSG_PASSWORD_ACTUAL = 'La contraseña actual es incorrecta'

const aSesion = (u) => ({ user: { id: u.id, email: u.email } })

// ¿Se abrió el enlace de un mail (recuperación o invitación)?
function hayTokenEnUrl() {
  const p = new URLSearchParams(window.location.search)
  return !!p.get('token') && !!p.get('tipo')
}

// Sesión actual ({ user: { id, email } }) o null si no hay sesión.
export async function obtenerSesion() {
  try {
    const u = await pedir('GET', '/api/auth/sesion')
    fijarSesion(aSesion(u))
  } catch (e) {
    if (e.status !== 401) console.error('No se pudo consultar la sesión:', e)
    fijarSesion(null)
  }
  return sesion()
}

// cb(sesion, evento). Devuelve una función para dejar de escuchar. Si la URL
// trae ?token=&tipo= avisa 'PASSWORD_RECOVERY' para mostrar la pantalla de contraseña.
export function alCambiarSesion(cb) {
  const baja = suscribir(cb)
  if (hayTokenEnUrl()) queueMicrotask(() => cb(null, 'PASSWORD_RECOVERY'))
  return baja
}

// Lanza Error. Si la cuenta está inhabilitada, el error trae code === 'cuenta_inhabilitada'.
export async function iniciarSesion(email, password) {
  let u
  try {
    u = await pedir('POST', '/api/auth/login', { email, password })
  } catch (e) {
    if (e.status === 403) {
      const err = new Error('Cuenta inhabilitada')
      err.code = 'cuenta_inhabilitada'
      throw err
    }
    if (e.status === 401) throw new Error('Email o contraseña incorrectos')
    throw e
  }
  emitirSesion(aSesion(u), 'SIGNED_IN')
}

export async function cerrarSesion() {
  try {
    await pedir('POST', '/api/auth/logout')
  } finally {
    emitirSesion(null, 'SIGNED_OUT')
  }
}

export async function pedirRecuperacion(email) {
  try {
    await pedir('POST', '/api/auth/recuperar', { email })
  } catch {
    throw new Error('No pudimos enviar el correo. Intentá de nuevo.')
  }
}

// Cambio con sesión abierta: exige passwordActual (error con code === 'password_actual_incorrecta').
// La recuperación sin sesión va por establecerPasswordConToken.
export async function cambiarPassword(passwordNueva, passwordActual) {
  if (passwordActual === undefined) throw new Error('Falta la contraseña actual')
  try {
    await pedir('POST', '/api/auth/password', { passwordActual, passwordNueva })
  } catch (e) {
    if (e.status === 400 && e.message === MSG_PASSWORD_ACTUAL) {
      e.code = 'password_actual_incorrecta'
    }
    throw e
  }
}

// Fija la contraseña con el token del mail (recuperación o invitación). No inicia sesión.
export async function establecerPasswordConToken(token, password) {
  await pedir('POST', '/api/auth/token', { token, password })
}
