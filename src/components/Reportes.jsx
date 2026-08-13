import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { Doughnut, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement
} from 'chart.js'
import { TIPOS_REPORTABLES, SEDES } from '../constants'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

const COLORS = ['#c8a44a', '#34c98a', '#4f8ef7', '#e25555', '#9b6dff', '#f5a623', '#5dcaa5', '#d85a30']

const chartOptions = {
  plugins: {
    legend: { labels: { color: '#9ab89c', font: { size: 11 } } },
    tooltip: { backgroundColor: '#1c2e1e', titleColor: '#c8a44a', bodyColor: '#e8f0e8', borderColor: '#3a5a3d', borderWidth: 1 }
  }
}

function Reportes({ sedeScoped, currentUserSede }) {
  const [equipos, setEquipos] = useState([])
  const [loading, setLoading] = useState(true)
  // null = pantalla de selección de sede (solo para roles no acotados a
  // una sede); '' = "Todas las sedes" (vista combinada, lo que antes era
  // el default); nombre de sede = vista de esa sede sola. Coordinador/
  // Director no eligen: arrancan directo en '' (su única sede real).
  const [vistaSede, setVistaSede] = useState(() => sedeScoped ? '' : null)

  useEffect(() => {
    async function cargarDatos() {
      let query = supabase.from('equipos').select('*').neq('estado', 'Baja Definitiva')
      if (sedeScoped && currentUserSede) query = query.eq('ubicacion', currentUserSede)
      const { data } = await query
      setEquipos((data || []).filter(e => e.estado !== 'De baja' && TIPOS_REPORTABLES.includes(e.tipo)))
      setLoading(false)
    }
    cargarDatos()
  }, [sedeScoped, currentUserSede])

  if (loading) return <div style={{ color: '#9ab89c' }}>Cargando...</div>

  // Por sede (siempre sobre el total, para el resumen y los botones)
  const sedes = {}
  equipos.forEach(e => { const s = e.ubicacion || 'Sin sede'; sedes[s] = (sedes[s] || 0) + 1 })

  const cardStyle = {
    background: '#172019',
    border: '1px solid #2a3f2c',
    borderRadius: '10px',
    padding: '20px'
  }

  const titleStyle = {
    fontSize: '12px',
    color: '#5c7a5e',
    textTransform: 'uppercase',
    letterSpacing: '.8px',
    fontWeight: '600',
    marginBottom: '16px'
  }

  const resumenPorSede = (
    <div style={{ marginBottom: '24px' }}>
      <div style={titleStyle}>Resumen por sede</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        {Object.entries(sedes).map(([sede, total]) => {
          const activos = equipos.filter(e => (e.ubicacion || 'Sin sede') === sede && e.estado === 'Activo').length
          const repos = equipos.filter(e => (e.ubicacion || 'Sin sede') === sede && e.estado === 'En reparación').length
          return (
            <div key={sede} style={cardStyle}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#c8a44a', marginBottom: '12px', borderBottom: '1px solid #2a3f2c', paddingBottom: '8px' }}>{sede}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#5c7a5e', fontSize: '12px' }}>Total</span>
                <span style={{ fontWeight: '700', color: '#e8f0e8' }}>{total}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: '#5c7a5e', fontSize: '12px' }}>Activos</span>
                <span style={{ color: '#34c98a', fontWeight: '600' }}>{activos}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#5c7a5e', fontSize: '12px' }}>En reparación</span>
                <span style={{ color: '#f5a623', fontWeight: '600' }}>{repos}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  // Pantalla de entrada: elegir sede antes de ver los gráficos
  if (vistaSede === null) {
    const sedeBtnStyle = {
      flex: '1 1 200px',
      padding: '20px 18px',
      background: '#172019',
      border: '1px solid #2a3f2c',
      borderRadius: '10px',
      color: '#e8f0e8',
      cursor: 'pointer',
      textAlign: 'left'
    }
    return (
      <div>
        <div style={titleStyle}>Seleccioná una sede para ver sus gráficos</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '28px' }}>
          {SEDES.map(s => (
            <button key={s} onClick={() => setVistaSede(s)} style={sedeBtnStyle}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#c8a44a', marginBottom: '4px' }}>{s}</div>
              <div style={{ fontSize: '12px', color: '#5c7a5e' }}>{sedes[s] || 0} equipos</div>
            </button>
          ))}
          <button onClick={() => setVistaSede('')} style={sedeBtnStyle}>
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#c8a44a', marginBottom: '4px' }}>Todas las sedes</div>
            <div style={{ fontSize: '12px', color: '#5c7a5e' }}>{equipos.length} equipos</div>
          </button>
        </div>
        {resumenPorSede}
      </div>
    )
  }

  // A partir de acá, vistaSede es '' (todas) o el nombre de una sede puntual
  const filtroSede = vistaSede
  const equiposFiltrados = filtroSede ? equipos.filter(e => e.ubicacion === filtroSede) : equipos

  // Por tipo
  const tipos = {}
  equiposFiltrados.forEach(e => { tipos[e.tipo] = (tipos[e.tipo] || 0) + 1 })

  // Por estado
  const estados = { 'Activo': 0, 'En reparación': 0, 'Requiere atención': 0, 'En depósito': 0, 'Prestado': 0 }
  equiposFiltrados.forEach(e => { if (estados[e.estado] !== undefined) estados[e.estado]++ })

  // Por sector top 10
  const sectores = {}
  equiposFiltrados.forEach(e => { if (e.sector) sectores[e.sector] = (sectores[e.sector] || 0) + 1 })
  const sectTop = Object.entries(sectores).sort((a, b) => b[1] - a[1]).slice(0, 10)

  return (
    <div>
      {/* Volver a elegir sede */}
      {!sedeScoped && (
        <div style={{ marginBottom: '18px' }}>
          <button
            onClick={() => setVistaSede(null)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9ab89c', fontSize: '13px' }}
          >
            ← Volver a selección de sede
          </button>
        </div>
      )}

      {/* El resumen por sede solo aporta en la vista combinada; en una sede puntual es redundante */}
      {filtroSede === '' && resumenPorSede}

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Distribución por tipo{filtroSede ? ` — ${filtroSede}` : ''}</div>
          <div style={{ height: '240px', position: 'relative' }}>
            <Doughnut
              data={{ labels: Object.keys(tipos), datasets: [{ data: Object.values(tipos), backgroundColor: COLORS, borderColor: '#1c2e1e', borderWidth: 2 }] }}
              options={{ ...chartOptions, cutout: '60%', maintainAspectRatio: false }}
            />
          </div>
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>Distribución por estado{filtroSede ? ` — ${filtroSede}` : ''}</div>
          <div style={{ height: '240px', position: 'relative' }}>
            <Doughnut
              data={{ labels: Object.keys(estados), datasets: [{ data: Object.values(estados), backgroundColor: ['#34c98a', '#f5a623', '#f97316', '#9b6dff'], borderColor: '#1c2e1e', borderWidth: 2 }] }}
              options={{ ...chartOptions, cutout: '60%', maintainAspectRatio: false }}
            />
          </div>
        </div>
      </div>

      {/* Gráfico por sector */}
      <div style={{ ...cardStyle, marginBottom: '16px' }}>
        <div style={titleStyle}>Equipos por sector (top 10){filtroSede ? ` — ${filtroSede}` : ''}</div>
        <div style={{ height: '280px', position: 'relative' }}>
          <Bar
            data={{ labels: sectTop.map(([s]) => s), datasets: [{ data: sectTop.map(([, n]) => n), backgroundColor: 'rgba(200,164,74,0.7)', borderColor: '#c8a44a', borderWidth: 1, borderRadius: 4 }] }}
            options={{
              ...chartOptions,
              indexAxis: 'y',
              maintainAspectRatio: false,
              plugins: { ...chartOptions.plugins, legend: { display: false } },
              scales: {
                x: { ticks: { color: '#5c7a5e' }, grid: { color: 'rgba(58,90,61,0.3)' } },
                y: { ticks: { color: '#9ab89c' }, grid: { display: false } }
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default Reportes
