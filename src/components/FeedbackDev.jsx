import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function FeedbackDev({ puedeGestionar }) {
  const [reportes, setReportes] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ q: '', tipo: '', estado: '', seccion: '' })

  useEffect(() => { cargarReportes() }, [])
  useEffect(() => { aplicarFiltros() }, [reportes, filtros])

  async function cargarReportes() {
    setLoading(true)
    const { data } = await supabase.from('feedback_desarrollador').select('*').order('created_at', { ascending: false })
    setReportes(data || [])
    setLoading(false)
  }

  function aplicarFiltros() {
    const { q, tipo, estado, seccion } = filtros
    const term = q.toLowerCase()
    const result = reportes.filter(r => {
      const mq = !term || [r.asunto, r.descripcion, r.reportado_por].some(v => v && v.toLowerCase().includes(term))
      return mq && (!tipo || r.tipo === tipo) && (!estado || r.estado === estado) && (!seccion || r.seccion === seccion)
    })
    setFiltered(result)
  }

  async function handleToggleEstado(reporte) {
    const nuevoEstado = reporte.estado === 'Nuevo' ? 'Resuelto' : 'Nuevo'
    const { error } = await supabase.from('feedback_desarrollador').update({ estado: nuevoEstado }).eq('id', reporte.id)
    if (!error) cargarReportes()
  }

  const badgeTipo = (tipo) => {
    const estilos = {
      'Error': { bg: 'rgba(226,85,85,.15)', color: '#e25555' },
      'Falla': { bg: 'rgba(245,166,35,.15)', color: '#f5a623' },
      'Mejora': { bg: 'rgba(79,142,247,.15)', color: '#4f8ef7' },
    }
    const e = estilos[tipo] || { bg: 'rgba(154,184,156,.15)', color: '#9ab89c' }
    return (
      <span style={{ background: e.bg, color: e.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>
        {tipo}
      </span>
    )
  }

  const badgeEstado = (estado) => {
    const e = estado === 'Resuelto'
      ? { bg: 'rgba(52,201,138,.15)', color: '#34c98a' }
      : { bg: 'rgba(200,164,74,.15)', color: '#c8a44a' }
    return (
      <span style={{ background: e.bg, color: e.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>
        {estado}
      </span>
    )
  }

  const formatDate = (d) => {
    if (!d) return '–'
    return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return <div style={{ color: '#9ab89c' }}>Cargando...</div>

  const selectStyle = {
    padding: '8px 10px',
    background: '#1c2e1e',
    border: '1px solid #2a3f2c',
    borderRadius: '6px',
    color: '#e8f0e8',
    fontSize: '13px',
    cursor: 'pointer'
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#5c7a5e' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar por asunto, descripción o quién reportó..."
            value={filtros.q}
            onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
            style={{ width: '100%', padding: '8px 12px 8px 34px', background: '#1c2e1e', border: '1px solid #2a3f2c', borderRadius: '6px', color: '#e8f0e8', fontSize: '13px', boxSizing: 'border-box' }}
          />
        </div>
        <select style={selectStyle} value={filtros.tipo} onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}>
          <option value="">Todos los tipos</option>
          {['Error', 'Falla', 'Mejora'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={selectStyle} value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
          <option value="">Todos los estados</option>
          {['Nuevo', 'Resuelto'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.length ? filtered.map(r => (
          <div key={r.id} style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {badgeTipo(r.tipo)}
                {badgeEstado(r.estado)}
                <span style={{ fontSize: '12px', color: '#5c7a5e' }}>{r.seccion}</span>
              </div>
              {puedeGestionar && (
                <button
                  onClick={() => handleToggleEstado(r)}
                  style={{
                    padding: '5px 10px', borderRadius: '6px',
                    border: `1px solid ${r.estado === 'Nuevo' ? '#34c98a' : '#3a5a3d'}`,
                    background: 'transparent', color: r.estado === 'Nuevo' ? '#34c98a' : '#9ab89c',
                    fontSize: '12px', cursor: 'pointer'
                  }}
                >
                  {r.estado === 'Nuevo' ? 'Marcar resuelto' : 'Reabrir'}
                </button>
              )}
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#e8f0e8', marginBottom: '4px', textDecoration: r.estado === 'Resuelto' ? 'line-through' : 'none' }}>{r.asunto}</div>
            <div style={{ fontSize: '13px', color: '#9ab89c', marginBottom: '8px', whiteSpace: 'pre-wrap', textDecoration: r.estado === 'Resuelto' ? 'line-through' : 'none' }}>{r.descripcion}</div>
            <div style={{ fontSize: '11px', color: '#5c7a5e' }}>
              {r.reportado_por} ({r.reportado_por_email}) · {formatDate(r.created_at)}
            </div>
          </div>
        )) : (
          <div style={{ padding: '40px', textAlign: 'center', color: '#5c7a5e', background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px' }}>
            No hay reportes
          </div>
        )}
      </div>
    </div>
  )
}

export default FeedbackDev
