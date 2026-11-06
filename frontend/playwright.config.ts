import { defineConfig, devices } from '@playwright/test'

const live = Boolean(process.env.E2E_BACKEND)
// The mocked suite intercepts every /api call in the browser, so the dev server's
// proxy target is an unused port. The live suite talks to the real backend.
const backendUrl = live ? (process.env.BACKEND_URL ?? 'http://localhost:5001') : 'http://127.0.0.1:9'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    env: { BACKEND_URL: backendUrl },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
