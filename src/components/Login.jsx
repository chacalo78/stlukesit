import { useState } from 'react'
import { supabase } from '../supabase'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) {
      setError('Completá email y contraseña')
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(`DEBUG: ${error.message} (status ${error.status})`)
      setLoading(false)
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
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="St. Luke's College"
            style={{
            width: '170px',
            height: 'auto',
            marginBottom: '14px',
  filter: 'drop-shadow(0 4px 12px rgba(200,164,74,0.3))'
}}
          />
          <h1 style={{ color: '#c8a44a', fontSize: '18px', fontWeight: '700', marginBottom: '4px', letterSpacing: '.5px' }}>
            St. Luke's College
          </h1>
          <p style={{ color: '#5c7a5e', fontSize: '12px' }}>
          Sistema de IT
          </p>
        </div>

        <div style={{
          height: '1px',
          background: 'linear-gradient(90deg, transparent, #3a5a3d, transparent)',
          margin: '20px 0'
        }} />

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', color: '#9ab89c', display: 'block', marginBottom: '6px' }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@email.com"
            style={{
              width: '100%',
              padding: '11px 14px',
              background: '#1c2e1e',
              border: '1px solid #2a3f2c',
              borderRadius: '6px',
              color: '#e8f0e8',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', color: '#9ab89c', display: 'block', marginBottom: '6px' }}>
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{
              width: '100%',
              padding: '11px 14px',
              background: '#1c2e1e',
              border: '1px solid #2a3f2c',
              borderRadius: '6px',
              color: '#e8f0e8',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
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
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: 'linear-gradient(135deg, #c8a44a, #a8842a)',
            color: '#1a1a0a',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '700',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.5 : 1,
            letterSpacing: '.3px'
          }}
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </div>
    </div>
  )
}

export default Login
