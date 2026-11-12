import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
// La app se sirve en la raíz de su (sub)dominio en Hostinger. BASE_PATH permite
// compilar para otra ruta (p. ej. '/stlukesit/' mientras GitHub Pages siga activo).
//
// VITE_BACKEND elige en tiempo de build la implementación de src/api:
// 'propio' (API Express) o, por defecto, 'supabase'. Se resuelve con un alias
// (@backend), así el backend no elegido no entra al bundle.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const backend = env.VITE_BACKEND === 'propio' ? 'propio' : 'supabase'
  return {
    plugins: [react()],
    base: process.env.BASE_PATH || '/',
    resolve: {
      alias: {
        '@backend': fileURLToPath(new URL(`./src/api/${backend}`, import.meta.url)),
      },
    },
  }
})
