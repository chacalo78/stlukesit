import { pedir, seg } from './http'

export function listar() {
  return pedir('GET', '/api/feedback')
}

// datos: { tipo, seccion, asunto, descripcion }. El servidor fija autor y estado.
export async function crear(datos) {
  const { tipo, seccion, asunto, descripcion } = datos
  await pedir('POST', '/api/feedback', { tipo, seccion, asunto, descripcion })
}

// Solo se puede cambiar el estado.
export async function actualizar(id, datos) {
  await pedir('PATCH', `/api/feedback/${seg(id)}`, { estado: datos.estado })
}

// La API no ofrece borrado de reportes (la UI nunca lo usó).
export async function eliminar() {
  throw new Error('Esta operación no está disponible')
}
