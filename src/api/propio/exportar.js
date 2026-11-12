import { pedir } from './http'

// Todos los equipos (incluida la Baja Definitiva). La generación del archivo es del componente.
export function todo() {
  return pedir('GET', '/api/exportar')
}
