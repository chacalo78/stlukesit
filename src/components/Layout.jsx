import { useState } from 'react'
import { supabase } from '../supabase'
import { ROLE_LABELS, ROLE_BADGE } from '../roles'
import ModalCambiarPassword from './ModalCambiarPassword'
import ModalReportarProblema from './ModalReportarProblema'

const icons = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ flexShrink: 0 }}>
      <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="2" />
    </svg>
  ),
  equipos: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ flexShrink: 0 }}>
      <rect x="2" y="4" width="20" height="14" rx="2" strokeWidth="2" />
      <path d="M8 20h8M12 18v2" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  historial: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
      <path d="M12 7v5l3 3" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  reportes: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ flexShrink: 0 }}>
      <path d="M3 3v18h18" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 16l4-4 4 4 4-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  usuarios: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ flexShrink: 0 }}>
      <circle cx="9" cy="8" r="3.5" strokeWidth="2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeWidth="2" strokeLinecap="round" />
      <path d="M16.5 6.5a3.5 3.5 0 0 1 0 7M21 20c0-2.8-2-5.1-4.7-5.8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  prestamos: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ flexShrink: 0 }}>
      <path d="M4 4v6h6M20 20v-6h-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 15a8 8 0 0 0 14 3.5M19.5 9a8 8 0 0 0-14-3.5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  feedback: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ flexShrink: 0 }}>
      <path d="M21 11.5a8.38 8.38 0 0 1-4.4 7.4L3 21l2.1-4.7A8.38 8.38 0 1 1 21 11.5Z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

function Layout({ session, nombre, role, sede, children, currentSection, onSectionChange, canManageUsers, isSuperAdmin }) {
  const [modalPasswordOpen, setModalPasswordOpen] = useState(false)
  const [modalReporteOpen, setModalReporteOpen] = useState(false)

  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'equipos', label: 'Equipos' },
    { id: 'historial', label: 'Historial' },
    { id: 'reportes', label: 'Reportes' },
    { id: 'prestamos', label: 'Préstamos' },
    ...(canManageUsers ? [{ id: 'usuarios', label: 'Usuarios' }] : []),
    ...(isSuperAdmin ? [{ id: 'feedback', label: 'Reportes de Usuarios' }] : []),
  ]

  const rc = ROLE_BADGE[role] || ROLE_BADGE.usuario

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1a10', fontFamily: 'Inter, sans-serif' }}>

      {/* Sidebar */}
      <div style={{
        width: '230px', background: '#152116',
        borderRight: '1px solid #2a3f2c',
        display: 'flex', flexDirection: 'column', flexShrink: 0
      }}>
        {/* Logo */}
        <div style={{ padding: '16px 14px', borderBottom: '1px solid #2a3f2c', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="St. Luke's"
            style={{ width: '48px', height: 'auto', flexShrink: 0 }}
          />
          <div>
            <div style={{ color: '#c8a44a', fontWeight: '700', fontSize: '13px' }}>St. Luke's</div>
            <div style={{ color: '#5c7a5e', fontSize: '10px' }}>Sistema de IT</div>
          </div>
        </div>

        {/* Navegación */}
        <div style={{ padding: '16px 10px 6px' }}>
          <div style={{ fontSize: '10px', color: '#5c7a5e', textTransform: 'uppercase', letterSpacing: '1px', padding: '0 8px 6px' }}>
            Menú
          </div>
          {navItems.map(item => (
            <div
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                color: currentSection === item.id ? '#c8a44a' : '#9ab89c',
                background: currentSection === item.id ? 'rgba(200,164,74,.15)' : 'transparent',
                fontSize: '13px', marginBottom: '2px'
              }}
            >
              {icons[item.id]}
              {item.label}
            </div>
          ))}
        </div>

      </div>

      {/* Contenido principal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <div style={{
          background: '#152116', borderBottom: '1px solid #2a3f2c',
          padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#e8f0e8' }}>
            {{ dashboard: 'Dashboard', equipos: 'Equipos', historial: 'Historial de movimientos', reportes: 'Reportes y Gráficos', prestamos: 'Préstamos', usuarios: 'Usuarios', feedback: 'Reportes de Usuarios' }[currentSection]}
          </div>

          {/* Usuario */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ marginBottom: '3px' }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px',
                  background: rc.bg, color: rc.color,
                  borderRadius: '20px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase'
                }}>
                  {ROLE_LABELS[role] || ROLE_LABELS.usuario}{sede ? ` · ${sede}` : ''}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#9ab89c', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nombre || session.user.email}
              </div>
            </div>
            <button
              onClick={() => setModalReporteOpen(true)}
              style={{
                padding: '7px 12px', background: 'transparent', flexShrink: 0,
                border: '1px solid #3a5a3d', borderRadius: '6px',
                color: '#9ab89c', fontSize: '12px', cursor: 'pointer'
              }}
            >
              Informar error / mejora
            </button>
            <button
              onClick={() => setModalPasswordOpen(true)}
              style={{
                padding: '7px 12px', background: 'transparent', flexShrink: 0,
                border: '1px solid #3a5a3d', borderRadius: '6px',
                color: '#9ab89c', fontSize: '12px', cursor: 'pointer'
              }}
            >
              Cambiar contraseña
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                padding: '7px 12px', background: 'transparent', flexShrink: 0,
                border: '1px solid #3a5a3d', borderRadius: '6px',
                color: '#9ab89c', fontSize: '12px', cursor: 'pointer'
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {children}
        </div>

        {modalPasswordOpen && (
          <ModalCambiarPassword email={session.user.email} onClose={() => setModalPasswordOpen(false)} />
        )}

        {modalReporteOpen && (
          <ModalReportarProblema nombre={nombre} email={session.user.email} onClose={() => setModalReporteOpen(false)} />
        )}

      </div>
    </div>
  )
}

export default Layout
