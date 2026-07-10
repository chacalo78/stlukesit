import { useState, useEffect } from 'react'
import { ESTADOS_EQUIPO, SEDES, SECTORES } from '../constants'

function ModalEquipo({ equipo, onClose, onSave }) {
  const [form, setForm] = useState({
    numero_inventario: '',
    id_red: '',
    tipo: '',
    marca: '',
    modelo: '',
    numero_serie: '',
    estado: 'Activo',
    procesador: '',
    ram: '',
    disco: '',
    tipo_disco: '',
    sistema_operativo: '',
    ubicacion: '',
    sector: '',
    usuario: '',
    fecha_adquisicion: '',
    garantia_hasta: '',
    observaciones: ''
  })

  useEffect(() => {
    if (equipo) setForm(equipo)
  }, [equipo])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

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

  const sectionStyle = {
    fontSize: '11px',
    fontWeight: '600',
    color: '#c8a44a',
    textTransform: 'uppercase',
    letterSpacing: '.8px',
    gridColumn: '1 / -1',
    borderBottom: '1px solid #2a3f2c',
    paddingBottom: '6px',
    marginTop: '10px'
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      zIndex: 100, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: '#152116', border: '1px solid #3a5a3d',
        borderRadius: '14px', width: '100%', maxWidth: '640px',
        maxHeight: '92vh', overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid #2a3f2c',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: '#152116', zIndex: 1
        }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#c8a44a' }}>
            {equipo ? 'Editar equipo' : 'Nuevo equipo'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5c7a5e', fontSize: '20px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            
            <div style={sectionStyle}>Identificación</div>
            
            <div>
              <label style={labelStyle}>N° Inventario *</label>
              <input style={inputStyle} value={form.numero_inventario} onChange={e => set('numero_inventario', e.target.value)} placeholder="Ej: DSND00001" />
            </div>
            <div>
              <label style={labelStyle}>ID de Red</label>
              <input style={inputStyle} value={form.id_red || ''} onChange={e => set('id_red', e.target.value)} placeholder="Ej: WS0900" />
            </div>
            <div>
              <label style={labelStyle}>Tipo *</label>
              <select style={inputStyle} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                <option value="">Seleccioná...</option>
                {['PC', 'Notebook', 'Monitor', 'Impresora', 'Switch', 'UPS', 'Servidor', 'Otro'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Estado</label>
              <select style={inputStyle} value={form.estado} onChange={e => set('estado', e.target.value)}>
                {ESTADOS_EQUIPO.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Marca</label>
              <input style={inputStyle} value={form.marca || ''} onChange={e => set('marca', e.target.value)} placeholder="Ej: HP, Dell, Lenovo" />
            </div>
            <div>
              <label style={labelStyle}>Modelo</label>
              <input style={inputStyle} value={form.modelo || ''} onChange={e => set('modelo', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>N° de Serie</label>
              <input style={inputStyle} value={form.numero_serie || ''} onChange={e => set('numero_serie', e.target.value)} />
            </div>

            <div style={sectionStyle}>Hardware</div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Procesador</label>
              <input style={inputStyle} value={form.procesador || ''} onChange={e => set('procesador', e.target.value)} placeholder="Ej: Intel Core i5-10400" />
            </div>
            <div>
              <label style={labelStyle}>RAM</label>
              <select style={inputStyle} value={form.ram || ''} onChange={e => set('ram', e.target.value)}>
                <option value="">Seleccioná...</option>
                {['2 GB', '4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '32 GB', '64 GB', 'Otro'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Disco</label>
              <select style={inputStyle} value={form.disco || ''} onChange={e => set('disco', e.target.value)}>
                <option value="">Seleccioná...</option>
                {['240 GB', '500 GB', '1 TB', 'Otro'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tipo de Disco</label>
              <select style={inputStyle} value={form.tipo_disco || ''} onChange={e => set('tipo_disco', e.target.value)}>
                <option value="">Seleccioná...</option>
                {['SSD', 'HDD', 'NVMe', 'Otro'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Sistema Operativo</label>
              <select style={inputStyle} value={form.sistema_operativo || ''} onChange={e => set('sistema_operativo', e.target.value)}>
                <option value="">Seleccioná...</option>
                {['Windows 10', 'Windows 11', 'Otro'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div style={sectionStyle}>Ubicación y Asignación</div>

            <div>
              <label style={labelStyle}>Sede</label>
              <select style={inputStyle} value={form.ubicacion || ''} onChange={e => set('ubicacion', e.target.value)}>
                <option value="">Seleccioná...</option>
                {SEDES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Sector</label>
              <select style={inputStyle} value={form.sector || ''} onChange={e => set('sector', e.target.value)}>
                <option value="">Seleccioná...</option>
                {SECTORES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Usuario</label>
              <input style={inputStyle} value={form.usuario || ''} onChange={e => set('usuario', e.target.value)} placeholder="Nombre del usuario" />
            </div>

            <div style={sectionStyle}>Adquisición</div>

            <div>
              <label style={labelStyle}>Fecha de adquisición</label>
              <input type="date" style={inputStyle} value={form.fecha_adquisicion || ''} onChange={e => set('fecha_adquisicion', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Garantía hasta</label>
              <input type="date" style={inputStyle} value={form.garantia_hasta || ''} onChange={e => set('garantia_hasta', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Observaciones</label>
              <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }} value={form.observaciones || ''} onChange={e => set('observaciones', e.target.value)} placeholder="Notas adicionales..." />
            </div>

          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px 20px', borderTop: '1px solid #2a3f2c',
          display: 'flex', justifyContent: 'flex-end', gap: '10px',
          position: 'sticky', bottom: 0, background: '#152116'
        }}>
          <button onClick={onClose} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid #3a5a3d', borderRadius: '6px', color: '#9ab89c', fontSize: '13px', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={() => onSave(form)} style={{ padding: '7px 14px', background: '#c8a44a', border: 'none', borderRadius: '6px', color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

export default ModalEquipo