import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import ModalRepuesto from './ModalRepuesto'
import { CATEGORIAS_REPUESTO, SEDES, leerBorradorRepuesto } from '../constants'

function Repuestos() {
  const [repuestos, setRepuestos] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ q: '', categoria: '', sede: '' })
  // Si quedó un borrador de ModalRepuesto (la página se recargó sola con
  // el modal abierto, ver constants.js), se reabre automáticamente.
  const [borradorInicial] = useState(() => leerBorradorRepuesto())
  const [modalOpen, setModalOpen] = useState(!!borradorInicial)
  const [repuestoEditando, setRepuestoEditando] = useState(borradorInicial?.form?.id ? borradorInicial.form : null)
  const [toast, setToast] = useState(null)

  useEffect(() => { cargarRepuestos() }, [])
  useEffect(() => { aplicarFiltros() }, [repuestos, filtros])

  async function cargarRepuestos() {
    setLoading(true)
    const { data } = await supabase.from('repuestos').select('*').order('categoria', { ascending: true })
    setRepuestos(data || [])
    setLoading(false)
  }

  function aplicarFiltros() {
    const { q, categoria, sede } = filtros
    const term = q.toLowerCase()
    const result = repuestos.filter(r => {
      const mq = !term || [r.marca, r.modelo, r.observaciones].some(v => v && v.toLowerCase().includes(term))
      return mq && (!categoria || r.categoria === categoria) && (!sede || r.ubicacion === sede)
    })
    setFiltered(result)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleSave(form) {
    const payload = {
      categoria: form.categoria || 'Otro',
      marca: form.marca || null,
      modelo: form.modelo || null,
      cantidad: Number(form.cantidad) || 0,
      ubicacion: form.ubicacion || null,
      observaciones: form.observaciones || null,
    }

    let error
    if (repuestoEditando) {
      const res = await supabase.from('repuestos').update(payload).eq('id', repuestoEditando.id)
      error = res.error
    } else {
      const res = await supabase.from('repuestos').insert(payload)
      error = res.error
    }

    if (error) { showToast('Error: ' + error.message, 'error'); return }
    showToast(repuestoEditando ? 'Repuesto actualizado' : 'Repuesto creado correctamente')
    setModalOpen(false)
    setRepuestoEditando(null)
    cargarRepuestos()
  }

  async function handleEliminar(repuesto) {
    if (!window.confirm(`¿Eliminar "${[repuesto.marca, repuesto.modelo].filter(Boolean).join(' ') || repuesto.categoria}" del inventario de repuestos?`)) return
    const { error } = await supabase.from('repuestos').delete().eq('id', repuesto.id)
    if (error) { showToast('Error al eliminar', 'error'); return }
    showToast('Repuesto eliminado')
    cargarRepuestos()
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

  const btnStyle = (color) => ({
    padding: '5px 10px',
    borderRadius: '6px',
    border: `1px solid ${color}`,
    background: 'transparent',
    color: color,
    fontSize: '12px',
    cursor: 'pointer'
  })

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 200,
          padding: '12px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: '500',
          background: toast.type === 'error' ? 'rgba(226,85,85,.97)' : 'rgba(52,201,138,.97)',
          color: '#fff'
        }}>
          {toast.msg}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '220px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#5c7a5e' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar por marca, modelo..."
            value={filtros.q}
            onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
            style={{ width: '100%', padding: '8px 12px 8px 34px', background: '#1c2e1e', border: '1px solid #2a3f2c', borderRadius: '6px', color: '#e8f0e8', fontSize: '13px', boxSizing: 'border-box' }}
          />
        </div>
        <select style={selectStyle} value={filtros.categoria} onChange={e => setFiltros(f => ({ ...f, categoria: e.target.value }))}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS_REPUESTO.map(c => <option key={c}>{c}</option>)}
        </select>
        <select style={selectStyle} value={filtros.sede} onChange={e => setFiltros(f => ({ ...f, sede: e.target.value }))}>
          <option value="">Todas las sedes</option>
          {SEDES.map(t => <option key={t}>{t}</option>)}
        </select>
        <button
          onClick={() => { setRepuestoEditando(null); setModalOpen(true) }}
          style={{ marginLeft: 'auto', padding: '7px 14px', background: '#c8a44a', border: 'none', borderRadius: '6px', color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + Nuevo repuesto
        </button>
      </div>

      {/* Tabla */}
      <div style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Categoría', 'Marca / Modelo', 'Cantidad', 'Sede', 'Observaciones', 'Acciones'].map(h => (
                  <th key={h} style={{ background: '#1c2e1e', padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#c8a44a', textTransform: 'uppercase', letterSpacing: '.8px', borderBottom: '1px solid #2a3f2c', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #2a3f2c' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: 'rgba(200,164,74,.15)', color: '#c8a44a', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>
                      {r.categoria}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#e8f0e8', fontSize: '13px' }}>{[r.marca, r.modelo].filter(Boolean).join(' ') || '–'}</td>
                  <td style={{ padding: '10px 14px', color: '#e8f0e8', fontSize: '14px', fontWeight: '700' }}>{r.cantidad}</td>
                  <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{r.ubicacion || '–'}</td>
                  <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '12px' }}>{r.observaciones || '–'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={() => { setRepuestoEditando(r); setModalOpen(true) }} style={btnStyle('#9ab89c')}>Editar</button>
                      <button onClick={() => handleEliminar(r)} style={btnStyle('#e25555')}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#5c7a5e' }}>
                    No se encontraron repuestos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <ModalRepuesto
          repuesto={repuestoEditando}
          onClose={() => { setModalOpen(false); setRepuestoEditando(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

export default Repuestos
