import { pedir, seg } from './http'

// La API devuelve solo las solicitudes visibles para el rol (el coordinador, las propias).
export function listar() {
  return pedir('GET', '/api/solicitudes')
}

// ids de equipos con alguna solicitud pendiente.
export function equiposConPendientes() {
  return pedir('GET', '/api/solicitudes/equipos-pendientes')
}

// datos: { tipo_accion, equipo_id, datos_propuestos, ... }. El servidor fija solicitante, estado y datos anteriores.
export async function crear(datos) {
  const { tipo_accion, equipo_id, datos_propuestos } = datos
  await pedir('POST', '/api/solicitudes', { tipo_accion, equipo_id, datos_propuestos })
}

export async function aprobar(solicitud) {
  await pedir('POST', `/api/solicitudes/${seg(solicitud.id)}/aprobar`)
}

export async function rechazar(id, comentario) {
  await pedir('POST', `/api/solicitudes/${seg(id)}/rechazar`, { comentario })
}
