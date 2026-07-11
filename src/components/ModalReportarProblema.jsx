import { useState } from 'react'
import { supabase } from '../supabase'

const SECCIONES = ['Dashboard', 'Equipos', 'Historial', 'Reportes', 'Préstamos', 'Usuarios', 'Login / Acceso', 'Otro']

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

function ModalReportarProblema({ nombre, email, onClose }) {
  const [form, setForm] = useState({ tipo: '', seccion: '', asunto: '', descripcion: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [listo, setListo] = useState(false)

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  async function handleEnviar() {
    if (!form.tipo || !form.seccion || !form.asunto.trim() || !form.descripcion.trim()) {
      setError('Todos los campos son obligatorios')
      return
    }
    setLoading(true)
    setError('')
    const { error } = await supabase.from('feedback_desarrollador').insert({
      tipo: form.tipo,
      seccion: form.seccion,
      asunto: form.asunto.trim(),
      descripcion: form.descripcion.trim(),
      reportado_por: nombre || email,
      reportado_por_email: email
    })
    setLoading(false)
    if (error) {
      setError('No pudimos enviar el reporte. Probá de nuevo.')
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
        borderRadius: '14px', width: '100%', maxWidth: '460px',
        maxHeight: '92vh', overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid #2a3f2c',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#c8a44a' }}>
            Informar error / mejora
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5c7a5e', fontSize: '20px' }}>✕</button>
        </div>

        {listo ? (
          <div style={{ padding: '24px' }}>
            <div style={{
              background: 'rgba(52,201,138,.1)', border: '1px solid rgba(52,201,138,.3)',
              color: '#34c98a', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', marginBottom: '18px'
            }}>
              Gracias, tu reporte fue enviado.
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
                <label style={labelStyle}>Tipo *</label>
                <select style={inputStyle} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                  <option value="">Seleccioná...</option>
                  {['Error', 'Falla', 'Mejora'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sección relacionada *</label>
                <select style={inputStyle} value={form.seccion} onChange={e => set('seccion', e.target.value)}>
                  <option value="">Seleccioná...</option>
                  {SECCIONES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Asunto *</label>
                <input style={inputStyle} value={form.asunto} onChange={e => set('asunto', e.target.value)} placeholder="Resumen breve del problema o idea" />
              </div>
              <div>
                <label style={labelStyle}>Descripción *</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '90px' }} value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Contá qué pasó, cómo reproducirlo, o el detalle de la mejora" />
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
                onClick={handleEnviar}
                disabled={loading}
                style={{ padding: '7px 14px', background: '#c8a44a', border: 'none', borderRadius: '6px', color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}
              >
                {loading ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ModalReportarProblema
