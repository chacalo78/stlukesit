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

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement)

const COLORS = ['#c8a44a', '#34c98a', '#4f8ef7', '#e25555', '#9b6dff', '#f5a623', '#5dcaa5', '#d85a30']

const chartOptions = {
  plugins: {
    legend: { labels: { color: '#9ab89c', font: { size: 11 } } },
    tooltip: { backgroundColor: '#1c2e1e', titleColor: '#c8a44a', bodyColor: '#e8f0e8', borderColor: '#3a5a3d', borderWidth: 1 }
  }
}

function Reportes() {
  const [equipos, setEquipos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function cargarDatos() {
      const { data } = await supabase.from('equipos').select('*')
      setEquipos((data || []).filter(e => e.estado !== 'De baja'))
      setLoading(false)
    }
    cargarDatos()
  }, [])

  if (loading) return <div style={{ color: '#9ab89c' }}>Cargando...</div>

  // Por tipo
  const tipos = {}
  equipos.forEach(e => { tipos[e.tipo] = (tipos[e.tipo] || 0) + 1 })

  // Por estado
  const estados = { 'Activo': 0, 'En reparación': 0, 'Requiere atención': 0, 'En depósito': 0 }
  equipos.forEach(e => { if (estados[e.estado] !== undefined) estados[e.estado]++ })

  // Por sede
  const sedes = {}
  equipos.forEach(e => { const s = e.ubicacion || 'Sin sede'; sedes[s] = (sedes[s] || 0) + 1 })

  // Por sector top 10
  const sectores = {}
  equipos.forEach(e => { if (e.sector) sectores[e.sector] = (sectores[e.sector] || 0) + 1 })
  const sectTop = Object.entries(sectores).sort((a, b) => b[1] - a[1]).slice(0, 10)

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

  return (
    <div>
      {/* Cards por sede */}
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

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Distribución por tipo</div>
          <div style={{ height: '240px', position: 'relative' }}>
            <Doughnut
              data={{ labels: Object.keys(tipos), datasets: [{ data: Object.values(tipos), backgroundColor: COLORS, borderColor: '#1c2e1e', borderWidth: 2 }] }}
              options={{ ...chartOptions, cutout: '60%', maintainAspectRatio: false }}
            />
          </div>
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>Distribución por estado</div>
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
        <div style={titleStyle}>Equipos por sector (top 10)</div>
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