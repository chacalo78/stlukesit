import { useState } from 'react'
import { auth } from '../api'

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  background: '#1c2e1e',
  border: '1px solid #2a3f2c',
  borderRadius: '6px',
  color: '#e8f0e8',
  fontSize: '14px',
  boxSizing: 'border-box'
}

const buttonStyle = {
  width: '100%',
  padding: '12px',
  background: 'linear-gradient(135deg, #c8a44a, #a8842a)',
  color: '#1a1a0a',
  border: 'none',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: '700',
  letterSpacing: '.3px'
}

// Enlaces de la API propia: /?token=<t>&tipo=recuperacion|invitacion.
// Con Supabase no hay token en la URL (la sesión de recuperación va aparte).
function leerEnlace() {
  const p = new URLSearchParams(window.location.search)
  return { token: p.get('token'), tipo: p.get('tipo') }
}

function UpdatePassword({ onDone }) {
  const { token, tipo } = leerEnlace()
  const esInvitacion = tipo === 'invitacion'
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleUpdate() {
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
    try {
      await auth.establecerPasswordConToken(token, password)
      // Se limpia ?token=&tipo= para que el enlace no quede en la barra ni se reuse.
      if (token) window.history.replaceState(null, '', window.location.pathname + window.location.hash)
      setLoading(false)
      onDone()
    } catch (err) {
      setLoading(false)
      // Los errores de la API propia (enlace vencido, contraseña inválida) traen mensaje en español.
      setError(err.status ? err.message : 'No pudimos actualizar la contraseña. Probá pedir el enlace de nuevo.')
    }
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '24px',
      background: 'linear-gradient(135deg, #0a150b 0%, #1a3d1c 50%, #0f1a10 100%)'
    }}>
      <div style={{
        background: 'rgba(21,33,22,0.95)',
        border: '1px solid #3a5a3d',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '400px',
        padding: '40px 36px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h1 style={{ color: '#c8a44a', fontSize: '18px', fontWeight: '700', marginBottom: '4px', letterSpacing: '.5px' }}>
            {esInvitacion ? 'Creá tu contraseña' : 'Nueva contraseña'}
          </h1>
          <p style={{ color: '#5c7a5e', fontSize: '12px' }}>
            {esInvitacion ? 'Elegí una contraseña para activar tu cuenta' : 'Elegí una nueva contraseña para tu cuenta'}
          </p>
        </div>

        <div style={{
          height: '1px',
          background: 'linear-gradient(90deg, transparent, #3a5a3d, transparent)',
          margin: '20px 0'
        }} />

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', color: '#9ab89c', display: 'block', marginBottom: '6px' }}>
            Nueva contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', color: '#9ab89c', display: 'block', marginBottom: '6px' }}>
            Confirmar contraseña
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && handleUpdate()}
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={{
            background: 'rgba(226,85,85,.1)',
            border: '1px solid rgba(226,85,85,.3)',
            color: '#e25555',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            marginBottom: '12px'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleUpdate}
          disabled={loading}
          style={{ ...buttonStyle, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1 }}
        >
          {loading ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </div>
    </div>
  )
}

export default UpdatePassword
