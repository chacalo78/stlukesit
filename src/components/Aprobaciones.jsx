import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { CAMPOS_LABEL_EQUIPO as CAMPOS_LABEL, identificarEquipo, camposModificados } from '../constants'

function Aprobaciones({ canApproveChanges, currentUserEmail, currentUserNombre }) {
  const [solicitudes, setSolicitudes] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ estado: 'Pendiente', tipo: '' })
  const [toast, setToast] = useState(null)
  const [expandido, setExpandido] = useState(null)

  useEffect(() => { cargarSolicitudes() }, [])
  useEffect(() => { aplicarFiltros() }, [solicitudes, filtros])

  async function cargarSolicitudes() {
    setLoading(true)
    let query = supabase
      .from('solicitudes_cambio')
      .select('*, equipos(numero_inventario, tipo, marca, modelo)')
      .order('fecha_solicitud', { ascending: false })
    if (!canApproveChanges) {
      query = query.eq('solicitado_por_email', currentUserEmail)
    }
    const { data } = await query
    setSolicitudes(data || [])
    setLoading(false)
  }

  function aplicarFiltros() {
    const { estado, tipo } = filtros
    const result = solicitudes.filter(s =>
      (!estado || s.estado === estado) && (!tipo || s.tipo_accion === tipo)
    )
    setFiltered(result)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleAprobar(s) {
    if (!window.confirm(`¿Aprobar esta solicitud de ${s.tipo_accion.toLowerCase()}?`)) return

    let error
    if (s.tipo_accion === 'Alta') {
      const res = await supabase.from('equipos').insert(s.datos_propuestos).select().single()
      error = res.error
      if (!error) await supabase.from('movimientos').insert({
        equipo_id: res.data.id,
        tipo_movimiento: 'Alta',
        descripcion: `Equipo dado de alta: ${identificarEquipo(s.datos_propuestos)} (solicitado por ${s.solicitado_por})`,
        usuario: currentUserNombre || 'Sistema'
      })
    } else if (s.tipo_accion === 'Modificación') {
      const res = await supabase.from('equipos').update(s.datos_propuestos).eq('id', s.equipo_id)
      error = res.error
      if (!error) {
        const cambios = camposModificados(s.datos_anteriores, s.datos_propuestos)
        const cambiosTxt = cambios.length ? ` — ${cambios.join('; ')}` : ''
        await supabase.from('movimientos').insert({
          equipo_id: s.equipo_id,
          tipo_movimiento: 'Modificación',
          descripcion: `Equipo modificado: ${identificarEquipo(s.datos_propuestos)}${cambiosTxt} (solicitado por ${s.solicitado_por})`,
          usuario: currentUserNombre || 'Sistema'
        })
      }
    } else {
      const res = await supabase.from('equipos').update({ estado: 'De baja' }).eq('id', s.equipo_id)
      error = res.error
      if (!error) await supabase.from('movimientos').insert({
        equipo_id: s.equipo_id,
        tipo_movimiento: 'Baja',
        descripcion: `Equipo dado de baja: ${identificarEquipo(s.datos_anteriores)} (solicitado por ${s.solicitado_por})`,
        usuario: currentUserNombre || 'Sistema'
      })
    }

    if (error) { showToast('Error al aplicar el cambio: ' + error.message, 'error'); return }

    await supabase.from('solicitudes_cambio').update({
      estado: 'Aprobado',
      resuelto_por: currentUserNombre || 'Sistema',
      fecha_resolucion: new Date().toISOString()
    }).eq('id', s.id)

    showToast('Solicitud aprobada y aplicada')
    cargarSolicitudes()
  }

  async function handleRechazar(s) {
    if (!window.confirm('¿Rechazar esta solicitud?')) return
    const comentario = window.prompt('Motivo del rechazo (opcional):', '') || null

    const { error } = await supabase.from('solicitudes_cambio').update({
      estado: 'Rechazado',
      resuelto_por: currentUserNombre || 'Sistema',
      fecha_resolucion: new Date().toISOString(),
      comentario_resolucion: comentario
    }).eq('id', s.id)

    if (error) { showToast('Error al rechazar', 'error'); return }
    showToast('Solicitud rechazada')
    cargarSolicitudes()
  }

  const badgeEstado = (estado) => {
    const estilos = {
      'Pendiente': { bg: 'rgba(200,164,74,.15)', color: '#c8a44a' },
      'Aprobado': { bg: 'rgba(52,201,138,.15)', color: '#34c98a' },
      'Rechazado': { bg: 'rgba(226,85,85,.15)', color: '#e25555' },
    }
    const e = estilos[estado] || estilos.Pendiente
    return (
      <span style={{ background: e.bg, color: e.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>
        {estado}
      </span>
    )
  }

  const badgeTipo = (tipo) => {
    const estilos = {
      'Alta': { bg: 'rgba(52,201,138,.15)', color: '#34c98a' },
      'Modificación': { bg: 'rgba(79,142,247,.15)', color: '#4f8ef7' },
      'Baja': { bg: 'rgba(226,85,85,.15)', color: '#e25555' },
    }
    const e = estilos[tipo] || estilos.Modificación
    return (
      <span style={{ background: e.bg, color: e.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>
        {tipo}
      </span>
    )
  }

  const formatDate = (d) => {
    if (!d) return '–'
    return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function renderDetalle(s) {
    const anterior = s.datos_anteriores || {}
    const propuesto = s.datos_propuestos || {}
    const campos = s.tipo_accion === 'Alta'
      ? Object.keys(propuesto).filter(k => propuesto[k])
      : Object.keys(propuesto).filter(k => propuesto[k] !== anterior[k])

    if (!campos.length) return <div style={{ color: '#5c7a5e', fontSize: '12px' }}>Sin cambios de datos (baja de estado).</div>

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {campos.map(k => (
          <div key={k} style={{ fontSize: '12px' }}>
            <span style={{ color: '#5c7a5e' }}>{CAMPOS_LABEL[k] || k}: </span>
            {s.tipo_accion === 'Modificación' && (
              <span style={{ color: '#e25555', textDecoration: 'line-through', marginRight: '6px' }}>{anterior[k] ?? '–'}</span>
            )}
            <span style={{ color: '#34c98a' }}>{propuesto[k] ?? '–'}</span>
          </div>
        ))}
      </div>
    )
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

      {!canApproveChanges && (
        <div style={{
          background: 'rgba(200,164,74,.08)', border: '1px solid rgba(200,164,74,.25)',
          borderRadius: '8px', padding: '10px 14px', marginBottom: '16px',
          fontSize: '12px', color: '#c8a44a'
        }}>
          Acá ves el estado de tus propias solicitudes de alta/modificación/baja de equipos.
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={selectStyle} value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
          <option value="">Todos los estados</option>
          {['Pendiente', 'Aprobado', 'Rechazado'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={selectStyle} value={filtros.tipo} onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}>
          <option value="">Todos los tipos</option>
          {['Alta', 'Modificación', 'Baja'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.length ? filtered.map(s => (
          <div key={s.id} style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {badgeTipo(s.tipo_accion)}
                {badgeEstado(s.estado)}
                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#c8a44a' }}>
                  {s.equipos?.numero_inventario || s.datos_propuestos?.numero_inventario || 'Equipo nuevo'}
                </span>
              </div>
              {canApproveChanges && s.estado === 'Pendiente' && (
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button onClick={() => handleAprobar(s)} style={btnStyle('#34c98a')}>Aprobar</button>
                  <button onClick={() => handleRechazar(s)} style={btnStyle('#e25555')}>Rechazar</button>
                </div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#5c7a5e', marginBottom: '8px' }}>
              Pedido por {s.solicitado_por} el {formatDate(s.fecha_solicitud)}
              {s.estado !== 'Pendiente' && ` · ${s.estado} por ${s.resuelto_por} el ${formatDate(s.fecha_resolucion)}`}
            </div>
            {s.comentario_resolucion && (
              <div style={{ fontSize: '12px', color: '#9ab89c', marginBottom: '8px', fontStyle: 'italic' }}>
                "{s.comentario_resolucion}"
              </div>
            )}
            <button
              onClick={() => setExpandido(expandido === s.id ? null : s.id)}
              style={{ background: 'none', border: 'none', color: '#4f8ef7', fontSize: '12px', cursor: 'pointer', padding: 0 }}
            >
              {expandido === s.id ? 'Ocultar detalle' : 'Ver detalle'}
            </button>
            {expandido === s.id && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #2a3f2c' }}>
                {renderDetalle(s)}
              </div>
            )}
          </div>
        )) : (
          <div style={{ padding: '40px', textAlign: 'center', color: '#5c7a5e', background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px' }}>
            No hay solicitudes
          </div>
        )}
      </div>
    </div>
  )
}

export default Aprobaciones
