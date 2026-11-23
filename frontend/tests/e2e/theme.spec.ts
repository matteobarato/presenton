import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
const DECK_ID = '11111111-1111-4111-8111-111111111111'

const BODIES: Record<string, unknown> = {
  '/api/v1/auth/status': { configured: true, authenticated: true, username: 'e2e', role: 'admin' },
  '/api/runtime-config': { configured: true, config: { PRESENTATION_GENERATION_MODE: 'standard' } },
  '/api/v1/ppt/presentation/all': fixture('presentations'),
  [`/api/v1/ppt/presentation/${DECK_ID}`]: fixture('presentation'),
  '/api/v1/ppt/presentation/speaker-notes/tts/languages': fixture('languages'),
  [`/api/v1/ppt/presentation/${DECK_ID}/speaker-notes/tts`]: fixture('tts'),
  [`/api/v1/ppt/presentation/${DECK_ID}/playback`]: fixture('playback'),
  [`/api/v1/ppt/presentation/${DECK_ID}/videos`]: fixture('videos'),
  [`/api/v1/ppt/presentation/${DECK_ID}/animations`]: { slides: [] },
  '/api/v1/ppt/chat/conversations': [],
  '/api/templates': [],
  '/api/v1/ppt/template/all': fixture('templates'),
}

async function mock(page: Page) {
  await page.route((u) => u.pathname.startsWith('/api/'), (route) => {
    const body = BODIES[new URL(route.request().url()).pathname]
    return route.fulfill({
      status: body === undefined ? 404 : 200,
      contentType: 'application/json',
      body: JSON.stringify(body ?? { detail: 'not mocked' }),
    })
  })
  await page.route((u) => !['localhost', '127.0.0.1'].includes(u.hostname), (r) => r.abort())
}

const PAGES: [string, string][] = [
  ['library', '/'],
  ['new', '/new'],
  ['editor', `/p/${DECK_ID}`],
  ['settings-account', '/settings/account'],
  ['templates', '/templates'],
]

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ viewport: { width: 1440, height: 900 } })
    for (const [name, path] of PAGES) {
      test(`screenshot ${name}`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('theme', t), theme)
        await mock(page)
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await expect(page.locator('html')).toHaveClass(new RegExp(theme))
        await page.screenshot({ path: `test-results/theme/${theme}-${name}.png` })
      })
    }
  })
}

test('system follows the OS preference without a flash', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await mock(page)
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/light/)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('selector switches the theme and persists it', async ({ page }) => {
  await mock(page)
  await page.goto('/settings/account')
  await page.getByRole('radio', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveClass(/light/)
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/light/)
  await expect(page.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
})
