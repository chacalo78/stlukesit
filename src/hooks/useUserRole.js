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
      setRole(data?.rol || 'viewer')
      setNombre(data?.nombre || user.email)
      setSede(data?.sede || null)
      setLoading(false)
    }
    cargarRol()
  }, [user])

  return {
    role,
    nombre,
    sede,
    loading,
    isAdmin: role === 'admin',
    isCoordinador: role === 'coordinador',
    isViewer: role === 'viewer'
  }
}

export default useUserRole
