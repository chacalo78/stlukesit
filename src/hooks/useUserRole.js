import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function useUserRole(user) {
  const [role, setRole] = useState(null)
  const [nombre, setNombre] = useState(null)
  const [sede, setSede] = useState(null)
  const [loading, setLoading] = useState(true)

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

  return {
    role,
    nombre,
    sede,
    loading,
    isSuperAdmin,
    isAdmin,
    isCoordinador: role === 'coordinador',
    isUsuario: role === 'usuario',
    // Administrador y Super Administrador comparten permisos operativos
    // (equipos, reportes, gestionar Usuarios); solo super_admin puede
    // administrar cuentas de Administrador/Super Administrador.
    canManageEquipos: isSuperAdmin || isAdmin || role === 'coordinador',
    canManageUsers: isSuperAdmin || isAdmin
  }
}

export default useUserRole
