import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Login from './components/Login'
import UpdatePassword from './components/UpdatePassword'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import Equipos from './components/Equipos'
import Historial from './components/Historial'
import Reportes from './components/Reportes'
import Usuarios from './components/Usuarios'
import useUserRole from './hooks/useUserRole'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentSection, setCurrentSection] = useState('dashboard')
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const { role, nombre, sede, isSuperAdmin, isCoordinador, canManageEquipos, canManageUsers, loading: roleLoading } = useUserRole(session?.user)

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

  if (!session) return <Login />

  const renderSection = () => {
    switch (currentSection) {
      case 'dashboard': return <Dashboard />
      case 'equipos': return <Equipos puedeEditar={canManageEquipos} isCoordinador={isCoordinador} currentUserNombre={nombre} currentUserSede={sede} />
      case 'historial': return <Historial />
      case 'reportes': return <Reportes />
      case 'usuarios': return canManageUsers
        ? <Usuarios currentUserEmail={session.user.email} isSuperAdmin={isSuperAdmin} />
        : <div style={{ color: '#9ab89c' }}>No tenés permisos para ver esta sección.</div>
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
    >
      {renderSection()}
    </Layout>
  )
}

export default App