import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { proxyTargets } from './vite.proxy'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: proxyTargets(process.env.BACKEND_URL ?? 'http://localhost:5001'),
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
  },
})
