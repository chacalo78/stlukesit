import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function useUserRole(user) {
  const [role, setRole] = useState(null)
  const [nombre, setNombre] = useState(null)
  const [sede, setSede] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cuentaInhabilitada, setCuentaInhabilitada] = useState(false)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    async function cargarRol() {
      const { data } = await supabase
        .from('user_roles')
        .select('*')
        .eq('email', user.email)
        .single()

      if (data?.habilitado === false) {
        setCuentaInhabilitada(true)
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      const rolCrudo = data?.rol || 'usuario'
      setRole(rolCrudo === 'viewer' ? 'usuario' : rolCrudo)
      setNombre(data?.nombre || user.email)
      setSede(data?.sede || null)
      setLoading(false)
    }
    cargarRol()
  }, [user])

  const isSuperAdmin = role === 'super_admin'
  const isAdmin = role === 'admin'
  const isCoordinador = role === 'coordinador'
  const isDirector = role === 'director'
  // Todo lo "operativo" (Dashboard, Historial, Préstamos): todos los
  // roles salvo Usuario, que solo ve Equipos y Reportes. Director lo ve
  // pero solo de solo lectura y acotado a su sede (ver sedeScoped).
  const esOperativo = isSuperAdmin || isAdmin || isCoordinador || isDirector

  return {
    role,
    nombre,
    sede,
    loading,
    cuentaInhabilitada,
    isSuperAdmin,
    isAdmin,
    isCoordinador,
    isDirector,
    isUsuario: role === 'usuario',
    // Administrador y Super Administrador comparten permisos operativos
    // (equipos, reportes, gestionar Usuarios); solo super_admin puede
    // administrar cuentas de Administrador/Super Administrador.
    // Director es de solo lectura: puede ver todo lo operativo pero no
    // editar equipos ni gestionar préstamos.
    canManageEquipos: isSuperAdmin || isAdmin || isCoordinador,
    canManageUsers: isSuperAdmin || isAdmin,
    canViewDashboard: esOperativo,
    canViewHistorial: esOperativo,
    canViewPrestamos: esOperativo,
    // Reportes de Usuarios: Admin y Super Admin lo ven, pero solo
    // Super Admin puede marcar como resuelto/reabrir.
    canViewFeedback: isSuperAdmin || isAdmin,
    // Coordinador y Director solo ven/operan dentro de su propia sede.
    sedeScoped: isCoordinador || isDirector
  }
}

export default useUserRole
