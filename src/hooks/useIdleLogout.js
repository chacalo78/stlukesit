import { useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const TIMEOUT_MS = 15 * 60 * 1000
const CHECK_INTERVAL_MS = 15 * 1000
const STORAGE_KEY = 'stlukesit_last_activity'
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'wheel']

// Cierra la sesión automáticamente tras TIMEOUT_MS sin actividad del
// usuario. La última actividad se guarda en localStorage para que, si
// hay varias pestañas del sitio abiertas, la actividad en una reinicie
// el conteo en todas.
function useIdleLogout(active, onIdleLogout) {
  const lastActivityRef = useRef(Date.now())
  const callbackRef = useRef(onIdleLogout)
  callbackRef.current = onIdleLogout

  useEffect(() => {
    if (!active) return

    function registerActivity() {
      const now = Date.now()
      lastActivityRef.current = now
      try {
        localStorage.setItem(STORAGE_KEY, String(now))
      } catch {
        // localStorage puede no estar disponible (modo privado, etc.);
        // el timeout sigue funcionando igual dentro de esta pestaña.
      }
    }

    function handleStorage(e) {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      const value = Number(e.newValue)
      if (!Number.isNaN(value)) lastActivityRef.current = value
    }

    registerActivity()
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, registerActivity, { passive: true }))
    window.addEventListener('storage', handleStorage)

    const intervalId = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= TIMEOUT_MS) {
        clearInterval(intervalId)
        supabase.auth.signOut().then(() => callbackRef.current?.())
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, registerActivity))
      window.removeEventListener('storage', handleStorage)
      clearInterval(intervalId)
    }
  }, [active])
}

export default useIdleLogout
