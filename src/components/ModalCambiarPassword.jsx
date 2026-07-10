import { useState } from 'react'
import { supabase } from '../supabase'

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

function ModalCambiarPassword({ onClose }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [listo, setListo] = useState(false)

  async function handleGuardar() {
    if (!password || !confirmPassword) {
      setError('Completá los dos campos')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError('No pudimos actualizar la contraseña. Probá de nuevo.')
    } else {
      setListo(true)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      zIndex: 100, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: '#152116', border: '1px solid #3a5a3d',
        borderRadius: '14px', width: '100%', maxWidth: '400px'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid #2a3f2c',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#c8a44a' }}>
            Cambiar contraseña
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5c7a5e', fontSize: '20px' }}>✕</button>
        </div>

        {listo ? (
          <div style={{ padding: '24px' }}>
            <div style={{
              background: 'rgba(52,201,138,.1)', border: '1px solid rgba(52,201,138,.3)',
              color: '#34c98a', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '18px'
            }}>
              Contraseña actualizada correctamente.
            </div>
            <button
              onClick={onClose}
              style={{ width: '100%', padding: '10px', background: '#c8a44a', border: 'none', borderRadius: '6px', color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Nueva contraseña</label>
                <input
                  type="password"
                  style={inputStyle}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label style={labelStyle}>Confirmar contraseña</label>
                <input
                  type="password"
                  style={inputStyle}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={e => e.key === 'Enter' && handleGuardar()}
                />
              </div>
              {error && (
                <div style={{
                  background: 'rgba(226,85,85,.1)', border: '1px solid rgba(226,85,85,.3)',
                  color: '#e25555', padding: '10px 14px', borderRadius: '6px', fontSize: '13px'
                }}>
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 24px 20px', borderTop: '1px solid #2a3f2c',
              display: 'flex', justifyContent: 'flex-end', gap: '10px'
            }}>
              <button onClick={onClose} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid #3a5a3d', borderRadius: '6px', color: '#9ab89c', fontSize: '13px', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={loading}
                style={{ padding: '7px 14px', background: '#c8a44a', border: 'none', borderRadius: '6px', color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}
              >
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ModalCambiarPassword
