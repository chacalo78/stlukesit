import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// La app se sirve en la raíz de su (sub)dominio en Hostinger. BASE_PATH permite
// compilar para otra ruta (p. ej. '/stlukesit/' mientras GitHub Pages siga activo).
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
})
