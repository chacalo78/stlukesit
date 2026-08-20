import { useState, useEffect, useRef } from 'react'
import { CATEGORIAS_REPUESTO, SEDES, leerBorradorRepuesto, guardarBorradorRepuesto, limpiarBorradorRepuesto } from '../constants'

function ModalRepuesto({ repuesto, onClose, onSave }) {
  const blanco = {
    categoria: 'Otro',
    marca: '',
    modelo: '',
    cantidad: 1,
    ubicacion: '',
    observaciones: ''
  }

  const [form, setForm] = useState(() => {
    // Si hay un borrador guardado (la página se recargó sola con el
    // modal abierto), se prioriza sobre lo que venga por props: es lo
    // último que el usuario había tipeado.
    const borrador = leerBorradorRepuesto()
    return borrador ? borrador.form : (repuesto || blanco)
  })

  // El primer render ya inicializa `form` (arriba). Este efecto es solo
  // para cuando el modal ya está abierto y se le pasa un `repuesto`
  // distinto — no debe pisar el borrador recién restaurado al montar.
  const montado = useRef(false)
  useEffect(() => {
    if (!montado.current) { montado.current = true; return }
    if (repuesto) setForm(repuesto)
  }, [repuesto])

  // Se limpia el borrador al desmontar (cancelar o guardar con éxito).
  useEffect(() => {
    return () => limpiarBorradorRepuesto()
  }, [])

  const set = (field, value) => setForm(f => {
    const nuevo = { ...f, [field]: value }
    guardarBorradorRepuesto(nuevo)
    return nuevo
  })

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

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      zIndex: 100, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: '#152116', border: '1px solid #3a5a3d',
        borderRadius: '14px', width: '100%', maxWidth: '440px',
        maxHeight: '92vh', overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid #2a3f2c',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#c8a44a' }}>
            {repuesto ? 'Editar repuesto' : 'Nuevo repuesto'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5c7a5e', fontSize: '20px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Categoría *</label>
            <select style={inputStyle} value={form.categoria} onChange={e => set('categoria', e.target.value)}>
              {CATEGORIAS_REPUESTO.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Marca</label>
            <input style={inputStyle} value={form.marca || ''} onChange={e => set('marca', e.target.value)} placeholder="Ej: Kingston" />
          </div>
          <div>
            <label style={labelStyle}>Modelo</label>
            <input style={inputStyle} value={form.modelo || ''} onChange={e => set('modelo', e.target.value)} placeholder="Ej: DDR4 8GB" />
          </div>
          <div>
            <label style={labelStyle}>Cantidad *</label>
            <input type="number" min="0" style={inputStyle} value={form.cantidad} onChange={e => set('cantidad', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Sede</label>
            <select style={inputStyle} value={form.ubicacion || ''} onChange={e => set('ubicacion', e.target.value)}>
              <option value="">Seleccioná...</option>
              {SEDES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Observaciones</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '60px' }} value={form.observaciones || ''} onChange={e => set('observaciones', e.target.value)} placeholder="Notas adicionales..." />
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
          <button onClick={() => onSave(form)} style={{ padding: '7px 14px', background: '#c8a44a', border: 'none', borderRadius: '6px', color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

export default ModalRepuesto
