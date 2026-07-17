import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import ModalEquipo from './ModalEquipo'
import { TIPOS_REPORTABLES } from '../constants'

function Dashboard({ sedeScoped, currentUserSede }) {
  const [equipos, setEquipos] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [todosMovimientos, setTodosMovimientos] = useState([])
  const [prestamosActivos, setPrestamosActivos] = useState([])
  const [loading, setLoading] = useState(true)
  const [equipoVer, setEquipoVer] = useState(null)

  useEffect(() => {
    async function cargarDatos() {
      const restringirSede = sedeScoped && currentUserSede

      let equiposQuery = supabase.from('equipos').select('*')
      if (restringirSede) equiposQuery = equiposQuery.eq('ubicacion', currentUserSede)
      const { data: equiposData } = await equiposQuery

      // Traemos un set amplio de movimientos: sirve tanto para "Últimos
      // movimientos" (los primeros 5) como para calcular hace cuánto
      // cada equipo pasó a "Requiere atención".
      const { data: allMovsData } = await supabase
        .from('movimientos')
        .select('*, equipos(ubicacion)')
        .order('fecha', { ascending: false })
        .limit(500)
      const movsFiltrados = restringirSede
        ? (allMovsData || []).filter(m => m.equipos?.ubicacion === currentUserSede)
        : (allMovsData || [])

      const { data: prestamosData } = await supabase
        .from('prestamos')
        .select('*, equipos(ubicacion)')
        .is('fecha_devolucion_real', null)
      const prestamosFiltrados = restringirSede
        ? (prestamosData || []).filter(p => p.equipos?.ubicacion === currentUserSede)
        : (prestamosData || [])

      setEquipos((equiposData || []).filter(e => TIPOS_REPORTABLES.includes(e.tipo)))
      setMovimientos(movsFiltrados.slice(0, 5))
      setTodosMovimientos(movsFiltrados)
      setPrestamosActivos(prestamosFiltrados)
      setLoading(false)
    }
    cargarDatos()
  }, [sedeScoped, currentUserSede])

  if (loading) return <div style={{ color: '#9ab89c' }}>Cargando...</div>

  const total = equipos.length
  const activos = equipos.filter(e => e.estado === 'Activo').length
  const enReparacion = equipos.filter(e => e.estado === 'En reparación').length
  const deBajaList = equipos.filter(e => e.estado === 'De baja')
  const deBaja = deBajaList.length
  const enDepositoList = equipos.filter(e => e.estado === 'En depósito')
  const enDeposito = enDepositoList.length
  const requiereAtencionList = equipos.filter(e => e.estado === 'Requiere atención')
  const requiereAtencion = requiereAtencionList.length
  const hoy = new Date().toISOString().slice(0, 10)
  const prestamosVencidosList = prestamosActivos.filter(p => p.fecha_devolucion_estimada < hoy)
  const prestamosVencidos = prestamosVencidosList.length

  const stats = [
    { label: 'Total equipos', value: total, color: '#c8a44a' },
    { label: 'Activos', value: activos, color: '#34c98a' },
    { label: 'En reparación', value: enReparacion, color: '#f5a623' },
    { label: 'De baja', value: deBaja, color: '#e25555' },
    { label: 'En depósito', value: enDeposito, color: '#9b6dff' },
    { label: 'Requiere atención', value: requiereAtencion, color: '#f97316' },
    { label: 'Préstamos vencidos', value: prestamosVencidos, color: '#e25555' },
  ]

  const badgeMovimiento = (tipo) => {
    const colores = {
      'Alta': { bg: 'rgba(52,201,138,.15)', color: '#34c98a' },
      'Baja': { bg: 'rgba(226,85,85,.15)', color: '#e25555' },
      'Modificación': { bg: 'rgba(200,164,74,.15)', color: '#c8a44a' },
      'Traslado': { bg: 'rgba(245,166,35,.15)', color: '#f5a623' },
      'Préstamo': { bg: 'rgba(79,142,247,.15)', color: '#4f8ef7' },
      'Devolución': { bg: 'rgba(52,201,138,.15)', color: '#34c98a' },
      'Alta usuario': { bg: 'rgba(52,201,138,.15)', color: '#34c98a' },
      'Modificación usuario': { bg: 'rgba(200,164,74,.15)', color: '#c8a44a' },
      'Baja usuario': { bg: 'rgba(226,85,85,.15)', color: '#e25555' },
      'Inhabilitado': { bg: 'rgba(245,166,35,.15)', color: '#f5a623' },
      'Habilitado': { bg: 'rgba(52,201,138,.15)', color: '#34c98a' },
      'Restablecimiento de contraseña': { bg: 'rgba(79,142,247,.15)', color: '#4f8ef7' },
    }
    const c = colores[tipo] || { bg: 'rgba(154,184,156,.15)', color: '#9ab89c' }
    return (
      <span style={{
        background: c.bg,
        color: c.color,
        padding: '2px 8px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: '500'
      }}>
        {tipo}
      </span>
    )
  }

  const formatDate = (d) => {
    if (!d) return '–'
    return new Date(d).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  // Calcula hace cuánto tiempo, en formato legible (ej "5 días", "2 meses")
  const tiempoTranscurrido = (fecha) => {
    if (!fecha) return '–'
    const ahora = new Date()
    const inicio = new Date(fecha)
    const diffMs = ahora - inicio
    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (dias < 1) return 'Hoy'
    if (dias === 1) return '1 día'
    if (dias < 30) return `${dias} días`
    const meses = Math.floor(dias / 30)
    if (meses === 1) return '1 mes'
    if (meses < 12) return `${meses} meses`
    const años = Math.floor(meses / 12)
    return años === 1 ? '1 año' : `${años} años`
  }

  // Devuelve cuántos días pasaron desde una fecha
  const diasDesde = (fecha) => {
    if (!fecha) return 0
    const diffMs = new Date() - new Date(fecha)
    return Math.floor(diffMs / (1000 * 60 * 60 * 24))
  }

  // Para cada equipo, buscamos el movimiento más reciente que lo haya
  // dejado en "Requiere atención" (texto en la descripción del cambio de estado)
  function fechaDesdeRequiereAtencion(equipo) {
    const movEquipo = todosMovimientos
      .filter(m => m.equipo_id === equipo.id)
      .find(m => m.descripcion && m.descripcion.includes('Requiere atención'))
    return movEquipo ? movEquipo.fecha : equipo.updated_at
  }

  const requiereAtencionConFecha = requiereAtencionList
    .map(e => ({ ...e, fechaDesde: fechaDesdeRequiereAtencion(e) }))
    .sort((a, b) => new Date(a.fechaDesde) - new Date(b.fechaDesde)) // más antiguos primero
    .slice(0, 5)

  // Equipos por tipo
  const tipos = {}
  equipos.forEach(e => { tipos[e.tipo] = (tipos[e.tipo] || 0) + 1 })
  const tiposRows = Object.entries(tipos).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // --- Generación de sugerencias inteligentes ---

  function cpuEsAntiguo(proc) {
    if (!proc) return false
    const p = proc.toLowerCase()
    if (p.includes('celeron') || p.includes('pentium') || p.includes('atom')) return true
    if (p.includes('core 2') || p.includes('core2')) return true
    const m = p.match(/i[3579][- ](\d+)/)
    if (m && m[1].length >= 4) {
      const gen = parseInt(m[1].substring(0, 2))
      return gen < 8 // anterior a 2017 aprox
    }
    return false
  }

  const sugerencias = []

  // 1. Equipos "De baja" hace mucho sin resolución final
  const deBajaAntiguos = deBajaList.filter(e => diasDesde(e.updated_at) > 60)
  if (deBajaAntiguos.length > 0) {
    sugerencias.push({
      icono: '🗑️',
      color: '#e25555',
      titulo: `${deBajaAntiguos.length} equipo${deBajaAntiguos.length > 1 ? 's' : ''} dado${deBajaAntiguos.length > 1 ? 's' : ''} de baja hace más de 60 días`,
      detalle: 'Considerá definir su destino final: donación, descarte responsable o venta, para liberar espacio físico y de inventario.'
    })
  }

  // 2. Equipos "En depósito" hace mucho sin reasignar
  const enDepositoAntiguos = enDepositoList.filter(e => diasDesde(e.updated_at) > 45)
  if (enDepositoAntiguos.length > 0) {
    sugerencias.push({
      icono: '📦',
      color: '#9b6dff',
      titulo: `${enDepositoAntiguos.length} equipo${enDepositoAntiguos.length > 1 ? 's' : ''} en depósito hace más de 45 días`,
      detalle: 'Evaluá si pueden reasignarse a algún sector que los necesite, en lugar de seguir almacenados sin uso.'
    })
  }

  // 3. Equipos "Requiere atención" muy antiguos
  const requiereAtencionCriticos = requiereAtencionConFecha.filter(e => diasDesde(e.fechaDesde) > 14)
  if (requiereAtencionCriticos.length > 0) {
    sugerencias.push({
      icono: '⚠️',
      color: '#f97316',
      titulo: `${requiereAtencionCriticos.length} equipo${requiereAtencionCriticos.length > 1 ? 's' : ''} en "Requiere atención" hace más de 2 semanas`,
      detalle: 'Estos casos llevan tiempo sin resolverse. Priorizá su revisión antes que los más recientes.'
    })
  }
  // 4. Préstamos vencidos (fecha de devolución estimada ya pasó)
  if (prestamosVencidos > 0) {
    sugerencias.push({
      icono: '⏰',
      color: '#e25555',
      titulo: `${prestamosVencidos} préstamo${prestamosVencidos > 1 ? 's' : ''} vencido${prestamosVencidos > 1 ? 's' : ''}`,
      detalle: 'Hay equipos prestados cuya fecha de devolución estimada ya pasó. Revisá la sección Préstamos para hacer seguimiento.'
    })
  }

  // 5. Equipos con datos incompletos (ficha técnica sin completar)
  const datosIncompletos = equipos.filter(e =>
    (e.tipo === 'Desktop' || e.tipo === 'Notebook') &&
    e.estado !== 'De baja' &&
    (!e.procesador || !e.ram || !e.disco || !e.ubicacion)
  )
  if (datosIncompletos.length > 0) {
    sugerencias.push({
      icono: '📋',
      color: '#4f8ef7',
      titulo: `${datosIncompletos.length} equipo${datosIncompletos.length > 1 ? 's' : ''} con ficha técnica incompleta`,
      detalle: 'Faltan datos como procesador, RAM, disco o sede. Completarlos mejora la calidad de los reportes.'
    })
  }

  // 6. Equipos sin número de inventario (sin identificación física)
  const sinIdentificacion = equipos.filter(e => !e.numero_inventario && e.estado !== 'De baja')
  if (sinIdentificacion.length > 0) {
    sugerencias.push({
      icono: '🏷️',
      color: '#c8a44a',
      titulo: `${sinIdentificacion.length} equipo${sinIdentificacion.length > 1 ? 's' : ''} sin número de inventario`,
      detalle: 'No tienen un identificador asignado. Etiquetarlos facilita su seguimiento y evita confusiones con equipos similares.'
    })
  }

  return (
    <div>
      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: '#172019',
            border: '1px solid #2a3f2c',
            borderRadius: '10px',
            padding: '16px 18px'
          }}>
            <div style={{
              fontSize: '11px',
              color: '#5c7a5e',
              textTransform: 'uppercase',
              letterSpacing: '.8px',
              marginBottom: '6px'
            }}>
              {s.label}
            </div>
            <div style={{ fontSize: '28px', fontWeight: '700', lineHeight: 1, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Equipos que requieren atención */}
      {requiereAtencionConFecha.length > 0 && (
        <div style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '600', borderBottom: '1px solid #2a3f2c', color: '#f97316' }}>
            ⚠️ Equipos que requieren atención — más antiguos primero
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['N° Inventario', 'Tipo', 'Sede', 'Usuario', 'Hace'].map(h => (
                  <th key={h} style={{ background: '#1c2e1e', padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#c8a44a', textTransform: 'uppercase', letterSpacing: '.8px', borderBottom: '1px solid #2a3f2c', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requiereAtencionConFecha.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #2a3f2c' }}>
                  <td style={{ padding: '8px 14px' }}>
                    <button
                      onClick={() => setEquipoVer(e)}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontFamily: 'monospace', fontSize: '12px', color: '#c8a44a', textDecoration: 'underline'
                      }}
                    >
                      {e.numero_inventario}
                    </button>
                  </td>
                  <td style={{ padding: '8px 14px', color: '#e8f0e8', fontSize: '13px' }}>{e.tipo}</td>
                  <td style={{ padding: '8px 14px', color: '#9ab89c', fontSize: '13px' }}>{e.ubicacion || '–'}</td>
                  <td style={{ padding: '8px 14px', color: '#9ab89c', fontSize: '13px' }}>{e.usuario || '–'}</td>
                  <td style={{ padding: '8px 14px' }}>
                    <span style={{
                      background: 'rgba(249,115,22,.15)', color: '#f97316',
                      padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500'
                    }}>
                      {tiempoTranscurrido(e.fechaDesde)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tablas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* Equipos por tipo */}
        <div style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '600', borderBottom: '1px solid #2a3f2c', color: '#c8a44a' }}>
            Equipos por tipo
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {tiposRows.map(([nombre, cantidad]) => (
                <tr key={nombre} style={{ borderBottom: '1px solid #2a3f2c' }}>
                  <td style={{ padding: '8px 14px', color: '#e8f0e8', fontSize: '13px' }}>{nombre}</td>
                  <td style={{ padding: '8px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1, background: '#1c2e1e', borderRadius: '4px', height: '6px' }}>
                        <div style={{ width: `${total ? Math.round(cantidad / total * 100) : 0}%`, background: '#c8a44a', height: '6px', borderRadius: '4px' }} />
                      </div>
                      <span style={{ color: '#9ab89c', fontSize: '12px', minWidth: '24px', textAlign: 'right' }}>{cantidad}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Últimos movimientos */}
        <div style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '600', borderBottom: '1px solid #2a3f2c', color: '#c8a44a' }}>
            Últimos movimientos
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {movimientos.length ? movimientos.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #2a3f2c' }}>
                  <td style={{ padding: '8px 14px' }}>{badgeMovimiento(m.tipo_movimiento)}</td>
                  <td style={{ padding: '8px 14px', color: '#9ab89c', fontSize: '12px' }}>{m.descripcion || '–'}</td>
                  <td style={{ padding: '8px 14px', color: '#5c7a5e', fontSize: '12px' }}>{formatDate(m.fecha)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: '#5c7a5e' }}>
                    Sin movimientos aún
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Sugerencias inteligentes */}
      {sugerencias.length > 0 && (
        <div style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', fontSize: '13px', fontWeight: '600', borderBottom: '1px solid #2a3f2c', color: '#c8a44a' }}>
            💡 Sugerencias
          </div>
          <div style={{ padding: '4px 0' }}>
            {sugerencias.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '14px 16px',
                  borderBottom: i < sugerencias.length - 1 ? '1px solid #2a3f2c' : 'none'
                }}
              >
                <div style={{ fontSize: '20px', flexShrink: 0, lineHeight: 1 }}>{s.icono}</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: s.color, marginBottom: '3px' }}>
                    {s.titulo}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ab89c' }}>
                    {s.detalle}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {equipoVer && (
        <ModalEquipo equipo={equipoVer} readOnly onClose={() => setEquipoVer(null)} onSave={() => {}} />
      )}

    </div>
  )
}

export default Dashboard
