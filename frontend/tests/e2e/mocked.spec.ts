import { readFileSync } from 'node:fs'
import { expect, test, type Page, type Route } from '@playwright/test'

const fixture = <T = unknown>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as T

const DECK_ID = '11111111-1111-4111-8111-111111111111'
const decks = fixture<{ id: string }[]>('presentations')
const deck = fixture('presentation')

type Handler = (route: Route) => Promise<void> | void
const json = (body: unknown, status = 200): Handler => (route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/**
 * Serves every API call the visited screens make. Anything else under /api is
 * recorded in `unexpected` so the test fails instead of silently hitting a dead proxy.
 */
async function mockApi(page: Page, overrides: Record<string, Handler> = {}) {
  const unexpected: string[] = []
  const routes: Record<string, Handler> = {
    'GET /api/v1/auth/status': json({ configured: true, authenticated: true, username: 'e2e', role: 'admin' }),
    'GET /api/runtime-config': json({ configured: true, config: { PRESENTATION_GENERATION_MODE: 'standard' } }),
    'GET /api/v1/ppt/presentation/all': json(decks),
    [`GET /api/v1/ppt/presentation/${DECK_ID}`]: json(deck),
    'GET /api/v1/ppt/themes/all': json(fixture('themes')),
    'GET /api/v1/ppt/presentation/speaker-notes/tts/languages': json(fixture('languages')),
    [`GET /api/v1/ppt/presentation/${DECK_ID}/speaker-notes/tts`]: json(fixture('tts')),
    [`GET /api/v1/ppt/presentation/${DECK_ID}/playback`]: json(fixture('playback')),
    [`GET /api/v1/ppt/presentation/${DECK_ID}/videos`]: json(fixture('videos')),
    'GET /api/v1/ppt/chat/conversations': json([]),
    ...overrides,
  }

  // Playwright tries the most recently registered route first: register the catch-all first.
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const url = new URL(route.request().url())
    unexpected.push(`${route.request().method()} ${url.pathname}${url.search}`)
    return route.fulfill({ status: 599, contentType: 'application/json', body: '{"detail":"unmocked"}' })
  })
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => {
      const request = route.request()
      const handler = routes[`${request.method()} ${new URL(request.url()).pathname}`]
      if (handler) return handler(route)
      return route.fallback()
    },
  )
  // Audio files and anything off-origin (web fonts) are not part of the test.
  await page.route('**/app_data/**', (route) => route.fulfill({ status: 200, contentType: 'audio/mpeg', body: '' }))
  await page.route(
    (url) => !['localhost', '127.0.0.1'].includes(url.hostname),
    (route) => route.abort(),
  )
  return unexpected
}

test.describe('mocked backend', () => {
  test('library to editor to present and back', async ({ page }) => {
    const unexpected = await mockApi(page)

    await page.goto('/')
    await expect(page.getByTestId('deck')).toHaveCount(2)
    await expect(page.getByRole('link', { name: 'Settings (classic app)' })).toHaveAttribute('href', '/settings')

    await page.getByRole('link', { name: 'Open Quarterly Review' }).click()
    await expect(page).toHaveURL(`/p/${DECK_ID}`)

    const thumbnails = page.getByRole('complementary', { name: 'Slides' }).locator('button[data-slide-key]')
    await expect(thumbnails).toHaveCount(3)
    await expect(thumbnails.first()).toHaveAttribute('aria-current', 'true')
    await expect(page.getByText("Can't render this slide")).toHaveCount(0)

    await page.keyboard.press('ArrowDown')
    await expect(thumbnails.nth(1)).toHaveAttribute('aria-current', 'true')

    await page.getByRole('tab', { name: 'Narration' }).click()
    const rows = page.getByRole('list', { name: 'Slide narration' }).getByRole('listitem')
    await expect(rows).toHaveCount(3)
    await expect(rows.first()).toHaveAttribute('data-state', 'ready')
    await expect(rows.nth(2)).toHaveAttribute('data-state', 'missing')

    await page.locator('header').getByRole('link', { name: 'Present' }).click()
    await expect(page).toHaveURL(`/p/${DECK_ID}/present`)
    await expect(page.getByTestId('counter')).toHaveText('1 / 3')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('counter')).toHaveText('2 / 3')
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(`/p/${DECK_ID}`)

    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('the smart slide renders next to template slides', async ({ page }) => {
    const unexpected = await mockApi(page)
    await page.goto(`/p/${DECK_ID}`)
    await page.getByRole('button', { name: 'Slide 3', exact: true }).click()
    await expect(page.getByText("Can't render this slide")).toHaveCount(0)
    await expect(page.frameLocator('iframe').first().getByText('Smart slide survives')).toBeAttached()
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('a 503 from the backend is reported without crashing the app', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const unexpected = await mockApi(page, {
      'GET /api/v1/ppt/presentation/all': json({ detail: 'Service Unavailable' }, 503),
    })

    await page.goto('/')
    await expect(page.getByRole('alert').filter({ hasText: /Service Unavailable|Could not load/ }).first()).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    expect(errors).toEqual([])
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('an aborted connection shows the unreachable banner', async ({ page }) => {
    const unexpected = await mockApi(page, {
      'GET /api/v1/ppt/presentation/all': (route) => route.abort('connectionrefused'),
    })

    await page.goto('/')
    await expect(page.getByText("Can't reach the Presenton backend")).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    expect(unexpected, 'API calls without a mock').toEqual([])
  })
})
