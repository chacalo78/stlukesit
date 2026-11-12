import { pedir, seg } from './http'

// Equipos operativos (sin 'Baja Definitiva'). sede: filtra por ubicación.
// ordenado: ordena por numero_inventario.
export function listar({ sede, ordenado = false } = {}) {
  const q = new URLSearchParams()
  if (sede) q.set('sede', sede)
  if (ordenado) q.set('ordenado', 'true')
  const qs = q.toString()
  return pedir('GET', `/api/equipos${qs ? `?${qs}` : ''}`)
}

export function obtener(id) {
  return pedir('GET', `/api/equipos/${seg(id)}`)
}

export function listarBajasDefinitivas() {
  return pedir('GET', '/api/equipos/bajas-definitivas')
}

// Los movimientos del historial los registra el servidor con el usuario de la sesión.
export function crear(datos) {
  return pedir('POST', '/api/equipos', datos)
}

export async function actualizar(id, datos) {
  await pedir('PATCH', `/api/equipos/${seg(id)}`, datos)
}

export async function darDeBaja(equipo) {
  await pedir('POST', `/api/equipos/${seg(equipo.id)}/baja`)
}

export async function bajaDefinitiva(equipo) {
  await pedir('POST', `/api/equipos/${seg(equipo.id)}/baja-definitiva`)
}

export async function restaurar(equipo) {
  await pedir('POST', `/api/equipos/${seg(equipo.id)}/restaurar`)
}
