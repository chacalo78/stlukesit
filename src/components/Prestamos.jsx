import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import ModalPrestamo from './ModalPrestamo'
import { SEDES } from '../constants'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function estadoPrestamo(p) {
  if (p.fecha_devolucion_real) return 'Devuelto'
  const hoy = new Date().toISOString().slice(0, 10)
  if (p.fecha_devolucion_estimada < hoy) return 'Vencido'
  return 'Activo'
}

function Prestamos({ puedeEditar, sedeScoped, currentUserSede, currentUserNombre }) {
  const [prestamos, setPrestamos] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ q: '', estado: '', sede: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [equiposDisponibles, setEquiposDisponibles] = useState([])
  const [toast, setToast] = useState(null)

  useEffect(() => { cargarPrestamos() }, [])
  useEffect(() => { aplicarFiltros() }, [prestamos, filtros])

  async function cargarPrestamos() {
    setLoading(true)
    const { data } = await supabase
      .from('prestamos')
      .select('*, equipos(id, numero_inventario, tipo, marca, modelo, ubicacion)')
      .order('fecha_prestamo', { ascending: false })
    let rows = data || []
    if (sedeScoped && currentUserSede) {
      rows = rows.filter(p => p.equipos?.ubicacion === currentUserSede)
    }
    setPrestamos(rows)
    setLoading(false)
  }

  async function cargarEquiposDisponibles() {
    let query = supabase.from('equipos').select('*').order('numero_inventario', { ascending: true })
    if (sedeScoped && currentUserSede) {
      query = query.eq('ubicacion', currentUserSede)
    }
    const { data } = await query
    setEquiposDisponibles((data || []).filter(e => e.estado !== 'Prestado' && e.estado !== 'De baja'))
  }

  function aplicarFiltros() {
    const { q, estado, sede } = filtros
    const term = q.toLowerCase()
    const result = prestamos.filter(p => {
      const mq = !term || [p.persona, p.equipos?.numero_inventario, p.equipos?.marca, p.equipos?.modelo].some(v => v && v.toLowerCase().includes(term))
      const me = !estado || estadoPrestamo(p) === estado
      const ms = !sede || p.equipos?.ubicacion === sede
      return mq && me && ms
    })
    setFiltered(result)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), type === 'error' ? 8000 : 3500)
  }

  async function abrirModalNuevo() {
    await cargarEquiposDisponibles()
    setModalOpen(true)
  }

  async function handleNuevoPrestamo(form) {
    const email = form.email_destinatario?.trim() || ''
    if (!form.equipo_id || !form.persona?.trim() || !form.fecha_devolucion_estimada || !email) {
      showToast('Equipo, persona, fecha de devolución y correo electrónico son obligatorios', 'error')
      return
    }
    if (email.length < 6 || !EMAIL_REGEX.test(email)) {
      showToast('Ingresá un correo electrónico válido', 'error')
      return
    }

    const payload = {
      equipo_id: form.equipo_id,
      persona: form.persona.trim(),
      email_destinatario: email,
      sector: form.sector || null,
      fecha_devolucion_estimada: form.fecha_devolucion_estimada,
      observaciones_entrega: form.observaciones_entrega || null,
      registrado_por: currentUserNombre || 'Sistema'
    }

    const { error } = await supabase.from('prestamos').insert(payload)
    if (error) { showToast('Error: ' + error.message, 'error'); return }

    await supabase.from('equipos').update({ estado: 'Prestado', usuario: payload.persona }).eq('id', form.equipo_id)
    const equipo = equiposDisponibles.find(e => e.id === form.equipo_id)
    await supabase.from('movimientos').insert({
      equipo_id: form.equipo_id,
      tipo_movimiento: 'Préstamo',
      descripcion: `Equipo prestado a ${payload.persona}${equipo ? ` (${equipo.numero_inventario})` : ''}`,
      usuario: currentUserNombre || 'Sistema'
    })

    if (payload.email_destinatario) {
      try {
        const { data: mailData, error: mailError } = await supabase.functions.invoke('notify-prestamo', {
          body: {
            email: payload.email_destinatario,
            persona: payload.persona,
            numeroInventario: equipo?.numero_inventario || '',
            tipo: equipo?.tipo || '',
            marca: equipo?.marca || '',
            modelo: equipo?.modelo || '',
            fechaDevolucion: payload.fecha_devolucion_estimada,
          }
        })
        if (mailError || mailData?.warning) {
          console.error('Error enviando mail de préstamo:', mailError, mailData)
          const detalle = mailData?.detail || mailError?.message || 'motivo desconocido'
          showToast(`Préstamo registrado, pero no se pudo enviar el mail (${detalle})`, 'error')
        } else {
          showToast('Préstamo registrado correctamente')
        }
      } catch (e) {
        console.error('Error enviando mail de préstamo:', e)
        showToast(`Préstamo registrado, pero no se pudo enviar el mail (${e?.message || 'motivo desconocido'})`, 'error')
      }
    } else {
      showToast('Préstamo registrado correctamente')
    }

    setModalOpen(false)
    cargarPrestamos()
  }

  async function handleDevolver(p) {
    if (!window.confirm(`¿Confirmar devolución del equipo "${p.equipos?.numero_inventario}" por parte de ${p.persona}?`)) return
    const observaciones = window.prompt('Observaciones de la devolución (opcional):', '') || null
    const fechaDevolucionReal = new Date().toISOString()

    const { error } = await supabase.from('prestamos').update({
      fecha_devolucion_real: fechaDevolucionReal,
      observaciones_devolucion: observaciones
    }).eq('id', p.id)
    if (error) { showToast('Error al registrar la devolución', 'error'); return }

    await supabase.from('equipos').update({ estado: 'Activo', usuario: null }).eq('id', p.equipo_id)
    await supabase.from('movimientos').insert({
      equipo_id: p.equipo_id,
      tipo_movimiento: 'Devolución',
      descripcion: `Equipo devuelto por ${p.persona}${p.equipos ? ` (${p.equipos.numero_inventario})` : ''}`,
      usuario: currentUserNombre || 'Sistema'
    })

    if (p.email_destinatario) {
      try {
        const { data: mailData, error: mailError } = await supabase.functions.invoke('notify-prestamo', {
          body: {
            accion: 'devolucion',
            email: p.email_destinatario,
            persona: p.persona,
            numeroInventario: p.equipos?.numero_inventario || '',
            tipo: p.equipos?.tipo || '',
            marca: p.equipos?.marca || '',
            modelo: p.equipos?.modelo || '',
            fechaDevolucion: fechaDevolucionReal,
            observaciones: observaciones || '',
          }
        })
        if (mailError || mailData?.warning) {
          console.error('Error enviando mail de devolución:', mailError, mailData)
          const detalle = mailData?.detail || mailError?.message || 'motivo desconocido'
          showToast(`Devolución registrada, pero no se pudo enviar el mail (${detalle})`, 'error')
        } else {
          showToast('Devolución registrada')
        }
      } catch (e) {
        console.error('Error enviando mail de devolución:', e)
        showToast(`Devolución registrada, pero no se pudo enviar el mail (${e?.message || 'motivo desconocido'})`, 'error')
      }
    } else {
      showToast('Devolución registrada')
    }

    cargarPrestamos()
  }

  const badgeEstado = (estado) => {
    const estilos = {
      'Activo': { bg: 'rgba(52,201,138,.15)', color: '#34c98a' },
      'Vencido': { bg: 'rgba(226,85,85,.15)', color: '#e25555' },
      'Devuelto': { bg: 'rgba(154,184,156,.15)', color: '#9ab89c' },
    }
    const e = estilos[estado] || estilos.Activo
    return (
      <span style={{ background: e.bg, color: e.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>
        {estado}
      </span>
    )
  }

  const formatDate = (d) => {
    if (!d) return '–'
    return new Date(d + 'T00:00:00').toLocaleDateString('es-AR')
  }

  const formatDateTime = (d) => {
    if (!d) return '–'
    return new Date(d).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
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
            placeholder="Buscar por persona o equipo..."
            value={filtros.q}
            onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
            style={{ width: '100%', padding: '8px 12px 8px 34px', background: '#1c2e1e', border: '1px solid #2a3f2c', borderRadius: '6px', color: '#e8f0e8', fontSize: '13px', boxSizing: 'border-box' }}
          />
        </div>
        <select style={selectStyle} value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
          <option value="">Todos los estados</option>
          {['Activo', 'Vencido', 'Devuelto'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={selectStyle} value={filtros.sede} onChange={e => setFiltros(f => ({ ...f, sede: e.target.value }))}>
          <option value="">Todas las sedes</option>
          {SEDES.map(t => <option key={t}>{t}</option>)}
        </select>
        {/* Botón nuevo préstamo */}
        {puedeEditar && (
          <button
            onClick={abrirModalNuevo}
            style={{ marginLeft: 'auto', padding: '7px 14px', background: '#c8a44a', border: 'none', borderRadius: '6px', color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + Nuevo préstamo
          </button>
        )}
      </div>

      {/* Tabla */}
      <div style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Equipo', 'Persona', 'Sector', 'Sede', 'Préstamo', 'Devolución est.', 'Fecha de devolución', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={{ background: '#1c2e1e', padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#c8a44a', textTransform: 'uppercase', letterSpacing: '.8px', borderBottom: '1px solid #2a3f2c', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map(p => {
                const estado = estadoPrestamo(p)
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #2a3f2c' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px', color: '#c8a44a' }}>{p.equipos?.numero_inventario || '–'}</td>
                    <td style={{ padding: '10px 14px', color: '#e8f0e8', fontSize: '13px' }}>{p.persona}</td>
                    <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{p.sector || '–'}</td>
                    <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{p.equipos?.ubicacion || '–'}</td>
                    <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{formatDate(p.fecha_prestamo)}</td>
                    <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{formatDate(p.fecha_devolucion_estimada)}</td>
                    <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{formatDateTime(p.fecha_devolucion_real)}</td>
                    <td style={{ padding: '10px 14px' }}>{badgeEstado(estado)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {puedeEditar && estado !== 'Devuelto' && (
                        <button onClick={() => handleDevolver(p)} style={btnStyle('#9ab89c')}>Devolver</button>
                      )}
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: '#5c7a5e' }}>
                    No se encontraron préstamos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <ModalPrestamo
          equiposDisponibles={equiposDisponibles}
          onClose={() => setModalOpen(false)}
          onSave={handleNuevoPrestamo}
        />
      )}
    </div>
  )
}

export default Prestamos
