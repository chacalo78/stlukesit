import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Login from './components/Login'
import UpdatePassword from './components/UpdatePassword'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import Equipos from './components/Equipos'
import Historial from './components/Historial'
import Reportes from './components/Reportes'
import Prestamos from './components/Prestamos'
import Usuarios from './components/Usuarios'
import FeedbackDev from './components/FeedbackDev'
import ExportarDB from './components/ExportarDB'
import Repuestos from './components/Repuestos'
import useUserRole from './hooks/useUserRole'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentSection, setCurrentSection] = useState('dashboard')
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const { role, nombre, sede, cuentaInhabilitada, isSuperAdmin, sedeScoped, canManageEquipos, canManageUsers, canExportDB, canManageRepuestos, canViewDashboard, canViewHistorial, canViewPrestamos, canViewFeedback, loading: roleLoading } = useUserRole(session?.user)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
      }
      setSession(session)
    })
  }, [])

  useEffect(() => {
    // role !== null evita un frame intermedio donde roleLoading ya
    // parpadeó a false (por el hook reaccionando a un user aún
    // indefinido) pero el rol real todavía no llegó.
    if (!loading && !roleLoading && role !== null && currentSection === 'dashboard' && !canViewDashboard) {
      setCurrentSection('equipos')
    }
  }, [loading, roleLoading, role, canViewDashboard, currentSection])

  if (loading || roleLoading) return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#0f1a10',
      color: '#9ab89c'
    }}>
      Cargando...
    </div>
  )

  if (passwordRecovery) return <UpdatePassword onDone={() => setPasswordRecovery(false)} />

  if (cuentaInhabilitada) return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '24px',
      textAlign: 'center',
      background: '#0f1a10',
      color: '#e25555'
    }}>
      Tu cuenta fue inhabilitada. Contactá a un administrador del sistema.
    </div>
  )

  if (!session) return <Login />

  const sinPermiso = <div style={{ color: '#9ab89c' }}>No tenés permisos para ver esta sección.</div>

  const renderSection = () => {
    switch (currentSection) {
      case 'dashboard': return canViewDashboard
        ? <Dashboard sedeScoped={sedeScoped} currentUserSede={sede} />
        : sinPermiso
      case 'equipos': return <Equipos
        puedeEditar={canManageEquipos}
        sedeScoped={sedeScoped}
        currentUserNombre={nombre}
        currentUserSede={sede}
      />
      case 'historial': return canViewHistorial
        ? <Historial sedeScoped={sedeScoped} currentUserSede={sede} />
        : sinPermiso
      case 'reportes': return <Reportes />
      case 'prestamos': return canViewPrestamos
        ? <Prestamos puedeEditar={canManageEquipos} sedeScoped={sedeScoped} currentUserSede={sede} currentUserNombre={nombre} />
        : sinPermiso
      case 'usuarios': return canManageUsers
        ? <Usuarios currentUserEmail={session.user.email} currentUserNombre={nombre} isSuperAdmin={isSuperAdmin} />
        : sinPermiso
      case 'exportar': return canExportDB ? <ExportarDB /> : sinPermiso
      case 'repuestos': return canManageRepuestos ? <Repuestos /> : sinPermiso
      case 'feedback': return canViewFeedback
        ? <FeedbackDev puedeGestionar={isSuperAdmin} />
        : sinPermiso
      default: return (
        <div style={{ color: '#9ab89c' }}>
          Sección en construcción...
        </div>
      )
    }
  }

  return (
    <Layout
      session={session}
      nombre={nombre}
      role={role}
      sede={sede}
      currentSection={currentSection}
      onSectionChange={setCurrentSection}
      canManageUsers={canManageUsers}
      canExportDB={canExportDB}
      canManageRepuestos={canManageRepuestos}
      canViewDashboard={canViewDashboard}
      canViewHistorial={canViewHistorial}
      canViewPrestamos={canViewPrestamos}
      canViewFeedback={canViewFeedback}
    >
      {renderSection()}
    </Layout>
  )
}

export default App