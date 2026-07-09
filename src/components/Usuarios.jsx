import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import ModalUsuario from './ModalUsuario'

function Usuarios({ currentUserEmail }) {
  const [usuarios, setUsuarios] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ q: '', rol: '', sede: '' })
  const [modalOpen, setModalOpen] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { cargarUsuarios() }, [])
  useEffect(() => { aplicarFiltros() }, [usuarios, filtros])

  async function cargarUsuarios() {
    setLoading(true)
    const { data } = await supabase.from('user_roles').select('*').order('nombre', { ascending: true })
    setUsuarios(data || [])
    setLoading(false)
  }

  function aplicarFiltros() {
    const { q, rol, sede } = filtros
    const term = q.toLowerCase()
    const result = usuarios.filter(u => {
      const mq = !term || [u.nombre, u.email].some(v => v && v.toLowerCase().includes(term))
      return mq && (!rol || u.rol === rol) && (!sede || u.sede === sede)
    })
    setFiltered(result)
  }

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleSave(form) {
    const payload = {
      email: form.email?.trim().toLowerCase(),
      nombre: form.nombre?.trim(),
      rol: form.rol,
      sede: form.sede || null,
    }

    if (!payload.email || !payload.nombre || !payload.rol) {
      showToast('Email, nombre y rol son obligatorios', 'error')
      return
    }

    let error
    if (usuarioEditando) {
      const res = await supabase.from('user_roles')
        .update({ nombre: payload.nombre, rol: payload.rol, sede: payload.sede })
        .eq('id', usuarioEditando.id)
      error = res.error
    } else {
      const res = await supabase.from('user_roles').insert(payload)
      error = res.error
    }

    if (error) { showToast('Error: ' + error.message, 'error'); return }
    showToast(usuarioEditando ? 'Usuario actualizado' : 'Usuario creado correctamente')
    setModalOpen(false)
    setUsuarioEditando(null)
    cargarUsuarios()
  }

  async function handleBaja(usuario) {
    if (usuario.email === currentUserEmail) {
      showToast('No podés eliminar tu propio usuario', 'error')
      return
    }
    if (!window.confirm(`¿Confirmar baja del usuario "${usuario.nombre || usuario.email}"? Esto quita sus permisos en el sistema (no borra la cuenta de acceso).`)) return
    const { error } = await supabase.from('user_roles').delete().eq('id', usuario.id)
    if (error) { showToast('Error al dar de baja', 'error'); return }
    showToast('Usuario dado de baja')
    cargarUsuarios()
  }

  const badgeRol = (rol) => {
    const estilos = {
      admin: { bg: 'rgba(200,164,74,.2)', color: '#c8a44a' },
      coordinador: { bg: 'rgba(79,142,247,.2)', color: '#4f8ef7' },
      viewer: { bg: 'rgba(154,184,156,.15)', color: '#9ab89c' }
    }
    const e = estilos[rol] || estilos.viewer
    return (
      <span style={{ background: e.bg, color: e.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>
        {rol}
      </span>
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

      {/* Aviso */}
      <div style={{
        background: 'rgba(200,164,74,.08)', border: '1px solid rgba(200,164,74,.25)',
        borderRadius: '8px', padding: '10px 14px', marginBottom: '16px',
        fontSize: '12px', color: '#c8a44a'
      }}>
        Esta sección gestiona el rol y la sede de los usuarios dentro del sistema. La cuenta de acceso (email/contraseña) se sigue creando desde el panel de Supabase.
      </div>

      {/* Botón nuevo usuario */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button
          onClick={() => { setUsuarioEditando(null); setModalOpen(true) }}
          style={{ padding: '7px 14px', background: '#c8a44a', border: 'none', borderRadius: '6px', color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
        >
          + Nuevo usuario
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#5c7a5e' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={filtros.q}
            onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
            style={{ width: '100%', padding: '8px 12px 8px 34px', background: '#1c2e1e', border: '1px solid #2a3f2c', borderRadius: '6px', color: '#e8f0e8', fontSize: '13px', boxSizing: 'border-box' }}
          />
        </div>
        <select style={selectStyle} value={filtros.rol} onChange={e => setFiltros(f => ({ ...f, rol: e.target.value }))}>
          <option value="">Todos los roles</option>
          {['admin', 'coordinador', 'viewer'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select style={selectStyle} value={filtros.sede} onChange={e => setFiltros(f => ({ ...f, sede: e.target.value }))}>
          <option value="">Todas las sedes</option>
          {['Nordelta', 'HSM', 'Olivos'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div style={{ background: '#172019', border: '1px solid #2a3f2c', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Nombre', 'Email', 'Rol', 'Sede', 'Acciones'].map(h => (
                  <th key={h} style={{ background: '#1c2e1e', padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#c8a44a', textTransform: 'uppercase', letterSpacing: '.8px', borderBottom: '1px solid #2a3f2c', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #2a3f2c' }}>
                  <td style={{ padding: '10px 14px', color: '#e8f0e8', fontSize: '13px' }}>{u.nombre || '–'}</td>
                  <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '12px' }}>{u.email}</td>
                  <td style={{ padding: '10px 14px' }}>{badgeRol(u.rol)}</td>
                  <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{u.sede || '–'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={() => { setUsuarioEditando(u); setModalOpen(true) }} style={btnStyle('#9ab89c')}>Editar</button>
                      <button onClick={() => handleBaja(u)} style={btnStyle('#e25555')}>Baja</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#5c7a5e' }}>
                    No se encontraron usuarios
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <ModalUsuario
          usuario={usuarioEditando}
          onClose={() => { setModalOpen(false); setUsuarioEditando(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

export default Usuarios
