import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { proxyTargets } from './vite.proxy'

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:5001'

export default defineConfig({
  // Shown by the "backend unreachable" banner.
  define: { __PRESENTON_BACKEND_URL__: JSON.stringify(backendUrl) },
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: proxyTargets(backendUrl),
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
  },
})
