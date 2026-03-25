import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/** GitHub Pages (репозиторий не в корне домена): задать в CI, например `/navaibil/`. */
const pagesBase = (process.env.VITE_GH_PAGES_BASE || '/').trim()
const base =
  pagesBase === '/' || pagesBase === ''
    ? '/'
    : pagesBase.endsWith('/')
      ? pagesBase
      : `${pagesBase}/`

const apiProxy = {
  '/api': { target: 'http://localhost:3000', changeOrigin: true },
  '/socket.io': { target: 'http://localhost:3000', ws: true },
  '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
}

export default defineConfig({
  base,
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    proxy: { ...apiProxy },
  },
  preview: {
    host: true,
    proxy: { ...apiProxy },
  },
})
