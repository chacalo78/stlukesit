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

// Fondos de hardware (Unsplash, licencia libre) guardados en escala de grises; el verde se aplica por CSS.
// Se elige uno al azar en cada carga de la página.
const FONDOS = [1, 2, 3, 4, 5, 6].map(n => `${import.meta.env.BASE_URL}fondos/fondo-${n}.jpg`)

function FondoLogin() {
  const [src] = useState(() => FONDOS[Math.floor(Math.random() * FONDOS.length)])
  const [cargado, setCargado] = useState(false)
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <img
        src={src}
        alt=""
        onLoad={() => setCargado(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          filter: 'contrast(1.1) brightness(.95)',
          opacity: cargado ? 1 : 0,
          transition: 'opacity .6s ease'
        }}
      />
      {/* Tiñe la foto de verde (monocromático) y la oscurece para que el recuadro se lea bien */}
      <div style={{ position: 'absolute', inset: 0, background: '#3f8a46', mixBlendMode: 'color' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,21,11,.45)' }} />
    </div>
  )
}

function Login({ sesionExpirada }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [cuentaInhabilitada, setCuentaInhabilitada] = useState(false)

  async function handleLogin() {
    if (!email || !password) {
      setError('Completá email y contraseña')
      return
    }
    setLoading(true)
    setError('')
    setCuentaInhabilitada(false)
    try {
      await auth.iniciarSesion(email, password)
    } catch (e) {
      if (e.code === 'cuenta_inhabilitada') {
        setCuentaInhabilitada(true)
      } else {
        setError('Email o contraseña incorrectos')
      }
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Ingresá tu email')
      return
    }
    setLoading(true)
    setError('')
    setInfo('')
    try {
      await auth.pedirRecuperacion(email)
      setLoading(false)
      setInfo('Si el email existe, te enviamos un enlace para recuperar tu contraseña.')
    } catch {
      setLoading(false)
      setError('No pudimos enviar el correo. Intentá de nuevo.')
    }
  }

  function switchMode(newMode) {
    setMode(newMode)
    setError('')
    setInfo('')
    setCuentaInhabilitada(false)
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '24px',
      position: 'relative',
      background: 'linear-gradient(135deg, #0a150b 0%, #1a3d1c 50%, #0f1a10 100%)'
    }}>
      <FondoLogin />
      <div style={{
        position: 'relative',
        zIndex: 1,
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
            onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleForgotPassword())}
            style={inputStyle}
          />
        </div>

        {mode === 'login' && (
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
              style={inputStyle}
            />
          </div>
        )}

        {sesionExpirada && (
          <div style={{
            background: 'rgba(200,164,74,.1)',
            border: '1px solid rgba(200,164,74,.3)',
            color: '#c8a44a',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            marginBottom: '12px'
          }}>
            Tu sesión se cerró por inactividad. Ingresá de nuevo para continuar.
          </div>
        )}

        {cuentaInhabilitada && (
          <div style={{
            background: 'rgba(226,85,85,.1)',
            border: '1px solid rgba(226,85,85,.3)',
            color: '#e25555',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            marginBottom: '12px'
          }}>
            Tu cuenta está inhabilitada. Contactá a un administrador del sistema en{' '}
            <a href="mailto:soporte.tecnico@colegiosanlucas.edu.ar" style={{ color: '#e25555', fontWeight: '600' }}>
              soporte.tecnico@colegiosanlucas.edu.ar
            </a> para más información.
          </div>
        )}

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

        {info && (
          <div style={{
            background: 'rgba(200,164,74,.1)',
            border: '1px solid rgba(200,164,74,.3)',
            color: '#c8a44a',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            marginBottom: '12px'
          }}>
            {info}
          </div>
        )}

        {mode === 'login' ? (
          <>
            <button
              onClick={handleLogin}
              disabled={loading}
              style={{ ...buttonStyle, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1 }}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                onClick={() => switchMode('forgot')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ab89c',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              onClick={handleForgotPassword}
              disabled={loading}
              style={{ ...buttonStyle, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1 }}
            >
              {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                onClick={() => switchMode('login')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#9ab89c',
                  fontSize: '12px',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Volver a ingresar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default Login
