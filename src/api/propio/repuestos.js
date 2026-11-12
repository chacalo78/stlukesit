import { pedir, seg } from './http'

export function listar() {
  return pedir('GET', '/api/repuestos')
}

export async function crear(datos) {
  await pedir('POST', '/api/repuestos', datos)
}

export async function actualizar(id, datos) {
  await pedir('PATCH', `/api/repuestos/${seg(id)}`, datos)
}

export async function eliminar(id) {
  await pedir('DELETE', `/api/repuestos/${seg(id)}`)
}
