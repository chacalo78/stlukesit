// Cliente HTTP de la API propia (Express). Cookie de sesión httpOnly: credentials 'include'.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

// --- Sesión (emula onAuthStateChange de Supabase) ---------------------------
let sesionActual = null
const oyentes = new Set()

export function sesion() {
  return sesionActual
}

// Fija la sesión sin avisar a nadie (carga inicial).
export function fijarSesion(s) {
  sesionActual = s
}

// Fija la sesión y avisa a los oyentes: cb(sesion, evento).
export function emitirSesion(s, evento) {
  sesionActual = s
  for (const cb of [...oyentes]) cb(s, evento)
}

export function suscribir(cb) {
  oyentes.add(cb)
  return () => oyentes.delete(cb)
}

// metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE'. cuerpo: objeto JSON opcional.
// Devuelve el JSON de la respuesta. Ante error lanza Error(json.error) con
// err.status y, si la API lo manda, err.code. Ante 401 con sesión abierta
// avisa a los oyentes (alCambiarSesion(null)) para volver al login.
export async function pedir(metodo, ruta, cuerpo) {
  const opciones = { method: metodo, credentials: 'include', headers: { Accept: 'application/json' } }
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json'
    opciones.body = JSON.stringify(cuerpo)
  }
  let res
  try {
    res = await fetch(BASE + ruta, opciones)
  } catch {
    throw new Error('No pudimos conectar con el servidor. Revisá tu conexión.')
  }
  const texto = await res.text()
  let json = null
  try { json = texto ? JSON.parse(texto) : null } catch { json = null }
  if (!res.ok) {
    if (res.status === 401 && sesionActual !== null) emitirSesion(null, 'SIGNED_OUT')
    const err = new Error(json?.error || `Error del servidor (${res.status})`)
    err.status = res.status
    if (json?.code) err.code = json.code
    throw err
  }
  return json
}

// Sin acento ni espacios en el id: ids de la API son UUID, pero por las dudas.
export const seg = (id) => encodeURIComponent(id)
