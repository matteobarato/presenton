import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __SLIDESHOWS_BACKEND_URL__: JSON.stringify('http://backend.test:5001') },
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/unit/setup-i18n.ts'],
    include: ['tests/unit/**/*.test.ts'],
  },
})
