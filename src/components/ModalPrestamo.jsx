import { useState } from 'react'
import { SECTORES } from '../constants'

function ModalPrestamo({ equiposDisponibles, onClose, onSave }) {
  const [busqueda, setBusqueda] = useState('')
  const [form, setForm] = useState({
    equipo_id: '',
    persona: '',
    sector: '',
    fecha_devolucion_estimada: '',
    observaciones_entrega: ''
  })

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const term = busqueda.toLowerCase()
  const equiposFiltrados = !term ? equiposDisponibles : equiposDisponibles.filter(e =>
    [e.numero_inventario, e.marca, e.modelo, e.tipo].some(v => v && v.toLowerCase().includes(term))
  )

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    background: '#1c2e1e',
    border: '1px solid #2a3f2c',
    borderRadius: '6px',
    color: '#e8f0e8',
    fontSize: '13px',
    boxSizing: 'border-box',
    fontFamily: 'Inter, sans-serif'
  }

  const labelStyle = {
    fontSize: '12px',
    fontWeight: '500',
    color: '#9ab89c',
    display: 'block',
    marginBottom: '5px'
  }

  function handleSave() {
    onSave(form)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      zIndex: 100, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: '#152116', border: '1px solid #3a5a3d',
        borderRadius: '14px', width: '100%', maxWidth: '480px',
        maxHeight: '92vh', overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid #2a3f2c',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#c8a44a' }}>
            Nuevo préstamo
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5c7a5e', fontSize: '20px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Buscar equipo</label>
            <input
              style={inputStyle}
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="N° inventario, marca, modelo..."
            />
          </div>
          <div>
            <label style={labelStyle}>Equipo *</label>
            <select style={inputStyle} value={form.equipo_id} onChange={e => set('equipo_id', e.target.value)}>
              <option value="">Seleccioná...</option>
              {equiposFiltrados.map(e => (
                <option key={e.id} value={e.id}>
                  {e.numero_inventario} — {[e.tipo, e.marca, e.modelo].filter(Boolean).join(' ')}{e.ubicacion ? ` (${e.ubicacion})` : ''}
                </option>
              ))}
            </select>
            {equiposDisponibles.length === 0 && (
              <div style={{ fontSize: '11px', color: '#e25555', marginTop: '4px' }}>No hay equipos disponibles para prestar.</div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Persona que retira *</label>
            <input style={inputStyle} value={form.persona} onChange={e => set('persona', e.target.value)} placeholder="Nombre y apellido" />
          </div>
          <div>
            <label style={labelStyle}>Sector</label>
            <select style={inputStyle} value={form.sector} onChange={e => set('sector', e.target.value)}>
              <option value="">Seleccioná...</option>
              {SECTORES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Devolución estimada *</label>
            <input type="date" style={inputStyle} value={form.fecha_devolucion_estimada} onChange={e => set('fecha_devolucion_estimada', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Observaciones de entrega</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={form.observaciones_entrega} onChange={e => set('observaciones_entrega', e.target.value)} placeholder="Estado del equipo, accesorios entregados, etc." />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px 20px', borderTop: '1px solid #2a3f2c',
          display: 'flex', justifyContent: 'flex-end', gap: '10px'
        }}>
          <button onClick={onClose} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid #3a5a3d', borderRadius: '6px', color: '#9ab89c', fontSize: '13px', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={handleSave} style={{ padding: '7px 14px', background: '#c8a44a', border: 'none', borderRadius: '6px', color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

export default ModalPrestamo
