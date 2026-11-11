import { supabase } from '../../supabase'

// Devuelve la sesión de Supabase tal cual (los componentes usan
// session.user.id / session.user.email) o null si no hay sesión.
export async function obtenerSesion() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// cb(sesion, evento). Devuelve una función para dejar de escuchar.
export function alCambiarSesion(cb) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, sesion) => {
    cb(sesion, evento)
  })
  return () => subscription.unsubscribe()
}

// Lanza Error. Si la cuenta está inhabilitada, el error trae code === 'cuenta_inhabilitada'.
export async function iniciarSesion(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    if (error.code === 'user_banned' || error.message === 'User is banned') {
      const err = new Error('Cuenta inhabilitada')
      err.code = 'cuenta_inhabilitada'
      throw err
    }
    throw new Error('Email o contraseña incorrectos')
  }
}

export async function cerrarSesion() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function pedirRecuperacion(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`
  })
  if (error) throw new Error('No pudimos enviar el correo. Intentá de nuevo.')
}

// Con passwordActual: primero verifica la contraseña actual del usuario en
// sesión (error con code === 'password_actual_incorrecta'). Sin passwordActual
// (flujo de recuperación) usa la sesión de recuperación. Tras el cambio
// notifica por mail (si falla, se ignora).
export async function cambiarPassword(passwordNueva, passwordActual) {
  if (passwordActual !== undefined) {
    const { data: { session } } = await supabase.auth.getSession()
    const { error: errorActual } = await supabase.auth.signInWithPassword({ email: session?.user?.email, password: passwordActual })
    if (errorActual) {
      const err = new Error('La contraseña actual es incorrecta')
      err.code = 'password_actual_incorrecta'
      throw err
    }
  }
  const { error } = await supabase.auth.updateUser({ password: passwordNueva })
  if (error) throw new Error('No pudimos actualizar la contraseña.')
  supabase.functions.invoke('notify-password-changed').catch(() => {})
}
