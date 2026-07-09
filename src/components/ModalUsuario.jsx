import { useState, useEffect } from 'react'

const ROLES = ['admin', 'coordinador', 'viewer']
const SEDES = ['Nordelta', 'HSM', 'Olivos']

function ModalUsuario({ usuario, onClose, onSave }) {
  const [form, setForm] = useState({
    email: '',
    nombre: '',
    rol: 'viewer',
    sede: ''
  })

  useEffect(() => {
    if (usuario) setForm(usuario)
  }, [usuario])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

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
            {usuario ? 'Editar usuario' : 'Nuevo usuario'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5c7a5e', fontSize: '20px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Email *</label>
            <input
              type="email"
              style={{ ...inputStyle, opacity: usuario ? 0.6 : 1 }}
              value={form.email}
              disabled={!!usuario}
              onChange={e => set('email', e.target.value)}
              placeholder="usuario@stlukes.edu.ar"
            />
          </div>
          <div>
            <label style={labelStyle}>Nombre *</label>
            <input style={inputStyle} value={form.nombre || ''} onChange={e => set('nombre', e.target.value)} placeholder="Nombre y apellido" />
          </div>
          <div>
            <label style={labelStyle}>Rol *</label>
            <select style={inputStyle} value={form.rol} onChange={e => set('rol', e.target.value)}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sede</label>
            <select style={inputStyle} value={form.sede || ''} onChange={e => set('sede', e.target.value)}>
              <option value="">Sin restricción de sede</option>
              {SEDES.map(s => <option key={s}>{s}</option>)}
            </select>
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

export default ModalUsuario
