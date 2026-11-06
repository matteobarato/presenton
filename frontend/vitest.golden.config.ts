import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Old Next.js app, read-only reference. Override with OLD_FRONTEND_DIR when the
// checkout lives elsewhere (e.g. a worktree without servers/nextjs/node_modules).
const here = fileURLToPath(new URL('.', import.meta.url))
const oldDir = resolve(here, process.env.OLD_FRONTEND_DIR ?? '../servers/nextjs')

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@new\//, replacement: resolve(here, 'src') + '/' },
      { find: /^@\//, replacement: oldDir + '/' },
      // The old tree has no node_modules in worktrees: resolve its bare imports here.
      { find: /^katex$/, replacement: resolve(here, 'node_modules/katex') },
    ],
  },
  server: { fs: { allow: [here, oldDir, resolve(here, '..')] } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/golden/**/*.test.ts'],
  },
})
