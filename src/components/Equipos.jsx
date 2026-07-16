import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import ModalEquipo from './ModalEquipo'
import { ESTADOS_EQUIPO, SEDES, SECTORES } from '../constants'

const PAGE_SIZE = 15

function Equipos({ puedeEditar, sedeScoped, currentUserNombre, currentUserSede }) {
  const [equipos, setEquipos] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [filtros, setFiltros] = useState({ q: '', tipo: '', estado: '', sede: '', sector: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [equipoEditando, setEquipoEditando] = useState(null)
  const [modoSoloLectura, setModoSoloLectura] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => { cargarEquipos() }, [])
  useEffect(() => { aplicarFiltros() }, [equipos, filtros])

  async function cargarEquipos() {
    setLoading(true)
    let query = supabase.from('equipos').select('*').order('numero_inventario', { ascending: true })
    // Coordinador/Director solo ven su sede
    if (sedeScoped && currentUserSede) {
      query = query.eq('ubicacion', currentUserSede)
    }
    const { data } = await query
    setEquipos(data || [])
    setLoading(false)
  }

  function aplicarFiltros() {
    const { q, tipo, estado, sede, sector } = filtros
    const term = q.toLowerCase()
    const result = equipos.filter(e => {
      const mq = !term || [e.numero_inventario, e.id_red, e.marca, e.modelo, e.ubicacion, e.numero_serie, e.usuario, e.sector, e.procesador].some(v => v && v.toLowerCase().includes(term))
      return mq && (!tipo || e.tipo === tipo) && (!estado || e.estado === estado) && (!sede || e.ubicacion === sede) && (!sector || e.sector === sector)
    })
    setFiltered(result)
    setCurrentPage(1)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleSave(form) {
    const payload = {
      numero_inventario: form.numero_inventario || null,
      id_red: form.id_red || null,
      tipo: form.tipo,
      marca: form.marca || null,
      modelo: form.modelo || null,
      numero_serie: form.numero_serie || null,
      estado: form.estado || 'Activo',
      procesador: form.procesador || null,
      ram: form.ram || null,
      disco: form.disco || null,
      tipo_disco: form.tipo_disco || null,
      sistema_operativo: form.sistema_operativo || null,
      ubicacion: form.ubicacion || null,
      sector: form.sector || null,
      usuario: form.usuario || null,
      fecha_adquisicion: form.fecha_adquisicion || null,
      garantia_hasta: form.garantia_hasta || null,
      observaciones: form.observaciones || null,
    }

    if (!payload.tipo) {
      showToast('El tipo es obligatorio', 'error')
      return
    }

    let error
    if (equipoEditando) {
      const res = await supabase.from('equipos').update(payload).eq('id', equipoEditando.id)
      error = res.error
      if (!error) await supabase.from('movimientos').insert({
        equipo_id: equipoEditando.id,
        tipo_movimiento: 'Modificación',
        descripcion: `Equipo modificado: ${payload.numero_inventario}`,
        usuario: currentUserNombre || 'Sistema'
      })
    } else {
      const res = await supabase.from('equipos').insert(payload).select().single()
      error = res.error
      if (!error) await supabase.from('movimientos').insert({
        equipo_id: res.data.id,
        tipo_movimiento: 'Alta',
        descripcion: `Equipo dado de alta: ${payload.numero_inventario}`,
        usuario: currentUserNombre || 'Sistema'
      })
    }

    if (error) { showToast('Error: ' + error.message, 'error'); return }
    showToast(equipoEditando ? 'Equipo actualizado' : 'Equipo creado correctamente')
    setModalOpen(false)
    setEquipoEditando(null)
    cargarEquipos()
  }

  async function handleBaja(equipo) {
    if (!window.confirm(`¿Confirmar baja del equipo "${equipo.numero_inventario}"?`)) return
    const { error } = await supabase.from('equipos').update({ estado: 'De baja' }).eq('id', equipo.id)
    if (error) { showToast('Error al dar de baja', 'error'); return }
    await supabase.from('movimientos').insert({
      equipo_id: equipo.id,
      tipo_movimiento: 'Baja',
      descripcion: `Equipo dado de baja: ${equipo.numero_inventario}`,
      usuario: currentUserNombre || 'Sistema'
    })
    showToast('Equipo dado de baja')
    cargarEquipos()
  }

  const badgeEstado = (estado) => {
    const estilos = {
      'Activo': { bg: 'rgba(52,201,138,.15)', color: '#34c98a' },
      'En reparación': { bg: 'rgba(245,166,35,.15)', color: '#f5a623' },
      'Requiere atención': { bg: 'rgba(249,115,22,.15)', color: '#f97316' },
      'De baja': { bg: 'rgba(226,85,85,.15)', color: '#e25555' },
      'En depósito': { bg: 'rgba(155,109,255,.15)', color: '#9b6dff' },
      'Prestado': { bg: 'rgba(79,142,247,.15)', color: '#4f8ef7' },
    }
    const e = estilos[estado] || { bg: 'rgba(154,184,156,.15)', color: '#9ab89c' }
    return (
      <span style={{ background: e.bg, color: e.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' }}>
        {estado}
      </span>
    )
  }

  if (loading) return <div style={{ color: '#9ab89c' }}>Cargando...</div>

  const total = filtered.length
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1
  const start = (currentPage - 1) * PAGE_SIZE
  const pageData = filtered.slice(start, start + PAGE_SIZE)

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
            placeholder="Buscar por inventario, marca, usuario..."
            value={filtros.q}
            onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
            style={{ width: '100%', padding: '8px 12px 8px 34px', background: '#1c2e1e', border: '1px solid #2a3f2c', borderRadius: '6px', color: '#e8f0e8', fontSize: '13px', boxSizing: 'border-box' }}
          />
        </div>
        <select style={selectStyle} value={filtros.tipo} onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}>
          <option value="">Todos los tipos</option>
          {['PC', 'Notebook', 'Monitor', 'Impresora', 'Switch', 'UPS', 'Servidor', 'Otro'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={selectStyle} value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
          <option value="">Todos los estados</option>
          {ESTADOS_EQUIPO.map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={selectStyle} value={filtros.sector} onChange={e => setFiltros(f => ({ ...f, sector: e.target.value }))}>
          <option value="">Todos los sectores</option>
          {SECTORES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={selectStyle} value={filtros.sede} onChange={e => setFiltros(f => ({ ...f, sede: e.target.value }))}>
          <option value="">Todas las sedes</option>
          {SEDES.map(t => <option key={t}>{t}</option>)}
        </select>
        {/* Botón nuevo equipo — solo Admin y Coordinador */}
        {puedeEditar && (
          <button
            onClick={() => { setEquipoEditando(null); setModoSoloLectura(false); setModalOpen(true) }}
            style={{ marginLeft: 'auto', padding: '7px 14px', background: '#c8a44a', border: 'none', borderRadius: '6px', color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + Nuevo equipo
          </button>
        )}
      </div>

      {/* Tabla */}
      <div style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['N° Inventario', 'ID Red', 'Tipo', 'Marca / Modelo', 'Estado', 'Sede', 'Sector', 'Acciones'].map(h => (
                  <th key={h} style={{ background: '#1c2e1e', padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#c8a44a', textTransform: 'uppercase', letterSpacing: '.8px', borderBottom: '1px solid #2a3f2c', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.length ? pageData.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #2a3f2c' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      onClick={() => { setEquipoEditando(e); setModoSoloLectura(true); setModalOpen(true) }}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontFamily: 'monospace', fontSize: '12px', color: '#c8a44a', textDecoration: 'underline'
                      }}
                    >
                      {e.numero_inventario}
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '12px' }}>{e.id_red || '–'}</td>
                  <td style={{ padding: '10px 14px', color: '#e8f0e8', fontSize: '13px' }}>{e.tipo}</td>
                  <td style={{ padding: '10px 14px', color: '#e8f0e8', fontSize: '13px' }}>{[e.marca, e.modelo].filter(Boolean).join(' ') || '–'}</td>
                  <td style={{ padding: '10px 14px' }}>{badgeEstado(e.estado)}</td>
                  <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{e.ubicacion || '–'}</td>
                  <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{e.sector || '–'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      {puedeEditar && (
                        <button onClick={() => { setEquipoEditando(e); setModoSoloLectura(false); setModalOpen(true) }} style={btnStyle('#9ab89c')}>Editar</button>
                      )}
                      {puedeEditar && e.estado !== 'De baja' && (
                        <button onClick={() => handleBaja(e)} style={btnStyle('#e25555')}>Baja</button>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#5c7a5e' }}>
                    No se encontraron equipos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #2a3f2c' }}>
          <div style={{ fontSize: '12px', color: '#5c7a5e' }}>
            Mostrando {Math.min(start + 1, total)}–{Math.min(start + PAGE_SIZE, total)} de {total} equipos
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #3a5a3d', background: 'transparent', color: '#9ab89c', fontSize: '12px', cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1 }}>←</button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #3a5a3d', background: 'transparent', color: '#9ab89c', fontSize: '12px', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.4 : 1 }}>→</button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <ModalEquipo
          equipo={equipoEditando}
          readOnly={!puedeEditar || modoSoloLectura}
          onClose={() => { setModalOpen(false); setEquipoEditando(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

export default Equipos