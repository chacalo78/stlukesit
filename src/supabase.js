import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Algunas redes/dispositivos borran el header "apikey" en tránsito.
// Supabase también acepta la clave como parámetro de URL, así que la
// mandamos por las dos vías para que llegue de todas formas.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, options = {}) => {
      const urlObj = new URL(url)
      if (!urlObj.searchParams.has('apikey')) {
        urlObj.searchParams.set('apikey', supabaseKey)
      }
      return fetch(urlObj.toString(), options)
    }
  }
})