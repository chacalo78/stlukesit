import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { ESTADOS_EQUIPO, SEDES, SECTORES } from '../constants'

const COLUMNAS = [
  { key: 'numero_inventario', label: 'N° Inventario', porDefecto: true },
  { key: 'id_red', label: 'ID de Red', porDefecto: true },
  { key: 'tipo', label: 'Tipo', porDefecto: true },
  { key: 'marca', label: 'Marca', porDefecto: true },
  { key: 'modelo', label: 'Modelo', porDefecto: true },
  { key: 'numero_serie', label: 'N° de Serie', porDefecto: false },
  { key: 'estado', label: 'Estado', porDefecto: true },
  { key: 'procesador', label: 'Procesador', porDefecto: false },
  { key: 'ram', label: 'RAM', porDefecto: false },
  { key: 'disco', label: 'Disco', porDefecto: false },
  { key: 'tipo_disco', label: 'Tipo de Disco', porDefecto: false },
  { key: 'sistema_operativo', label: 'Sistema Operativo', porDefecto: false },
  { key: 'ubicacion', label: 'Sede', porDefecto: true },
  { key: 'sector', label: 'Sector', porDefecto: true },
  { key: 'usuario', label: 'Usuario', porDefecto: true },
  { key: 'fecha_adquisicion', label: 'Fecha de Adquisición', porDefecto: false },
  { key: 'garantia_hasta', label: 'Garantía Hasta', porDefecto: false },
  { key: 'observaciones', label: 'Observaciones', porDefecto: false },
  { key: 'created_at', label: 'Creado', porDefecto: false },
  { key: 'updated_at', label: 'Última Modificación', porDefecto: false },
]

function escaparCSV(valor) {
  if (valor === null || valor === undefined) return ''
  const texto = String(valor)
  if (/[",\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`
  }
  return texto
}

function generarCSV(filas, columnas) {
  const encabezado = columnas.map(c => escaparCSV(c.label)).join(',')
  const cuerpo = filas.map(fila => columnas.map(c => escaparCSV(fila[c.key])).join(',')).join('\n')
  return `${encabezado}\n${cuerpo}`
}

function ExportarDB() {
  const [equipos, setEquipos] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ q: '', tipo: '', estado: '', sede: '', sector: '' })
  const [columnasSeleccionadas, setColumnasSeleccionadas] = useState(
    Object.fromEntries(COLUMNAS.map(c => [c.key, c.porDefecto]))
  )

  useEffect(() => { cargarEquipos() }, [])
  useEffect(() => { aplicarFiltros() }, [equipos, filtros])

  async function cargarEquipos() {
    setLoading(true)
    const { data } = await supabase.from('equipos').select('*').order('numero_inventario', { ascending: true })
    setEquipos(data || [])
    setLoading(false)
  }

  function aplicarFiltros() {
    const { q, tipo, estado, sede, sector } = filtros
    const term = q.toLowerCase()
    const result = equipos.filter(e => {
      const mq = !term || [e.numero_inventario, e.id_red, e.marca, e.modelo, e.ubicacion, e.numero_serie, e.usuario, e.sector].some(v => v && v.toLowerCase().includes(term))
      return mq && (!tipo || e.tipo === tipo) && (!estado || e.estado === estado) && (!sede || e.ubicacion === sede) && (!sector || e.sector === sector)
    })
    setFiltered(result)
  }

  function toggleColumna(key) {
    setColumnasSeleccionadas(c => ({ ...c, [key]: !c[key] }))
  }

  function seleccionarTodas(valor) {
    setColumnasSeleccionadas(Object.fromEntries(COLUMNAS.map(c => [c.key, valor])))
  }

  function handleExportar() {
    const columnas = COLUMNAS.filter(c => columnasSeleccionadas[c.key])
    if (!columnas.length || !filtered.length) return

    const csv = generarCSV(filtered, columnas)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `equipos_export_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ color: '#9ab89c' }}>Cargando...</div>

  const columnasActivas = COLUMNAS.filter(c => columnasSeleccionadas[c.key])

  const selectStyle = {
    padding: '8px 10px',
    background: '#1c2e1e',
    border: '1px solid #2a3f2c',
    borderRadius: '6px',
    color: '#e8f0e8',
    fontSize: '13px',
    cursor: 'pointer'
  }

  const cardStyle = {
    background: '#172019',
    border: '1px solid #2a3f2c',
    borderRadius: '10px',
    padding: '18px',
    marginBottom: '18px'
  }

  const tituloStyle = {
    fontSize: '11px',
    fontWeight: '600',
    color: '#c8a44a',
    textTransform: 'uppercase',
    letterSpacing: '.8px',
    marginBottom: '14px'
  }

  return (
    <div>
      {/* Filtros */}
      <div style={cardStyle}>
        <div style={tituloStyle}>Filtros</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
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
          <select style={selectStyle} value={filtros.sede} onChange={e => setFiltros(f => ({ ...f, sede: e.target.value }))}>
            <option value="">Todas las sedes</option>
            {SEDES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select style={selectStyle} value={filtros.sector} onChange={e => setFiltros(f => ({ ...f, sector: e.target.value }))}>
            <option value="">Todos los sectores</option>
            {SECTORES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Columnas */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={tituloStyle}>Columnas a exportar</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => seleccionarTodas(true)} style={{ background: 'none', border: 'none', color: '#4f8ef7', fontSize: '12px', cursor: 'pointer' }}>Seleccionar todas</button>
            <button onClick={() => seleccionarTodas(false)} style={{ background: 'none', border: 'none', color: '#9ab89c', fontSize: '12px', cursor: 'pointer' }}>Ninguna</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
          {COLUMNAS.map(c => (
            <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#e8f0e8', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!columnasSeleccionadas[c.key]} onChange={() => toggleColumna(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      {/* Acción */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div style={{ fontSize: '13px', color: '#9ab89c' }}>
          Se van a exportar <strong style={{ color: '#e8f0e8' }}>{filtered.length}</strong> registro{filtered.length !== 1 ? 's' : ''}, con <strong style={{ color: '#e8f0e8' }}>{columnasActivas.length}</strong> columna{columnasActivas.length !== 1 ? 's' : ''}.
        </div>
        <button
          onClick={handleExportar}
          disabled={!filtered.length || !columnasActivas.length}
          style={{
            padding: '9px 18px', background: (!filtered.length || !columnasActivas.length) ? '#3a5a3d' : '#c8a44a',
            border: 'none', borderRadius: '6px', color: (!filtered.length || !columnasActivas.length) ? '#5c7a5e' : '#1a1a0a',
            fontSize: '13px', fontWeight: '600', cursor: (!filtered.length || !columnasActivas.length) ? 'default' : 'pointer'
          }}
        >
          ⬇ Descargar CSV
        </button>
      </div>

      {/* Vista previa */}
      <div style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', fontSize: '11px', fontWeight: '600', color: '#c8a44a', textTransform: 'uppercase', letterSpacing: '.8px', borderBottom: '1px solid #2a3f2c' }}>
          Vista previa
        </div>
        <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {columnasActivas.map(c => (
                  <th key={c.key} style={{ position: 'sticky', top: 0, background: '#1c2e1e', padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#c8a44a', textTransform: 'uppercase', letterSpacing: '.8px', borderBottom: '1px solid #2a3f2c', whiteSpace: 'nowrap' }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length && columnasActivas.length ? filtered.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #2a3f2c' }}>
                  {columnasActivas.map(c => (
                    <td key={c.key} style={{ padding: '8px 14px', color: '#9ab89c', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {e[c.key] ?? '–'}
                    </td>
                  ))}
                </tr>
              )) : (
                <tr>
                  <td style={{ padding: '40px', textAlign: 'center', color: '#5c7a5e' }}>
                    {columnasActivas.length ? 'No hay equipos que coincidan con los filtros' : 'Seleccioná al menos una columna'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default ExportarDB
