import { useEffect, useState } from 'react'
import { usuarios as usuariosApi } from '../api'
import ModalUsuario from './ModalUsuario'
import ModalResetPassword from './ModalResetPassword'
import { ROLES, ROLE_LABELS, ROLE_BADGE } from '../roles'
import { leerBorradorUsuario } from '../constants'

const esRolElevado = (rol) => rol === 'admin' || rol === 'super_admin'

function Usuarios({ currentUserEmail, currentUserNombre, isSuperAdmin }) {
  const [usuarios, setUsuarios] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({ q: '', rol: '', sede: '' })
  // Si quedó un borrador de ModalUsuario (la página se recargó sola con
  // el modal abierto, ver constants.js), se reabre automáticamente.
  const [borradorInicial] = useState(() => leerBorradorUsuario())
  const [modalOpen, setModalOpen] = useState(!!borradorInicial)
  const [usuarioEditando, setUsuarioEditando] = useState(borradorInicial?.form?.id ? borradorInicial.form : null)
  const [usuarioResetPassword, setUsuarioResetPassword] = useState(null)
  const [toast, setToast] = useState(null)

  useEffect(() => { cargarUsuarios() }, [])
  useEffect(() => { aplicarFiltros() }, [usuarios, filtros])

  async function cargarUsuarios() {
    setLoading(true)
    try {
      setUsuarios(await usuariosApi.listar())
    } catch {
      setUsuarios([])
    }
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

    if (!isSuperAdmin && (esRolElevado(payload.rol) || (usuarioEditando && esRolElevado(usuarioEditando.rol)))) {
      showToast('Solo un Super Administrador puede gestionar cuentas de Administrador', 'error')
      return
    }

    let mailError
    try {
      if (usuarioEditando) {
        await usuariosApi.actualizar(usuarioEditando.id, payload, currentUserNombre)
      } else {
        // Con la API propia devuelve { mailError } si no salió la invitación (con Supabase, undefined).
        mailError = (await usuariosApi.crear(payload, currentUserNombre))?.mailError
      }
    } catch (error) {
      showToast('Error: ' + error.message, 'error')
      return
    }
    if (mailError) showToast(`Usuario creado, pero no se pudo enviar el mail de invitación: ${mailError}`, 'error')
    else showToast(usuarioEditando ? 'Usuario actualizado' : 'Usuario creado correctamente')
    setModalOpen(false)
    setUsuarioEditando(null)
    cargarUsuarios()
  }

  async function handleBaja(usuario) {
    if (usuario.email === currentUserEmail) {
      showToast('No podés eliminar tu propio usuario', 'error')
      return
    }
    if (!isSuperAdmin && esRolElevado(usuario.rol)) {
      showToast('Solo un Super Administrador puede dar de baja cuentas de Administrador', 'error')
      return
    }
    if (!window.confirm(`¿Confirmar baja del usuario "${usuario.nombre || usuario.email}"? Esto quita sus permisos en el sistema (no borra la cuenta de acceso).`)) return
    try {
      await usuariosApi.eliminar(usuario.id, { nombre: usuario.nombre, email: usuario.email }, currentUserNombre)
    } catch (error) {
      showToast(error.message, 'error')
      return
    }
    showToast('Usuario dado de baja')
    cargarUsuarios()
  }

  async function handleToggleHabilitado(usuario) {
    if (usuario.email === currentUserEmail) {
      showToast('No podés inhabilitar tu propio usuario', 'error')
      return
    }
    if (esRolElevado(usuario.rol)) {
      showToast('Las cuentas de Administrador o Super Administrador no se pueden inhabilitar', 'error')
      return
    }
    const nuevoHabilitado = !usuario.habilitado
    const accion = nuevoHabilitado ? 'habilitar' : 'inhabilitar'
    if (!window.confirm(`¿Confirmar ${accion} el acceso de "${usuario.nombre || usuario.email}"?${nuevoHabilitado ? '' : ' No va a poder ingresar al sistema hasta que se lo vuelva a habilitar.'}`)) return

    try {
      await usuariosApi.cambiarHabilitado(usuario.id, nuevoHabilitado, { nombre: usuario.nombre, email: usuario.email }, currentUserNombre)
    } catch (error) {
      showToast(error.message, 'error')
      return
    }
    showToast(nuevoHabilitado ? 'Usuario habilitado' : 'Usuario inhabilitado')
    cargarUsuarios()
  }

  const badgeRol = (rol) => {
    const e = ROLE_BADGE[rol] || ROLE_BADGE.usuario
    return (
      <span style={{ background: e.bg, color: e.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>
        {ROLE_LABELS[rol] || ROLE_LABELS.usuario}
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

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '220px' }}>
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
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select style={selectStyle} value={filtros.sede} onChange={e => setFiltros(f => ({ ...f, sede: e.target.value }))}>
          <option value="">Todas las sedes</option>
          {['Nordelta', 'HSM', 'Olivos'].map(t => <option key={t}>{t}</option>)}
        </select>
        {/* Botón nuevo usuario */}
        <button
          onClick={() => { setUsuarioEditando(null); setModalOpen(true) }}
          style={{ marginLeft: 'auto', padding: '7px 14px', background: '#c8a44a', border: 'none', borderRadius: '6px', color: '#1a1a0a', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + Nuevo usuario
        </button>
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
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {badgeRol(u.rol)}
                      {!u.habilitado && (
                        <span style={{ background: 'rgba(226,85,85,.15)', color: '#e25555', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>
                          Inhabilitado
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#9ab89c', fontSize: '13px' }}>{u.sede || '–'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      {(isSuperAdmin || !esRolElevado(u.rol)) ? (
                        <>
                          <button onClick={() => { setUsuarioEditando(u); setModalOpen(true) }} style={btnStyle('#9ab89c')}>Editar</button>
                          <button onClick={() => handleBaja(u)} style={btnStyle('#e25555')}>Baja</button>
                          {!esRolElevado(u.rol) && (
                            <button onClick={() => handleToggleHabilitado(u)} style={btnStyle(u.habilitado ? '#f5a623' : '#34c98a')}>
                              {u.habilitado ? 'Inhabilitar' : 'Habilitar'}
                            </button>
                          )}
                          <button onClick={() => setUsuarioResetPassword(u)} style={btnStyle('#4f8ef7')}>Restablecer Contraseña</button>
                        </>
                      ) : (
                        <span style={{ color: '#5c7a5e', fontSize: '11px' }}>Solo Super Admin</span>
                      )}
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
          canManageAdmins={isSuperAdmin}
        />
      )}

      {usuarioResetPassword && (
        <ModalResetPassword
          id={usuarioResetPassword.id}
          nombre={usuarioResetPassword.nombre}
          email={usuarioResetPassword.email}
          actorNombre={currentUserNombre}
          onClose={() => setUsuarioResetPassword(null)}
        />
      )}
    </div>
  )
}

export default Usuarios
