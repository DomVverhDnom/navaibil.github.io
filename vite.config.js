import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiProxy = {
  '/api': { target: 'http://localhost:3000', changeOrigin: true },
  '/socket.io': { target: 'http://localhost:3000', ws: true },
  '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
}

export default defineConfig({
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
