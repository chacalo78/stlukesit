import { useEffect, useRef, useState } from 'react'
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

// Paleta del sitio, en hex sin '#' (formato que pide pptxgenjs)
const PPTX = {
  bg: '0F1A10',
  card: '172019',
  border: '2A3F2C',
  gold: 'C8A44A',
  text: 'E8F0E8',
  muted: '9AB89C',
  verde: '34C98A',
  naranja: 'F5A623',
}

const chartOptions = {
  plugins: {
    legend: { labels: { color: '#9ab89c', font: { size: 11 } } },
    tooltip: { backgroundColor: '#1c2e1e', titleColor: '#c8a44a', bodyColor: '#e8f0e8', borderColor: '#3a5a3d', borderWidth: 1 }
  }
}

function Reportes({ sedeScoped, currentUserSede }) {
  const [equipos, setEquipos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroSede, setFiltroSede] = useState('')
  const [generandoPptx, setGenerandoPptx] = useState(false)
  const chartTipoRef = useRef(null)
  const chartEstadoRef = useRef(null)
  const chartSectorRef = useRef(null)

  useEffect(() => {
    async function cargarDatos() {
      let query = supabase.from('equipos').select('*')
      if (sedeScoped && currentUserSede) query = query.eq('ubicacion', currentUserSede)
      const { data } = await query
      setEquipos((data || []).filter(e => e.estado !== 'De baja' && TIPOS_REPORTABLES.includes(e.tipo)))
      setLoading(false)
    }
    cargarDatos()
  }, [sedeScoped, currentUserSede])

  if (loading) return <div style={{ color: '#9ab89c' }}>Cargando...</div>

  // Por sede (siempre sobre el total, para el resumen)
  const sedes = {}
  equipos.forEach(e => { const s = e.ubicacion || 'Sin sede'; sedes[s] = (sedes[s] || 0) + 1 })

  // Los gráficos de abajo se filtran por la sede elegida (si hay una)
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

  async function descargarPptx() {
    setGenerandoPptx(true)
    try {
      const { default: pptxgen } = await import('pptxgenjs')
      const logoResp = await fetch(`${import.meta.env.BASE_URL}logo.png`)
      const logoBlob = await logoResp.blob()
      const logoBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(logoBlob)
      })

      const pptx = new pptxgen()
      pptx.defineLayout({ name: 'STLUKES', width: 10, height: 5.63 })
      pptx.layout = 'STLUKES'

      const sufijo = filtroSede ? ` — ${filtroSede}` : ' — Todas las sedes'

      // Portada
      const portada = pptx.addSlide()
      portada.background = { color: PPTX.bg }
      portada.addImage({ data: logoBase64, x: 4.25, y: 0.75, w: 1.5, h: 1.5 })
      portada.addText("St. Luke's College", { x: 0, y: 2.5, w: '100%', align: 'center', fontSize: 28, bold: true, color: PPTX.gold, fontFace: 'Arial' })
      portada.addText('Reporte de Inventario de Equipos', { x: 0, y: 3.15, w: '100%', align: 'center', fontSize: 16, color: PPTX.text, fontFace: 'Arial' })
      portada.addText(filtroSede || 'Todas las sedes', { x: 0, y: 3.65, w: '100%', align: 'center', fontSize: 13, color: PPTX.muted, fontFace: 'Arial' })
      portada.addText(new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }), { x: 0, y: 5.0, w: '100%', align: 'center', fontSize: 10, color: PPTX.muted, fontFace: 'Arial' })

      // Resumen por sede
      const resumen = pptx.addSlide()
      resumen.background = { color: PPTX.bg }
      resumen.addText('Resumen por sede', { x: 0.4, y: 0.3, fontSize: 20, bold: true, color: PPTX.gold, fontFace: 'Arial' })
      const filas = [
        [
          { text: 'Sede', options: { bold: true, color: PPTX.gold, fill: PPTX.card } },
          { text: 'Total', options: { bold: true, color: PPTX.gold, fill: PPTX.card } },
          { text: 'Activos', options: { bold: true, color: PPTX.gold, fill: PPTX.card } },
          { text: 'En reparación', options: { bold: true, color: PPTX.gold, fill: PPTX.card } },
        ]
      ]
      Object.entries(sedes).forEach(([sede, total]) => {
        const activos = equipos.filter(e => (e.ubicacion || 'Sin sede') === sede && e.estado === 'Activo').length
        const repos = equipos.filter(e => (e.ubicacion || 'Sin sede') === sede && e.estado === 'En reparación').length
        filas.push([
          { text: sede, options: { color: PPTX.text, fill: PPTX.card } },
          { text: String(total), options: { color: PPTX.text, fill: PPTX.card } },
          { text: String(activos), options: { color: PPTX.verde, fill: PPTX.card } },
          { text: String(repos), options: { color: PPTX.naranja, fill: PPTX.card } },
        ])
      })
      resumen.addTable(filas, {
        x: 0.4, y: 0.9, w: 9.2, fontSize: 12, fontFace: 'Arial',
        border: { type: 'solid', color: PPTX.border, pt: 1 },
        autoPage: false
      })

      // Un slide por gráfico
      function agregarSlideGrafico(titulo, chartRef) {
        if (!chartRef.current) return
        const slide = pptx.addSlide()
        slide.background = { color: PPTX.bg }
        slide.addText(titulo, { x: 0.4, y: 0.3, fontSize: 20, bold: true, color: PPTX.gold, fontFace: 'Arial' })
        slide.addImage({ data: chartRef.current.toBase64Image(), x: 1.5, y: 0.9, w: 7, h: 4.3 })
      }
      agregarSlideGrafico(`Distribución por tipo${sufijo}`, chartTipoRef)
      agregarSlideGrafico(`Distribución por estado${sufijo}`, chartEstadoRef)
      agregarSlideGrafico(`Equipos por sector (top 10)${sufijo}`, chartSectorRef)

      await pptx.writeFile({ fileName: `Reporte-Equipos-StLukes-${new Date().toISOString().slice(0, 10)}.pptx` })
    } finally {
      setGenerandoPptx(false)
    }
  }

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
      {/* Descargar PowerPoint */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '18px' }}>
        <button
          onClick={descargarPptx}
          disabled={generandoPptx}
          style={{
            padding: '8px 16px', background: generandoPptx ? '#5c7a5e' : '#c8a44a', border: 'none', borderRadius: '6px',
            color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: generandoPptx ? 'default' : 'pointer'
          }}
        >
          {generandoPptx ? 'Generando...' : '📊 Descargar PowerPoint'}
        </button>
      </div>

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

      {/* Filtro de sede para los gráficos */}
      {!sedeScoped && (
        <div style={{ marginBottom: '16px' }}>
          <select
            value={filtroSede}
            onChange={e => setFiltroSede(e.target.value)}
            style={{
              padding: '8px 10px',
              background: '#1c2e1e',
              border: '1px solid #2a3f2c',
              borderRadius: '6px',
              color: '#e8f0e8',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <option value="">Todas las sedes</option>
            {SEDES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div style={cardStyle}>
          <div style={titleStyle}>Distribución por tipo{filtroSede ? ` — ${filtroSede}` : ''}</div>
          <div style={{ height: '240px', position: 'relative' }}>
            <Doughnut
              ref={chartTipoRef}
              data={{ labels: Object.keys(tipos), datasets: [{ data: Object.values(tipos), backgroundColor: COLORS, borderColor: '#1c2e1e', borderWidth: 2 }] }}
              options={{ ...chartOptions, cutout: '60%', maintainAspectRatio: false }}
            />
          </div>
        </div>
        <div style={cardStyle}>
          <div style={titleStyle}>Distribución por estado{filtroSede ? ` — ${filtroSede}` : ''}</div>
          <div style={{ height: '240px', position: 'relative' }}>
            <Doughnut
              ref={chartEstadoRef}
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
            ref={chartSectorRef}
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