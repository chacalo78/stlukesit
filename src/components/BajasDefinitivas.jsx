import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import ModalEquipo from './ModalEquipo'
import { TIPOS_EQUIPO, SEDES, SECTORES, identificarEquipo } from '../constants'

const PAGE_SIZE = 15

function BajasDefinitivas({ currentUserNombre }) {
  const [equipos, setEquipos] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [filtros, setFiltros] = useState({ q: '', tipo: '', sede: '', sector: '' })
  const [equipoVer, setEquipoVer] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { cargarEquipos() }, [])
  useEffect(() => { aplicarFiltros() }, [equipos, filtros])

  async function cargarEquipos() {
    setLoading(true)
    const { data } = await supabase
      .from('equipos')
      .select('*')
      .eq('estado', 'Baja Definitiva')
      .order('fecha_baja_definitiva', { ascending: false })
    setEquipos(data || [])
    setLoading(false)
  }

  function aplicarFiltros() {
    const { q, tipo, sede, sector } = filtros
    const term = q.toLowerCase()
    const result = equipos.filter(e => {
      const mq = !term || [e.numero_inventario, e.id_red, e.marca, e.modelo, e.ubicacion, e.numero_serie, e.usuario, e.sector].some(v => v && v.toLowerCase().includes(term))
      return mq && (!tipo || e.tipo === tipo) && (!sede || e.ubicacion === sede) && (!sector || e.sector === sector)
    })
    setFiltered(result)
    setCurrentPage(1)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleRestaurar(equipo) {
    if (!window.confirm(`¿Restaurar el equipo "${identificarEquipo(equipo)}"? Vuelve a estado "Activo" y reaparece en Equipos, Dashboard y Reportes.`)) return

    const { error } = await supabase.from('equipos').update({ estado: 'Activo' }).eq('id', equipo.id)
    if (error) { showToast('Error al restaurar: ' + error.message, 'error'); return }

    await supabase.from('movimientos').insert({
      equipo_id: equipo.id,
      tipo_movimiento: 'Modificación',
      descripcion: `Equipo restaurado desde Bajas Definitivas: ${identificarEquipo(equipo)}`,
      usuario: currentUserNombre || 'Sistema'
    })
    showToast('Equipo restaurado')
    cargarEquipos()
  }

  const formatFecha = (d) => {
    if (!d) return '–'
    return new Date(d).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
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

      <div style={{
        marginBottom: '18px', padding: '10px 14px', background: 'rgba(226,85,85,.08)',
        border: '1px solid rgba(226,85,85,.25)', borderRadius: '8px', fontSize: '12px', color: '#e25555'
      }}>
        Equipos dados de baja definitiva. No aparecen en Equipos, Dashboard, Reportes ni Préstamos.
      </div>

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
          {TIPOS_EQUIPO.map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={selectStyle} value={filtros.sector} onChange={e => setFiltros(f => ({ ...f, sector: e.target.value }))}>
          <option value="">Todos los sectores</option>
          {SECTORES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select style={selectStyle} value={filtros.sede} onChange={e => setFiltros(f => ({ ...f, sede: e.target.value }))}>
          <option value="">Todas las sedes</option>
          {SEDES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['N° Inventario', 'Tipo', 'Marca / Modelo', 'Sede', 'Sector', 'Fecha de baja', 'Dado de baja por', 'Acciones'].map(h => (
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
                      onClick={() => setEquipoVer(e)}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontFamily: 'monospace', fontSize: '12px', color: '#c8a44a', textDecoration: 'underline'
                      }}
                    >
                      {e.numero_inventario || identificarEquipo(e)}
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#e8f0e8', fontSize: '13px' }}>{e.tipo}</td>
                  <td style={{ padding: '10px 14px', color: '#e8f0e8', fontSize: '13px' }}>{[e.marca, e.modelo].filter(Boolean).join(' ') || '–'}</td>
                  <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{e.ubicacion || '–'}</td>
                  <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{e.sector || '–'}</td>
                  <td style={{ padding: '10px 14px', color: '#5c7a5e', fontSize: '12px' }}>{formatFecha(e.fecha_baja_definitiva)}</td>
                  <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '12px' }}>{e.dado_de_baja_definitiva_por || '–'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={() => setEquipoVer(e)} style={btnStyle('#9ab89c')}>Ver ficha</button>
                      <button onClick={() => handleRestaurar(e)} style={btnStyle('#34c98a')}>Restaurar</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#5c7a5e' }}>
                    No hay equipos dados de baja definitiva
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

      {equipoVer && (
        <ModalEquipo equipo={equipoVer} readOnly onClose={() => setEquipoVer(null)} onSave={() => {}} />
      )}
    </div>
  )
}

export default BajasDefinitivas
