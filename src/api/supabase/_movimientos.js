import { supabase } from '../../supabase'

// Helper privado: registra una fila en `movimientos`. Igual que antes en
// los componentes, un error al registrar NO interrumpe la operación
// principal (se ignora).
export async function registrarMovimiento({ tipo_movimiento, descripcion, usuario }) {
  await supabase.from('movimientos').insert({ tipo_movimiento, descripcion, usuario })
}
