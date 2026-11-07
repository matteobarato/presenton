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
    // No avatar run yet.
    [`GET /api/v1/ppt/presentation/${DECK_ID}/videos/generate`]: json({ detail: 'Not found' }, 404),
    [`GET /api/v1/ppt/presentation/${DECK_ID}/videos/generate/preview`]: json({ language: 'en', languages: ['en'], slides: [] }),
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
    // The Narration tab follows the active slide.
    await expect(page.getByTestId('narration-slide')).toHaveText('Slide 2 of 3')
    const voice = page.getByTestId('slide-voice')
    await thumbnails.first().click()
    await expect(voice).toHaveAttribute('data-state', 'ready')
    await thumbnails.nth(2).click()
    await expect(voice).toHaveAttribute('data-state', 'missing')

    // Present starts from the selected slide (the third).
    await page.locator('header').getByRole('link', { name: 'Present' }).click()
    await expect(page).toHaveURL(`/p/${DECK_ID}/present?from=2`)
    await expect(page.getByTestId('counter')).toHaveText('3 / 3')
    await page.keyboard.press('ArrowLeft')
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

  test('templates: gallery → detail → lightbox → use', async ({ page }) => {
    const unexpected = await mockApi(page, {
      'GET /api/templates': json([]),
      'GET /api/v1/ppt/template/all': json(fixture('templates')),
      'GET /api/v1/ppt/template/c1': json(fixture('template')),
    })

    await page.goto('/templates')
    await expect(page.getByTestId('template-card')).toHaveCount(1)
    await page.getByRole('link', { name: 'View Pitch' }).click()
    await expect(page.getByRole('heading', { name: 'Pitch' })).toBeVisible()
    await expect(page.getByTestId('layout-card')).toHaveCount(2)

    await page.getByRole('button', { name: 'Preview layout 01' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('1 / 2')).toBeVisible()
    // No click inside the dialog first: arrow keys must work from the initial focus.
    await page.keyboard.press('ArrowRight')
    await expect(dialog.getByText('2 / 2')).toBeVisible()
    // Focus sits on the now-inactive Next button; ArrowLeft must still go back.
    await page.keyboard.press('ArrowLeft')
    await expect(dialog.getByText('1 / 2')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    await page.getByRole('button', { name: 'Use this template' }).click()
    await expect(page).toHaveURL(/\/new\?template=c1$/)
    await expect(page.getByRole('radio', { name: 'Pitch' })).toHaveAttribute('aria-checked', 'true')
    const mainImage = page.getByTestId('new-template-c1').getByTestId('template-main-image')
    await expect(mainImage).toBeVisible()
    await expect(mainImage).not.toContainText(/Loading|No preview/)
    await page.getByRole('radio', { name: 'Decide later' }).click()
    await expect(page).toHaveURL(/\/new$/)
    await page.getByRole('radio', { name: 'Pitch' }).click()
    await expect(page).toHaveURL(/\/new\?template=c1$/)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })
})

// --- On-slide editing -------------------------------------------------------------------------

interface PatchedSlide {
  ui?: { components: { id: string; position: { x: number; y: number }; elements: Record<string, unknown>[] }[] } | null
}
const editableDeck = fixture<{ slides: PatchedSlide[] } & Record<string, unknown>>('editable-presentation')
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Mocks the editor screens with an editable deck. PATCHes are recorded and served back on reload. */
async function editableApi(page: Page, overrides: Record<string, Handler> = {}) {
  const patches: { slides: PatchedSlide[] }[] = []
  const unexpected = await mockApi(page, {
    [`GET /api/v1/ppt/presentation/${DECK_ID}`]: json(deck),
    ...overrides,
  })
  await page.route(
    (url) => url.pathname === `/api/v1/ppt/presentation/${DECK_ID}`,
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const last = patches.at(-1)
      return json(last ? { ...editableDeck, slides: last.slides } : editableDeck)(route)
    },
  )
  await page.route(
    (url) => url.pathname === '/api/v1/ppt/presentation/update',
    (route) => {
      const body = route.request().postDataJSON() as { slides: PatchedSlide[] }
      patches.push(body)
      return json({ ...editableDeck, slides: body.slides ?? editableDeck.slides })(route)
    },
  )
  return { patches, unexpected }
}

const lastPatch = (patches: { slides: PatchedSlide[] }[]) => patches.at(-1)?.slides[0]?.ui
const component = (patches: { slides: PatchedSlide[] }[], id: string) =>
  lastPatch(patches)?.components.find((c) => c.id === id)
const textOf = (patches: { slides: PatchedSlide[] }[]) =>
  JSON.stringify(component(patches, 'headline')?.elements ?? null)

/** Centre of a slide-space point in page pixels, plus the px-per-slide-px scale. */
async function slidePoint(page: Page, x: number, y: number) {
  const box = await page.getByTestId('selection-overlay').boundingBox()
  if (!box) throw new Error('no selection overlay')
  const scale = box.width / 1280
  return { px: box.x + x * scale, py: box.y + y * scale, scale }
}

test.describe('on-slide editing (mocked)', () => {
  test('select, drag, persist across reload, undo and delete', async ({ page }) => {
    const { patches, unexpected } = await editableApi(page)
    await page.goto(`/p/${DECK_ID}`)
    const overlay = page.getByTestId('selection-overlay')
    await expect(overlay).toBeVisible()

    const start = await slidePoint(page, 300, 140)
    await page.mouse.click(start.px, start.py)
    await expect(page.getByRole('tab', { name: 'Element' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
    expect(patches).toHaveLength(0) // selecting alone does not save

    // Drag the text component right by 100 slide px (a 3px threshold applies first).
    await page.mouse.move(start.px, start.py)
    await page.mouse.down()
    await page.mouse.move(start.px + 40 * start.scale, start.py, { steps: 4 })
    await page.mouse.move(start.px + 100 * start.scale, start.py, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => component(patches, 'headline')?.position.x).toBeGreaterThan(150)
    const moved = component(patches, 'headline')!.position
    expect(moved.x).toBeCloseTo(200, -1) // within a snap of the 100px drag
    expect(moved.y).toBeCloseTo(80, -1)
    expect(component(patches, 'photo')!.position).toEqual({ x: 600, y: 200 })

    // The server state (last PATCH) is what a reload shows.
    await page.reload()
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    const again = await slidePoint(page, moved.x + 380, moved.y + 60)
    await page.mouse.click(again.px, again.py)
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
    const saved = patches.length
    await page.keyboard.press('Control+z')
    expect(patches.length).toBe(saved) // history starts empty after a reload: nothing to undo

    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect.poll(() => component(patches, 'headline')).toBeUndefined()
    await page.keyboard.press('Control+z')
    await expect.poll(() => component(patches, 'headline')?.position.x).toBe(moved.x)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('the Element tab lists the slide layers and navigates the selection', async ({ page }) => {
    const { patches, unexpected } = await editableApi(page)
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await page.getByRole('tab', { name: 'Element' }).click()
    const tree = page.getByRole('tree', { name: 'Slide layers' })
    await expect(tree).toBeVisible()
    const rows = tree.locator('[data-layer-row]')
    await expect(rows).not.toHaveCount(0)

    await rows.first().hover()
    await expect(page.locator('[data-hover-box]')).toBeVisible()
    await page.screenshot({ path: 'test-results/layers-tree.png' })

    await rows.first().locator('[data-layer-select]').click()
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
    const crumbs = page.getByRole('navigation', { name: 'Selection path' })
    await expect(crumbs).toBeVisible()
    await page.screenshot({ path: 'test-results/layers-selected.png' })

    await crumbs.getByRole('button', { name: 'Slide' }).click()
    await expect(tree).toBeVisible()
    expect(patches).toHaveLength(0)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('double-click edits text inline; Esc commits; Ctrl+Z restores', async ({ page }) => {
    const { patches, unexpected } = await editableApi(page)
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()

    const at = await slidePoint(page, 200, 120)
    await page.mouse.dblclick(at.px, at.py)
    const editor = page.locator('[data-inline-edit-layer] .ProseMirror')
    await expect(editor).toBeVisible()
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' world')
    await page.keyboard.press('Escape')
    await expect(editor).toHaveCount(0)
    await expect.poll(() => textOf(patches)).toContain('Hello world')
    await expect(page.locator('[data-slide-stage]').first()).toContainText('Hello world')

    await page.keyboard.press('Control+z')
    await expect.poll(() => textOf(patches)).not.toContain('world')
    expect(textOf(patches)).toContain('Hello')
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('replacing an image through the Upload tab saves the new source', async ({ page }) => {
    const { patches, unexpected } = await editableApi(page, {
      'POST /api/v1/ppt/images/upload': json({ id: 'up-1', path: '/app_data/images/uploaded.png' }),
    })
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()

    const at = await slidePoint(page, 750, 300)
    await page.mouse.click(at.px, at.py)
    await page.getByRole('button', { name: 'Replace image' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: PNG })
    await expect(dialog).toHaveCount(0)
    await expect
      .poll(() => JSON.stringify(component(patches, 'photo')?.elements ?? null))
      .toContain('/app_data/images/uploaded.png')
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('smart slides get no selection overlay', async ({ page }) => {
    const { unexpected } = await editableApi(page)
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await page.getByRole('button', { name: 'Slide 2', exact: true }).click()
    await expect(page.frameLocator('iframe').first().getByText('Smart slide survives')).toBeAttached()
    await expect(page.getByTestId('selection-overlay')).toHaveCount(0)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('no overlay while the deck is generating', async ({ page }) => {
    const { unexpected } = await editableApi(page, {
      // The stream never produces an event, so the deck stays in the generating state.
      [`GET /api/v1/ppt/presentation/stream/${DECK_ID}`]: () => new Promise<void>(() => {}),
    })
    await page.goto(`/p/${DECK_ID}?stream=1`)
    await expect(page.getByRole('complementary', { name: 'Slides' }).locator('button[data-slide-key]').first()).toBeVisible()
    await expect(page.getByTestId('selection-overlay')).toHaveCount(0)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })
})
