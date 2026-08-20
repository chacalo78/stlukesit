import { useState, useEffect, useRef } from 'react'
import { ROLE_LABELS } from '../roles'
import { leerBorradorUsuario, guardarBorradorUsuario, limpiarBorradorUsuario } from '../constants'

const SEDES = ['Nordelta', 'HSM', 'Olivos']

function ModalUsuario({ usuario, onClose, onSave, canManageAdmins }) {
  const rolesDisponibles = canManageAdmins
    ? ['super_admin', 'admin', 'coordinador', 'director']
    : ['coordinador', 'director']

  const blanco = {
    email: '',
    nombre: '',
    rol: 'director',
    sede: ''
  }

  const [form, setForm] = useState(() => {
    // Si hay un borrador guardado (la página se recargó sola con el
    // modal abierto), se prioriza sobre lo que venga por props: es lo
    // último que el usuario había tipeado.
    const borrador = leerBorradorUsuario()
    return borrador ? borrador.form : (usuario || blanco)
  })

  // El primer render ya inicializa `form` (arriba). Este efecto es solo
  // para cuando el modal ya está abierto y se le pasa un `usuario`
  // distinto — no debe pisar el borrador recién restaurado al montar.
  const montado = useRef(false)
  useEffect(() => {
    if (!montado.current) { montado.current = true; return }
    if (usuario) setForm(usuario)
  }, [usuario])

  // Se limpia el borrador al desmontar (cancelar o guardar con éxito).
  useEffect(() => {
    return () => limpiarBorradorUsuario()
  }, [])

  const set = (field, value) => setForm(f => {
    const nuevo = { ...f, [field]: value }
    guardarBorradorUsuario(nuevo)
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
              {rolesDisponibles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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
