import { pedir, seg } from './http'

// Préstamos sin devolver, con la ubicación del equipo (Dashboard).
export function listarActivos() {
  return pedir('GET', '/api/prestamos/activos')
}

export function listar() {
  return pedir('GET', '/api/prestamos')
}

// Crea el préstamo (el servidor pasa el equipo a 'Prestado', registra el movimiento y manda el mail).
// Si el mail falla el préstamo igual queda registrado y devuelve { mailError }.
export async function crear(datos) {
  const r = await pedir('POST', '/api/prestamos', datos)
  return r?.mailError ? { mailError: r.mailError } : {}
}

// prestamo: la fila completa. Mismo manejo de errores de mail que crear.
export async function devolver(prestamo, observaciones) {
  const r = await pedir('POST', `/api/prestamos/${seg(prestamo.id)}/devolver`, { observaciones })
  return r?.mailError ? { mailError: r.mailError } : {}
}
