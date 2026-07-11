import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import ModalEquipo from './ModalEquipo'

function Historial() {
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [equipoVer, setEquipoVer] = useState(null)

  useEffect(() => {
    async function cargarHistorial() {
      const { data } = await supabase
        .from('movimientos')
        .select('*, equipos(*)')
        .order('fecha', { ascending: false })
        .limit(200)
      setMovimientos(data || [])
      setLoading(false)
    }
    cargarHistorial()
  }, [])

  const badgeMovimiento = (tipo) => {
    const estilos = {
      'Alta': { bg: 'rgba(52,201,138,.15)', color: '#34c98a' },
      'Baja': { bg: 'rgba(226,85,85,.15)', color: '#e25555' },
      'Modificación': { bg: 'rgba(200,164,74,.15)', color: '#c8a44a' },
      'Traslado': { bg: 'rgba(245,166,35,.15)', color: '#f5a623' },
      'Reparación': { bg: 'rgba(155,109,255,.15)', color: '#9b6dff' },
    }
    const e = estilos[tipo] || { bg: 'rgba(154,184,156,.15)', color: '#9ab89c' }
    return (
      <span style={{ background: e.bg, color: e.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>
        {tipo}
      </span>
    )
  }

  const formatDate = (d) => {
    if (!d) return '–'
    return new Date(d).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  if (loading) return <div style={{ color: '#9ab89c' }}>Cargando...</div>

  if (!movimientos.length) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#5c7a5e' }}>
      <div style={{ fontSize: '40px', marginBottom: '12px' }}>📜</div>
      <p>Sin movimientos registrados aún</p>
    </div>
  )

  return (
    <div style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Tipo', 'Inventario', 'Equipo', 'Descripción', 'Usuario', 'Fecha'].map(h => (
                <th key={h} style={{ background: '#1c2e1e', padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#c8a44a', textTransform: 'uppercase', letterSpacing: '.8px', borderBottom: '1px solid #2a3f2c', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {movimientos.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid #2a3f2c' }}>
                <td style={{ padding: '10px 14px' }}>{badgeMovimiento(m.tipo_movimiento)}</td>
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: '#c8a44a' }}>
                  {m.equipos ? (
                    <button
                      onClick={() => setEquipoVer(m.equipos)}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontFamily: 'monospace', fontSize: '12px', color: '#c8a44a', textDecoration: 'underline'
                      }}
                    >
                      {m.equipos.numero_inventario}
                    </button>
                  ) : '–'}
                </td>
                <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>
                  {m.equipos?.tipo || '–'}
                </td>
                <td style={{ padding: '10px 14px', color: '#e8f0e8', fontSize: '13px' }}>
                  {m.descripcion || '–'}
                </td>
                <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '12px' }}>
                  {m.usuario || '–'}
                </td>
                <td style={{ padding: '10px 14px', color: '#5c7a5e', fontSize: '12px' }}>
                  {formatDate(m.fecha)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {equipoVer && (
        <ModalEquipo equipo={equipoVer} readOnly onClose={() => setEquipoVer(null)} onSave={() => {}} />
      )}
    </div>
  )
}

export default Historial