import { pedir, seg } from './http'

// limite: sin límite si se omite. columnasEquipo no hace falta: la API trae el equipo completo.
export function listar({ limite } = {}) {
  return pedir('GET', `/api/movimientos${limite ? `?limite=${encodeURIComponent(limite)}` : ''}`)
}

export function listarPorEquipo(equipoId) {
  return pedir('GET', `/api/equipos/${seg(equipoId)}/movimientos`)
}

// En la API propia cada operación registra su movimiento en el servidor
// (en la misma transacción). Se mantiene por compatibilidad: no hace nada.
export async function registrar() {}
