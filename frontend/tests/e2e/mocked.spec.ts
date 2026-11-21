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
    'GET /api/v1/ppt/presentation/speaker-notes/tts/languages': json(fixture('languages')),
    [`GET /api/v1/ppt/presentation/${DECK_ID}/speaker-notes/tts`]: json(fixture('tts')),
    [`GET /api/v1/ppt/presentation/${DECK_ID}/playback`]: json(fixture('playback')),
    [`GET /api/v1/ppt/presentation/${DECK_ID}/videos`]: json(fixture('videos')),
    // No avatar run yet.
    [`GET /api/v1/ppt/presentation/${DECK_ID}/videos/generate`]: json({ detail: 'Not found' }, 404),
    [`GET /api/v1/ppt/presentation/${DECK_ID}/videos/generate/preview`]: json({ language: 'en', languages: ['en'], slides: [] }),
    'GET /api/v1/ppt/chat/conversations': json([]),
    [`GET /api/v1/ppt/presentation/${DECK_ID}/animations`]: json({ slides: [] }),
    // The editor header reads the deck's wizard progress, which names the template.
    'GET /api/templates': json([]),
    'GET /api/v1/ppt/template/all': json(fixture('templates')),
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
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings/text')

    await page.getByRole('link', { name: 'Open Quarterly Review' }).click()
    await expect(page).toHaveURL(`/p/${DECK_ID}`)

    const thumbnails = page.getByRole('complementary', { name: 'Slides' }).locator('button[data-slide-key]')
    await expect(thumbnails).toHaveCount(3)
    await expect(thumbnails.first()).toHaveAttribute('aria-current', 'true')
    await expect(page.getByText("Can't render this slide")).toHaveCount(0)

    await page.keyboard.press('ArrowDown')
    await expect(thumbnails.nth(1)).toHaveAttribute('aria-current', 'true')

    // The footer's Voice tab (the sidebar no longer has a Narration tab) follows the active slide.
    await page.getByRole('tab', { name: 'Voice' }).click()
    await expect(page.getByTestId('narration-slide')).toHaveText('Slide 2 of 3')
    const voice = page.getByTestId('slide-voice')
    await thumbnails.first().click()
    await expect(voice).toHaveAttribute('data-state', 'ready')
    await thumbnails.nth(2).click()
    await expect(voice).toHaveAttribute('data-state', 'missing')

    // Avatar video options are in the sidebar's Avatar tab, never in the footer.
    await expect(page.getByTestId('slide-avatar')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Avatar' }).click()
    await expect(page.getByTestId('slide-avatar')).toBeVisible()

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
    await expect(page.getByText("Can't reach the Slideshows backend")).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('templates: gallery → detail → lightbox → use', async ({ page }) => {
    const unexpected = await mockApi(page, {
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
    // The chosen template shows in the step strip; the Topic step holds the picker.
    await expect(page.getByTestId('step-topic')).toContainText('Pitch')
    await expect(page.getByRole('radio', { name: 'Pitch' })).toHaveAttribute('aria-checked', 'true')
    const mainImage = page.getByTestId('new-template-c1').getByTestId('template-main-image')
    await expect(mainImage).toBeVisible()
    await expect(mainImage).not.toContainText(/Loading|No preview/)
    // The wizard needs a template: there is no "Decide later" here.
    await expect(page.getByRole('radio', { name: 'Decide later' })).toHaveCount(0)
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

const ICON_RESULTS = ['/static/icons/bold/star-bold.png', '/static/icons/bold/starfish-bold.png']

/** Mocks the editor screens with an editable deck. PATCHes are recorded and served back on reload. */
async function editableApi(page: Page, overrides: Record<string, Handler> = {}, deck: typeof editableDeck = editableDeck) {
  const patches: { slides: PatchedSlide[] }[] = []
  const unexpected = await mockApi(page, {
    [`GET /api/v1/ppt/presentation/${DECK_ID}`]: json(deck),
    'GET /api/v1/ppt/icons/search': json(ICON_RESULTS),
    ...overrides,
  })
  await page.route('**/static/icons/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  await page.route(
    (url) => url.pathname === `/api/v1/ppt/presentation/${DECK_ID}`,
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const last = patches.at(-1)
      return json(last ? { ...deck, slides: last.slides } : deck)(route)
    },
  )
  await page.route(
    (url) => url.pathname === '/api/v1/ppt/presentation/update',
    (route) => {
      const body = route.request().postDataJSON() as { slides: PatchedSlide[] }
      patches.push(body)
      return json({ ...deck, slides: body.slides ?? deck.slides })(route)
    },
  )
  return { patches, unexpected }
}

const lastPatch = (patches: { slides: PatchedSlide[] }[]) => patches.at(-1)?.slides[0]?.ui
const component = (patches: { slides: PatchedSlide[] }[], id: string) =>
  lastPatch(patches)?.components.find((c) => c.id === id)
interface ElementRecord {
  fill?: { color: string } | null
  stroke?: { width: number; dash?: number[] | null } | null
  end_marker?: string
  start_marker?: string
  color: string
  data?: string
  marker?: string
  opacity?: number
  shadow?: unknown
}
const elementOf = (patches: { slides: PatchedSlide[] }[], id: string) => component(patches, id)?.elements[0] as ElementRecord | undefined
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

  test('the Layers tab lists the slide layers and navigates the selection', async ({ page }) => {
    const { patches, unexpected } = await editableApi(page)
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await page.getByRole('tab', { name: 'Layers' }).click()
    const tree = page.getByRole('tree', { name: 'Slide layers' })
    await expect(tree).toBeVisible()
    const rows = tree.locator('[data-layer-row]')
    await expect(rows).not.toHaveCount(0)

    await rows.first().hover()
    await expect(page.locator('[data-hover-box]')).toBeVisible()
    await page.screenshot({ path: 'test-results/layers-tree.png' })

    await rows.first().locator('[data-layer-select]').click()
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
    await expect(tree.locator('[data-layer-select][aria-current="true"]')).toHaveCount(1)
    await page.screenshot({ path: 'test-results/layers-selected.png' })

    // The tree stays up with a selection, and the inspector tab did not change.
    await expect(tree).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Layers' })).toHaveAttribute('aria-selected', 'true')
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

  test('insert a Title: selected, persists across reload, undo removes it', async ({ page }) => {
    const { patches, unexpected } = await editableApi(page, {
      'GET /api/v1/ppt/template/modern': json(fixture('template-blocks')),
    })
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    const original = editableDeck.slides[0].ui!.components.length

    const selectionBox = page.locator('[data-selection-box]')
    await expect(selectionBox).toHaveCount(0) // nothing selected yet

    await page.getByRole('button', { name: 'Insert', exact: true }).click()
    await page.getByRole('button', { name: 'Insert Title', exact: true }).click()
    await expect.poll(() => lastPatch(patches)?.components.length).toBe(original + 1)
    await expect(page.getByRole('tab', { name: 'Insert' })).toHaveAttribute('aria-selected', 'true')
    // Only the freshly inserted component can be selected here.
    await expect(selectionBox).toHaveCount(1)

    // Undo removes it again (focus stays on the tile, so use the shortcut on the page).
    await page.keyboard.press('Control+z')
    await expect.poll(() => lastPatch(patches)?.components.length).toBe(original)

    // Insert once more: the server state (last PATCH) is what a reload shows.
    await page.getByRole('button', { name: 'Insert Title', exact: true }).click()
    await expect.poll(() => lastPatch(patches)?.components.length).toBe(original + 1)
    await page.reload()
    await expect(page.locator('[data-slide-stage]').first()).toBeVisible()
    expect(lastPatch(patches)?.components).toHaveLength(original + 1)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('insert a template block variant', async ({ page }) => {
    const { patches, unexpected } = await editableApi(page, {
      'GET /api/v1/ppt/template/modern': json(fixture('template-blocks')),
    })
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await page.getByRole('button', { name: 'Insert', exact: true }).click()
    await page.getByRole('button', { name: 'Insert Metric Cards' }).click()
    await expect.poll(() => JSON.stringify(lastPatch(patches) ?? null)).toContain('42%')
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('cancelling the image picker inserts nothing', async ({ page }) => {
    const { patches, unexpected } = await editableApi(page, {
      'GET /api/v1/ppt/template/modern': json(fixture('template-blocks')),
    })
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await page.getByRole('button', { name: 'Insert', exact: true }).click()
    await page.getByRole('button', { name: 'Insert Image', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(patches).toHaveLength(0)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  // Docked inspector widths (motion.css): 240px up to 1279px, 260px, then 280px from 1600px.
  for (const width of [1100, 1300, 1700]) {
    test(`the inspector tab strip fits the docked inspector at ${width}px`, async ({ page }) => {
      const unexpected = await mockApi(page, { 'GET /api/v1/ppt/template/modern': json(fixture('template-blocks')) })
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/p/${DECK_ID}`)
      const list = page.getByRole('tablist', { name: 'Inspector sections' })
      await expect(list).toBeVisible()
      const tabs = list.getByRole('tab')
      await expect(tabs).toHaveCount(5)
      for (const name of ['Layers', 'Insert', 'Design', 'Motion', 'Avatar']) {
        await list.getByRole('tab', { name }).click()
        await expect(list.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true')
        const fit = await list.evaluate((el) => {
          const box = el.getBoundingClientRect()
          return {
            overflow: el.scrollWidth - el.clientWidth,
            outside: [...el.querySelectorAll('[role="tab"]')].filter((t) => {
              const r = t.getBoundingClientRect()
              return r.left < box.left - 0.5 || r.right > box.right + 0.5
            }).length,
          }
        })
        expect(fit, `${name} active`).toEqual({ overflow: 0, outside: 0 })
      }
      await page.getByRole('tab', { name: 'Insert' }).click()
      await list.screenshot({ path: `/tmp/claude-1000/-var-www-presenton/9a49d1de-f03d-46e6-9382-5baa95b1d623/scratchpad/tabs-${width}.png` })
      expect(unexpected, 'API calls without a mock').toEqual([])
    })
  }

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

// --- Motion editor -----------------------------------------------------------------------------

interface Tween {
  target: string
  from_values: Record<string, number>
  duration: number
  delay: number
  ease: string
}

test.describe('motion editor (mocked)', () => {
  const MOTION_WINDOW = 2.5
  // The template slide of the editable deck; its layers render as `data-hf-el="e0…"` in the shadow root.
  const entry = {
    slide_id: 'aaaaaaaa-0000-4000-8000-000000000000',
    index: 0,
    status: 'fresh',
    source: 'llm',
    reset_from_user: false,
    tweens: [] as Tween[],
    targets: [
      { id: 'e0', kind: 'shape', text: '' },
      { id: 'e1', kind: 'text', text: 'Headline' },
      { id: 'e2', kind: 'image', text: '' },
    ],
  }

  /** Editable deck with a planned-but-empty motion plan; PUT bodies are recorded and served back. */
  async function open(page: Page) {
    const puts: { tweens: Tween[] }[] = []
    const { unexpected } = await editableApi(page, {
      [`GET /api/v1/ppt/presentation/${DECK_ID}/animations`]: json({ slides: [entry] }),
      [`PUT /api/v1/ppt/presentation/${DECK_ID}/animations/0`]: (route) => {
        const body = route.request().postDataJSON() as { tweens: Tween[] }
        puts.push(body)
        return json({ ...entry, source: 'user', tweens: body.tweens })(route)
      },
    })
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await expect(page.locator('[data-hf-el="e0"]')).toBeAttached()

    await page.getByRole('tablist', { name: 'Inspector sections' }).getByRole('tab', { name: 'Motion' }).click()
    await page.getByRole('tablist', { name: 'Notes, voice and motion' }).getByRole('tab', { name: 'Motion' }).click()
    await expect(page.getByRole('region', { name: 'Animation timeline' })).toBeVisible()
    return { puts, unexpected }
  }

  test('motion editor: Rise, drag the clip, Play saves the plan', async ({ page }) => {
    const { puts, unexpected } = await open(page)

    // The first element is selected by default; Rise gives it a clip on the timeline.
    await page.getByRole('region', { name: 'Motion' }).getByRole('button', { name: 'Rise', exact: true }).click()
    const clip = page.locator('[data-motion-clip="e0"]')
    await expect(clip).toBeVisible()
    await clip.scrollIntoViewIfNeeded()

    // Drag it right by 0.8 s worth of lane (the timeline rounds to 0.1 s and clamps to the window).
    const box = await clip.boundingBox()
    const lane = await clip.locator('..').boundingBox()
    if (!box || !lane) throw new Error('no clip or lane box')
    const dx = (0.8 / MOTION_WINDOW) * lane.width
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx / 2, y, { steps: 4 })
    await page.mouse.move(x + dx, y, { steps: 4 })
    await page.mouse.up()
    const maxDelay = Math.floor((MOTION_WINDOW - 0.6) * 10 + 1e-6) / 10
    const expected = Math.min(maxDelay, Math.max(0, Math.round((dx / lane.width) * MOTION_WINDOW * 10) / 10))

    await page.getByRole('button', { name: 'Play animation' }).click()

    await expect.poll(() => puts.at(-1)?.tweens[0]?.delay ?? 0).toBeGreaterThan(0)
    const tweens = puts.at(-1)!.tweens
    expect(tweens).toHaveLength(1)
    expect(tweens[0].target).toBe('e0')
    expect(tweens[0].from_values).toEqual({ opacity: 0, y: 32 })
    // One 0.1 s step of slack for sub-pixel lane geometry.
    expect(Math.abs(tweens[0].delay - expected)).toBeLessThanOrEqual(0.1 + 1e-9)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('motion editor: Play styles the element inline; Stop restores the slide', async ({ page }) => {
    const { unexpected } = await open(page)
    await page.getByRole('region', { name: 'Motion' }).getByRole('button', { name: 'Rise', exact: true }).click()
    await expect(page.locator('[data-motion-clip="e0"]')).toBeVisible()

    // The layer is in the slide's shadow root; CSS locators pierce it.
    const layer = page.locator('[data-hf-el="e0"]')
    const before = await layer.getAttribute('style')
    const inline = () => layer.evaluate((el: HTMLElement) => ({ opacity: el.style.opacity, transform: el.style.transform }))
    expect(await inline()).toEqual({ opacity: '', transform: '' })

    await page.getByRole('button', { name: 'Play animation' }).click()
    await expect.poll(async () => (await inline()).opacity).not.toBe('')
    expect(await layer.getAttribute('style')).not.toBe(before)

    await page.getByRole('button', { name: 'Stop and restore slide' }).click()
    await expect.poll(inline).toEqual({ opacity: '', transform: '' })
    expect(await layer.getAttribute('style')).toBe(before)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })
})

test.describe('present mode motion (mocked)', () => {
  const planned = (status: string, tweens: Tween[]) => ({
    slide_id: 'aaaaaaaa-0000-4000-8000-000000000000',
    index: 0,
    status,
    source: 'user',
    reset_from_user: false,
    tweens,
    targets: [{ id: 'e0', kind: 'shape', text: '' }],
  })
  const rise: Tween = { target: 'e0', from_values: { opacity: 0, y: 32 }, duration: 0.6, delay: 0, ease: 'power2.out' }

  test('the stored entrance plan plays when a slide is shown', async ({ page }) => {
    await editableApi(page, {
      [`GET /api/v1/ppt/presentation/${DECK_ID}/animations`]: json({ slides: [planned('fresh', [rise])] }),
    })
    await page.goto(`/p/${DECK_ID}/present`)
    const layer = page.locator('[data-present-stage] [data-hf-el="e0"]')
    await expect(layer).toBeAttached()
    // GSAP writes inline styles while it plays and leaves the end state in place.
    await expect.poll(() => layer.evaluate((el: HTMLElement) => el.style.opacity)).not.toBe('')
    await expect.poll(() => layer.evaluate((el: HTMLElement) => el.style.opacity)).toBe('1')
  })

  test('a plan whose layout changed is not played', async ({ page }) => {
    await editableApi(page, {
      [`GET /api/v1/ppt/presentation/${DECK_ID}/animations`]: json({ slides: [planned('stale_layout', [rise])] }),
    })
    await page.goto(`/p/${DECK_ID}/present`)
    await expect(page.locator('[data-present-stage]')).toBeVisible()
    await expect(page.locator('[data-present-stage] [data-hf-el="e0"]')).toHaveCount(0)
  })
})

// --- Visual element editing --------------------------------------------------------------------

const visualDeck = fixture<typeof editableDeck>('visual-presentation')
const rotationOf = (patches: { slides: PatchedSlide[] }[], id: string) =>
  ((component(patches, id) as { rotation?: number } | undefined)?.rotation ?? 0)

test.describe('visual element editing (mocked)', () => {
  /** Opens the visual deck with `id`'s component selected (clicked at a slide point inside it). */
  async function open(page: Page, at: [number, number], overrides: Record<string, Handler> = {}) {
    const api = await editableApi(page, overrides, visualDeck)
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await select(page, at)
    return api
  }
  async function select(page: Page, [x, y]: [number, number]) {
    const p = await slidePoint(page, x, y)
    await page.mouse.click(p.px, p.py)
  }
  const box = async (page: Page) => (await page.locator('[data-selection-box]').first().boundingBox())!
  const centre = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  /** Turns the selection by dragging the rotate handle to the left of the box centre (a quarter turn clockwise). */
  async function rotateQuarter(page: Page) {
    const c = centre(await box(page))
    const h = centre((await page.locator('[data-rotate-handle]').boundingBox())!)
    const r = Math.hypot(h.x - c.x, h.y - c.y)
    await page.mouse.move(h.x, h.y)
    await page.mouse.down()
    await page.mouse.move(c.x - r / 2, c.y + r / 2, { steps: 5 })
    await page.mouse.move(c.x - r, c.y, { steps: 5 })
    await expect(page.locator('[data-rotate-badge]')).toBeVisible()
    await page.mouse.up()
  }
  const SHAPE: [number, number] = [200, 160]

  test('rotating with the handle persists across reload; Ctrl+Z restores and Ctrl+Shift+Z redoes', async ({ page }) => {
    const { patches, unexpected } = await open(page, SHAPE)
    await expect(page.locator('[data-rotate-handle]')).toBeVisible()
    await rotateQuarter(page)
    await expect.poll(() => rotationOf(patches, 'shape')).toBeGreaterThan(80)
    expect(rotationOf(patches, 'shape')).toBeCloseTo(90, -1)
    await expect(page.locator('[data-rotate-badge]')).toHaveCount(0)

    await page.keyboard.press('Control+z')
    await expect.poll(() => rotationOf(patches, 'shape')).toBe(0)

    await page.keyboard.press('Control+Shift+z')
    await expect.poll(() => rotationOf(patches, 'shape')).toBeGreaterThan(80)
    expect(rotationOf(patches, 'shape')).toBeCloseTo(90, -1)
    await page.reload()
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    expect(rotationOf(patches, 'shape')).toBeCloseTo(90, -1)
    await select(page, SHAPE)
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Rotation' })).toHaveValue(/^(8[5-9]|9[0-5])/)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('hit-testing follows the rotated shape, not its unrotated bounds', async ({ page }) => {
    const { patches, unexpected } = await open(page, SHAPE)
    await rotateQuarter(page)
    await expect.poll(() => rotationOf(patches, 'shape')).toBeGreaterThan(80)
    const slide = (await page.getByTestId('selection-overlay').boundingBox())!

    // The rotated shape is 120 wide x 200 tall around (200,160): (200,70) is inside it but outside the old bounds.
    await select(page, [450, 450]) // elsewhere, so the shape is not selected
    const isShapeSelected = async () => {
      const b = await box(page)
      return b.height > b.width && b.height < slide.height * 0.5 && b.height > (200 * slide.width) / 1280 - 4
    }
    expect(await isShapeSelected()).toBe(false)
    await select(page, [200, 70])
    await expect.poll(isShapeSelected).toBe(true)

    // (105,105) is a corner of the old bounds that the rotated shape left empty: it falls through to the background.
    await select(page, [450, 450])
    await select(page, [105, 105])
    const b = await box(page)
    expect(b.width).toBeGreaterThan(slide.width * 0.9)
    expect(patches.length).toBe(1) // only the rotation was saved
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('resizing a rotated shape keeps the opposite corner in place', async ({ page }) => {
    const { patches, unexpected } = await open(page, SHAPE)
    await rotateQuarter(page)
    await expect.poll(() => rotationOf(patches, 'shape')).toBeGreaterThan(80)
    const corner = async (h: string) => centre((await page.locator(`[data-handle="${h}"]`).first().boundingBox())!)
    const scale = (await page.getByTestId('selection-overlay').boundingBox())!.width / 1280
    const anchor = await corner('nw')
    const grip = await corner('se')
    const before = (await box(page))
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    // Outward: away from the anchored corner, whichever way the rotation sent the handle.
    const len = Math.hypot(grip.x - anchor.x, grip.y - anchor.y)
    const out = { x: (grip.x - anchor.x) / len, y: (grip.y - anchor.y) / len }
    await page.mouse.move(grip.x + out.x * 20 * scale, grip.y + out.y * 20 * scale, { steps: 4 })
    await page.mouse.move(grip.x + out.x * 60 * scale, grip.y + out.y * 60 * scale, { steps: 6 })
    await page.mouse.up()
    await expect.poll(() => patches.length).toBe(2)
    const after = await corner('nw')
    expect(Math.abs(after.x - anchor.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(after.y - anchor.y)).toBeLessThanOrEqual(2)
    const now = await box(page)
    expect(now.width * now.height).toBeGreaterThan(before.width * before.height)
    expect(rotationOf(patches, 'shape')).toBeCloseTo(90, -1)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('Shape: fill toggle and palette colour, stroke width and dash', async ({ page }) => {
    const { patches, unexpected } = await open(page, SHAPE)
    await page.getByRole('button', { name: 'Shape', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Shape' })
    const fill = page.getByRole('switch', { name: 'Fill' })
    await fill.click()
    // Only a saved PATCH counts: before one exists there is nothing to read.
    await expect.poll(() => (patches.length ? (elementOf(patches, 'shape')?.fill ?? null) : 'no patch yet')).toBeNull()
    await fill.click()
    await expect.poll(() => elementOf(patches, 'shape')?.fill?.color).toBe('#3366FF')

    await panel.getByRole('button', { name: 'Fill colour', exact: true }).click()
    const swatch = page.getByRole('button', { name: /^#[0-9a-f]{6}$/i }).nth(1)
    const hex = (await swatch.getAttribute('aria-label'))!
    await swatch.click()
    await expect.poll(() => elementOf(patches, 'shape')?.fill?.color.toLowerCase()).toBe(hex.toLowerCase())

    await page.getByRole('switch', { name: 'Stroke' }).click()
    await expect.poll(() => elementOf(patches, 'shape')?.stroke?.width).toBe(1.5)
    const width = page.getByRole('textbox', { name: 'Width', exact: true })
    await width.fill('4')
    await width.press('Enter')
    await expect.poll(() => elementOf(patches, 'shape')?.stroke?.width).toBe(4)
    await page.getByRole('group', { name: 'Dash' }).getByRole('button', { name: 'Dashed' }).click()
    await expect.poll(() => elementOf(patches, 'shape')?.stroke?.dash).toEqual([12, 8])
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('Line: filled arrow end and swap ends', async ({ page }) => {
    const { patches, unexpected } = await open(page, [550, 150])
    await page.getByRole('button', { name: 'Line', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Line ends' })).toBeVisible()
    await page.getByRole('button', { name: 'End', exact: true }).click()
    await page.getByRole('option', { name: 'Filled arrow' }).click()
    await expect.poll(() => elementOf(patches, 'arrow')?.end_marker).toBe('triangle')
    await page.getByRole('button', { name: 'Swap ends' }).click()
    await expect.poll(() => elementOf(patches, 'arrow')?.start_marker).toBe('triangle')
    expect(elementOf(patches, 'arrow')?.end_marker).toBe('none')
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('Icon: colour swatch and replacing the icon from search', async ({ page }) => {
    const { patches, unexpected } = await open(page, [832, 132])
    await page.getByRole('button', { name: 'Icon', exact: true }).click()
    await page.getByRole('dialog', { name: 'Icon' }).getByRole('button', { name: 'Icon colour', exact: true }).click()
    const swatch = page.getByRole('button', { name: /^#[0-9a-f]{6}$/i }).first()
    const hex = (await swatch.getAttribute('aria-label'))!
    await swatch.click()
    await expect.poll(() => elementOf(patches, 'icon')?.color.toLowerCase()).toBe(hex.toLowerCase())

    await page.getByRole('dialog', { name: 'Icon' }).getByRole('button', { name: 'Change icon', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('searchbox', { name: 'Search icons' }).fill('star')
    await expect(dialog.getByRole('button', { name: /^Icon \d$/ })).toHaveCount(2)
    await dialog.getByRole('button', { name: 'Icon 2' }).click()
    await dialog.getByRole('button', { name: 'Replace' }).click()
    await expect.poll(() => elementOf(patches, 'icon')?.data).toBe(ICON_RESULTS[1])
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('List: number marker', async ({ page }) => {
    const { patches, unexpected } = await open(page, [300, 480])
    await page.getByRole('button', { name: 'Text', exact: true }).click()
    await page.getByRole('group', { name: 'Marker' }).getByRole('button', { name: 'Number' }).click()
    await expect.poll(() => elementOf(patches, 'bullets')?.marker).toBe('number')
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('Appearance: opacity and shadow', async ({ page }) => {
    const { patches, unexpected } = await open(page, [832, 132])
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    const opacity = page.getByRole('textbox', { name: 'Opacity', exact: true })
    await opacity.fill('50')
    await opacity.press('Enter')
    await expect.poll(() => elementOf(patches, 'icon')?.opacity).toBe(0.5)

    await page.getByRole('switch', { name: 'Shadow' }).click()
    await expect
      .poll(() => elementOf(patches, 'icon')?.shadow)
      .toEqual({ color: '#000000', blur: 10, opacity: 0.18, offset_x: 6, offset_y: 6 })
    expect(unexpected, 'API calls without a mock').toEqual([])
  })
})

// --- Table and chart editing -------------------------------------------------------------------

const dataDeck = fixture<typeof editableDeck>('data-presentation')
interface RawCell { runs: { text: string }[] }
interface DataElement {
  rows?: RawCell[][]
  chart_type?: string
  series?: { name: string; values: number[] }[]
}
const dataElementOf = (patch: { slides: PatchedSlide[] } | undefined, id: string) =>
  patch?.slides.flatMap((s) => s.ui?.components ?? []).find((c) => c.id === id)?.elements[0] as DataElement | undefined
/** Body rows plus the header: what the table reports as its row count. */
const tableRowCount = (patch: { slides: PatchedSlide[] } | undefined) => {
  const rows = dataElementOf(patch, 'table')?.rows
  return rows ? rows.length + 1 : 0
}

test.describe('table and chart editing (mocked)', () => {
  // The table sits at (100,100) and is 600x300: its 3x3 cells are 200x100. Cell (r,c) centres at (200+200c, 150+100r).
  const cellPoint = (row: number, col: number): [number, number] => [200 + 200 * col, 150 + 100 * row]

  async function open(page: Page, slide = 1) {
    const api = await editableApi(page, {}, dataDeck)
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    if (slide > 1) {
      const thumb = page.getByRole('button', { name: `Slide ${slide}`, exact: true })
      await thumb.click()
      await expect(thumb).toHaveAttribute('aria-current', 'true')
      await expect(page.getByTestId('selection-overlay')).toBeVisible()
    }
    return api
  }
  async function click(page: Page, [x, y]: [number, number], options: { clickCount?: number } = {}) {
    const p = await slidePoint(page, x, y)
    await page.mouse.click(p.px, p.py, options)
  }
  /** The slide switch cross-fades, so the new overlay can lag the thumbnail: click until the chart is selected. */
  async function selectChart(page: Page) {
    await expect(async () => {
      await click(page, [400, 300])
      await expect(page.getByRole('combobox', { name: 'Chart type' })).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 10_000 })
  }
  /** First click selects the table, the second (no movement) picks the cell. */
  async function selectCell(page: Page, row: number, col: number) {
    await click(page, cellPoint(row, col))
    await click(page, cellPoint(row, col))
    const outline = page.locator('[data-table-cell-outline]')
    await expect(outline).toHaveAttribute('data-row', String(row))
    await expect(outline).toHaveAttribute('data-col', String(col))
  }

  test('editing a table cell in place persists across reload', async ({ page }) => {
    const { patches, unexpected } = await open(page)
    await selectCell(page, 1, 1)
    await click(page, cellPoint(1, 1), { clickCount: 2 })
    const editor = page.locator('.ProseMirror')
    await expect(editor).toBeVisible()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('Edited')
    await page.keyboard.press('Escape')
    await expect.poll(() => dataElementOf(patches.at(-1), 'table')?.rows?.[0]?.[1]?.runs.map((r) => r.text).join('')).toBe('Edited')

    await page.reload()
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await expect(page.getByTestId('selection-overlay').locator('xpath=..').getByText('Edited').first()).toBeAttached()
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('add and delete a row from the Element tab; Ctrl+Z restores it', async ({ page }) => {
    const { patches, unexpected } = await open(page)
    await selectCell(page, 1, 0)
    await page.getByRole('button', { name: 'Add row', exact: true }).click()
    await expect.poll(() => tableRowCount(patches.at(-1))).toBe(4)
    await page.getByRole('button', { name: 'Delete row', exact: true }).click()
    await expect.poll(() => tableRowCount(patches.at(-1))).toBe(3)
    await page.keyboard.press('Control+z')
    await expect.poll(() => tableRowCount(patches.at(-1))).toBe(4)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('chart type switches to line and saves', async ({ page }) => {
    const { patches, unexpected } = await open(page, 2)
    await selectChart(page)
    await page.getByRole('combobox', { name: 'Chart type' }).selectOption({ label: 'Line Chart' })
    await expect.poll(() => dataElementOf(patches.at(-1), 'chart')?.chart_type).toBe('line')
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('Edit data saves one PATCH and Ctrl+Z undoes it in one step', async ({ page }) => {
    const { patches, unexpected } = await open(page, 2)
    await selectChart(page)
    await page.getByRole('button', { name: 'Edit data', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const value = dialog.getByRole('textbox', { name: 'Value 1,1', exact: true })
    await expect(value).toHaveValue('10')
    await value.fill('99')
    await dialog.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => dataElementOf(patches.at(-1), 'chart')?.series?.[0]?.values[0]).toBe(99)
    expect(patches).toHaveLength(1)

    await page.keyboard.press('Control+z')
    await expect.poll(() => dataElementOf(patches.at(-1), 'chart')?.series?.[0]?.values[0]).toBe(10)
    expect(patches).toHaveLength(2)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })
})

// --- Layout and infographic editing ------------------------------------------------------------

const layoutDeck = fixture<typeof editableDeck>('layout-presentation')
interface LayoutElement {
  gap?: number
  children?: unknown[]
  data?: { value?: number; items?: { heading: string }[] }
}
const layoutElementOf = (patch: { slides: PatchedSlide[] } | undefined, id: string) =>
  patch?.slides.flatMap((s) => s.ui?.components ?? []).find((c) => c.id === id)?.elements[0] as LayoutElement | undefined

test.describe('layout and infographic editing (mocked)', () => {
  async function open(page: Page, slide = 1) {
    const api = await editableApi(page, {}, layoutDeck)
    await page.goto(`/p/${DECK_ID}`)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    if (slide > 1) {
      const thumb = page.getByRole('button', { name: `Slide ${slide}`, exact: true })
      await thumb.click()
      await expect(thumb).toHaveAttribute('aria-current', 'true')
      await expect(page.getByTestId('selection-overlay')).toBeVisible()
    }
    return api
  }
  /** The slide switch cross-fades, so click until the section for the target is showing. */
  async function select(page: Page, [x, y]: [number, number], heading: 'Layout' | 'Infographic') {
    await expect(async () => {
      const p = await slidePoint(page, x, y)
      await page.mouse.click(p.px, p.py)
      await expect(page.getByRole('button', { name: heading, exact: true })).toBeVisible({ timeout: 500 })
    }).toPass({ timeout: 10_000 })
    // The section's controls live in the bar's popover.
    await page.getByRole('button', { name: heading, exact: true }).click()
  }
  const numberField = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true })

  test('Layout: gap change saves and Ctrl+Z restores it', async ({ page }) => {
    const { patches, unexpected } = await open(page)
    await select(page, [200, 150], 'Layout')
    const gap = numberField(page, 'Gap')
    await expect(gap).toHaveValue('10')
    await gap.fill('24')
    await gap.press('Enter')
    await expect.poll(() => layoutElementOf(patches.at(-1), 'cards')?.gap).toBe(24)
    await gap.blur() // shortcuts ignore a focused input, where Ctrl+Z is the browser's own text undo
    await page.keyboard.press('Control+z')
    await expect.poll(() => layoutElementOf(patches.at(-1), 'cards')?.gap).toBe(10)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('Layout: a container fill changes in one PATCH and Ctrl+Z restores it', async ({ page }) => {
    const { patches, unexpected } = await open(page)
    await select(page, [200, 190], 'Layout')
    // The Arrange panel's Contains list drills from the flex into its first container; the panel stays open.
    await page.getByRole('button', { name: 'Arrange', exact: true }).click()
    await page.getByRole('button', { name: 'Container', exact: true }).first().click()
    const fill = page.getByRole('button', { name: 'Fill colour', exact: true })
    await expect(fill).toBeVisible()
    const cardFill = (patch: { slides: PatchedSlide[] } | undefined) =>
      (layoutElementOf(patch, 'cards')?.children?.[0] as { fill?: { color?: string } } | undefined)?.fill?.color
    await fill.click()
    const swatch = page.getByRole('button', { name: /^Colour #[0-9a-f]{6}$/i }).first()
    const hex = (await swatch.getAttribute('aria-label'))!.replace('Colour ', '').toLowerCase()
    expect(hex).not.toBe('#4a6ff3')
    await swatch.click()
    // Only the forward change is compared case-insensitively (the picker's case is its own).
    await expect.poll(() => cardFill(patches.at(-1))?.toLowerCase()).toBe(hex)
    expect(patches).toHaveLength(1)
    await page.keyboard.press('Control+z')
    // Undo restores the stored value exactly, as the fixture holds it.
    await expect.poll(() => cardFill(patches.at(-1))).toBe('#4A6FF3')
    expect(patches).toHaveLength(2)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('Layout: Add item adds a third card', async ({ page }) => {
    const { patches, unexpected } = await open(page)
    await select(page, [200, 150], 'Layout')
    await page.getByRole('dialog', { name: 'Layout' }).getByRole('button', { name: 'Add item', exact: true }).click()
    await expect.poll(() => layoutElementOf(patches.at(-1), 'cards')?.children?.length).toBe(3)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('Infographic: gauge value saves clamped', async ({ page }) => {
    const { patches, unexpected } = await open(page, 2)
    await select(page, [520, 320], 'Infographic')
    const value = numberField(page, 'Value')
    await expect(value).toHaveValue('84')
    await value.fill('150')
    await value.press('Enter')
    await expect.poll(() => layoutElementOf(patches.at(-1), 'gauge')?.data?.value).toBe(100)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('Edit items saves one PATCH and Ctrl+Z undoes it in one step', async ({ page }) => {
    const { patches, unexpected } = await open(page, 3)
    await select(page, [520, 310], 'Infographic')
    await page.getByRole('button', { name: 'Edit items…', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const heading = dialog.getByRole('textbox', { name: 'Heading 1', exact: true })
    await expect(heading).toHaveValue('Screen Time')
    await heading.fill('Edited')
    await dialog.getByRole('button', { name: 'Add item', exact: true }).click()
    await dialog.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => layoutElementOf(patches.at(-1), 'funnel')?.data?.items?.length).toBe(5)
    expect(layoutElementOf(patches.at(-1), 'funnel')?.data?.items?.[0]?.heading).toBe('Edited')
    expect(patches).toHaveLength(1)

    await page.keyboard.press('Control+z')
    await expect.poll(() => layoutElementOf(patches.at(-1), 'funnel')?.data?.items?.length).toBe(4)
    expect(layoutElementOf(patches.at(-1), 'funnel')?.data?.items?.[0]?.heading).toBe('Screen Time')
    expect(patches).toHaveLength(2)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })
})

// --- Settings ----------------------------------------------------------------------------------

const ADMIN_CONFIG = {
  LLM: 'openai',
  OPENAI_API_KEY: 'sk-test-fake',
  OPENAI_MODEL: 'gpt-4.1',
  DISABLE_IMAGE_GENERATION: true,
  WEB_GROUNDING: false,
}
const PROVIDER_SETTINGS = '/api/v1/admin/provider-settings'

test.describe('settings (mocked)', () => {
  /** Serves the admin provider settings and records every PUT body and every runtime-config request. */
  async function settingsApi(page: Page, overrides: Record<string, Handler> = {}) {
    const puts: Record<string, unknown>[] = []
    const requests = { providerSettings: 0, runtimeConfig: 0 }
    const unexpected = await mockApi(page, {
      'GET /api/runtime-config': (route) => {
        requests.runtimeConfig += 1
        return json({ configured: true, config: { PRESENTATION_GENERATION_MODE: 'standard' } })(route)
      },
      [`GET ${PROVIDER_SETTINGS}`]: (route) => {
        requests.providerSettings += 1
        return json(ADMIN_CONFIG)(route)
      },
      [`PUT ${PROVIDER_SETTINGS}`]: (route) => {
        const body = route.request().postDataJSON() as Record<string, unknown>
        puts.push(body)
        return json(body)(route)
      },
      'POST /api/v1/ppt/anthropic/models/available': json(['claude-sonnet-4-20250514', 'claude-haiku-4-5']),
      // The Advanced panel asks for the token default of the current provider.
      'POST /api/v1/ppt/generation/defaults': json({ default_max_output_tokens: 8192 }),
      ...overrides,
    })
    return { puts, requests, unexpected }
  }

  async function pickAnthropic(page: Page) {
    await page.getByRole('combobox', { name: 'Text provider' }).click()
    await page.getByRole('option', { name: /^Anthropic/ }).click()
  }

  const toast = (page: Page, title: string) => page.locator('[data-sonner-toast]').filter({ hasText: title })

  test('rail Settings link opens the in-app settings page', async ({ page }) => {
    const { unexpected } = await settingsApi(page)
    const popups: unknown[] = []
    page.context().on('page', (p) => popups.push(p.url()))

    await page.goto('/')
    await expect(page.getByTestId('deck')).toHaveCount(2)
    await page.getByRole('link', { name: 'Settings' }).click()

    await expect(page).toHaveURL('/settings/text')
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="page"]')).toHaveText('Settings')
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Text provider' })).toBeVisible()
    expect(popups).toEqual([])
    expect(page.context().pages()).toHaveLength(1)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('admin switches to Anthropic and saves', async ({ page }) => {
    const { puts, requests, unexpected } = await settingsApi(page)
    await page.goto('/settings/text')
    await expect(page.getByRole('combobox', { name: 'Text provider' })).toBeVisible()
    const runtimeBefore = requests.runtimeConfig
    expect(runtimeBefore).toBeGreaterThan(0)

    await pickAnthropic(page)
    await page.getByLabel('Anthropic API key').fill('sk-ant-test-fake')
    await page.getByRole('button', { name: 'Check models' }).click()

    await page.getByRole('combobox', { name: /Anthropic model ID/ }).click()
    await page.getByRole('option', { name: 'claude-sonnet-4-20250514' }).click()
    await expect(page.getByRole('combobox', { name: /Anthropic model ID/ })).toContainText('claude-sonnet-4-20250514')

    await expect(page.getByText('You have unsaved changes.')).toBeVisible()
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(toast(page, 'Settings saved')).toBeVisible()
    await expect(page.getByText('You have unsaved changes.')).toHaveCount(0)
    await expect.poll(() => requests.runtimeConfig).toBeGreaterThan(runtimeBefore)

    expect(puts).toHaveLength(1)
    const body = puts[0]!
    expect(body).toMatchObject({
      LLM: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-test-fake',
      ANTHROPIC_MODEL: 'claude-sonnet-4-20250514',
    })
    expect(Object.keys(body).filter((k) => /^(CODEX_|PRESENTON_)/.test(k))).toEqual([])
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('admin save with a missing key shows the validation toast and sends no request', async ({ page }) => {
    const { puts, unexpected } = await settingsApi(page)
    await page.goto('/settings/text')
    await pickAnthropic(page)
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    const message = toast(page, 'Cannot save settings')
    await expect(message).toBeVisible()
    await expect(message).toContainText('Anthropic API key is required.')
    expect(puts).toHaveLength(0)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('regular user sees the read-only summary', async ({ page }) => {
    const { requests, unexpected } = await settingsApi(page, {
      'GET /api/v1/auth/status': json({ configured: true, authenticated: true, username: 'e2e', role: 'user' }),
      'GET /api/runtime-config': json({
        configured: true,
        config: { LLM: 'openai', OPENAI_MODEL: 'gpt-4.1', OPENAI_API_KEY: '__configured__' },
      }),
    })
    await page.goto('/settings/text')

    const card = page.locator('section.workspace-card')
    await expect(card.getByText('An administrator manages these settings.')).toBeVisible()
    await expect(card.locator('input')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('__configured__')
    expect(requests.providerSettings).toBe(0)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('locked deployment shows the locked message', async ({ page }) => {
    const { unexpected } = await settingsApi(page, {
      [`GET ${PROVIDER_SETTINGS}`]: json({ detail: 'Forbidden' }, 403),
    })
    await page.goto('/settings/text')
    await expect(page.getByText('Provider settings are locked by this deployment.')).toBeVisible()
    await expect(page.locator('section.workspace-card input')).toHaveCount(0)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('leaving with unsaved changes asks for confirmation', async ({ page }) => {
    const { unexpected } = await settingsApi(page)
    const prompts: string[] = []
    let accept = false
    page.on('dialog', (dialog) => {
      prompts.push(dialog.message())
      return accept ? dialog.accept() : dialog.dismiss()
    })

    await page.goto('/settings/text')
    await pickAnthropic(page)
    await page.getByLabel('Anthropic API key').fill('sk-ant-test-fake')
    await expect(page.getByText('You have unsaved changes.')).toBeVisible()

    const library = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Library' })
    await library.click()
    await expect.poll(() => prompts.length).toBe(1)
    expect(prompts[0]).toContain('unsaved changes')
    await expect(page).toHaveURL('/settings/text')
    await expect(page.getByLabel('Anthropic API key')).toHaveValue('sk-ant-test-fake')

    accept = true
    await library.click()
    await expect(page).toHaveURL('/')
    expect(prompts).toHaveLength(2)
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('a failed save keeps the draft', async ({ page }) => {
    const { unexpected } = await settingsApi(page, {
      [`PUT ${PROVIDER_SETTINGS}`]: json({ detail: 'Database is down' }, 500),
    })
    await page.goto('/settings/text')
    await pickAnthropic(page)
    await page.getByLabel('Anthropic API key').fill('sk-ant-test-fake')
    // Checking models selects the preferred model, so the draft is valid and the PUT is sent.
    await page.getByRole('button', { name: 'Check models' }).click()
    await expect(page.getByRole('combobox', { name: /Anthropic model ID/ })).toContainText('claude-sonnet-4-20250514')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(toast(page, 'Could not save settings')).toBeVisible()
    await expect(page.getByText('You have unsaved changes.')).toBeVisible()
    await expect(page.getByLabel('Anthropic API key')).toHaveValue('sk-ant-test-fake')
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
    expect(unexpected, 'API calls without a mock').toEqual([])
  })
})

// --- Create wizard ----------------------------------------------------------------------------

interface WizardSlide extends Record<string, unknown> {
  id: string
  index: number
  speaker_note: string | null
  ui: { components: Record<string, unknown>[] } & Record<string, unknown>
}
type WizardDeck = Record<string, unknown> & { slides: WizardSlide[] }

const NOTES = ['Welcome everyone to the quarterly review.', 'Here are the headline numbers.']
const OUTLINE = ['# Quarterly review\nWhere we stand', '# Headline numbers\nRevenue, margin and growth']
const NOW = '2026-11-20T10:00:00Z'
const PORTRAIT = { url: '/app_data/portrait.png', mime_type: 'image/png', width: 512, height: 512, size_bytes: 10, updated_at: NOW }

/** The two template slides of the fixture deck; the second carries the avatar placeholder layer. */
function wizardDeck(notes: (string | null)[]): WizardDeck {
  const base = structuredClone(fixture<WizardDeck>('presentation'))
  const slides = base.slides.slice(0, 2).map((s, i) => ({ ...s, speaker_note: notes[i] ?? null }))
  slides[1]!.ui.components.push({
    id: 'video_placeholder',
    description: 'Avatar video placeholder',
    position: { x: 860, y: 360 },
    elements: [
      {
        type: 'image',
        position: { x: 0, y: 0 },
        size: { width: 360, height: 320 },
        data: '/static/images/replaceable_template_image.png',
        fit: 'cover',
        video_placeholder: true,
      },
    ],
  })
  return { ...base, title: 'Quarterly Review', content: 'A quarterly review for the board', n_slides: 2, slides }
}

const sse = (events: unknown[]): Handler => (route) =>
  route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: events.map((e) => `event: response\ndata: ${JSON.stringify(e)}\n\n`).join(''),
  })

const task = (id: string, type: string, status: string, data: Record<string, unknown> | null = null) => ({
  id,
  type,
  status,
  data,
  created_at: NOW,
  updated_at: NOW,
})

/** Narration recorded from each slide's current note, so every slide reads as narrated. */
const ttsOf = (deck: WizardDeck, recorded: boolean) => ({
  presentation_id: DECK_ID,
  language: 'en',
  language_name: 'English',
  total_duration_seconds: recorded ? deck.slides.length * 3 : null,
  audios: recorded
    ? deck.slides.map((s) => ({
        id: `cccccccc-0000-4000-8000-00000000000${s.index}`,
        presentation_id: DECK_ID,
        slide_id: s.id,
        slide_index: s.index,
        language: 'en',
        language_name: 'English',
        model: 'mock',
        voice: null,
        text: s.speaker_note,
        translated: false,
        url: `/app_data/audio/${s.index}.mp3`,
        format: 'mp3',
        size_bytes: 10,
        duration_seconds: 3,
        created_at: NOW,
      }))
    : [],
  generated_slide_indexes: recorded ? deck.slides.map((s) => s.index) : [],
  reused_slide_indexes: [],
  skipped: [],
})

const avatarVideo = (slide: WizardSlide) => ({
  id: 'dddddddd-0000-4000-8000-000000000001',
  presentation_id: DECK_ID,
  slide_id: slide.id,
  slide_index: slide.index,
  url: '/app_data/videos/1.mp4',
  format: 'mp4',
  mime_type: 'video/mp4',
  size_bytes: 10,
  duration_seconds: 3,
  language: 'en',
  source: 'heygen',
  stale: false,
})

/**
 * The backend of a deck made in the wizard, as a small state machine: created (no slides) → outline streamed →
 * prepared → slides streamed → notes written → narration recorded (TTS task) → avatar rendered (HeyGen task).
 * Tasks complete on their first poll.
 */
async function wizardApi(page: Page) {
  const state = { generated: false, notes: false, tts: false, avatars: false, avatarRun: false }
  const requests: string[] = []
  const deckNow = (): WizardDeck =>
    state.generated ? wizardDeck(state.notes ? NOTES : [null, null]) : { ...wizardDeck([]), slides: [] }
  const record =
    (name: string, handler: Handler): Handler =>
    (route) => {
      requests.push(name)
      return handler(route)
    }
  const unexpected = await mockApi(page, {
    'GET /api/v1/ppt/template/c1': json(fixture('template')),
    'POST /api/v1/ppt/presentation/create': record('create', (route) => json(deckNow())(route)),
    [`GET /api/v1/ppt/presentation/${DECK_ID}`]: (route) => json(deckNow())(route),
    [`GET /api/v1/ppt/outlines/${DECK_ID}`]: json({ slides: [] }),
    [`GET /api/v1/ppt/outlines/stream/${DECK_ID}`]: sse([
      { type: 'status', status: 'Drafting the outline' },
      { type: 'complete', presentation: { outlines: { slides: OUTLINE.map((content) => ({ content })) } } },
    ]),
    'POST /api/v1/ppt/presentation/prepare': record('prepare', (route) => json(deckNow())(route)),
    [`GET /api/v1/ppt/presentation/stream/${DECK_ID}`]: record('stream', (route) => {
      state.generated = true
      return sse([{ type: 'complete', presentation: deckNow() }])(route)
    }),
    [`POST /api/v1/ppt/presentation/${DECK_ID}/speaker-notes`]: record('notes', (route) => {
      state.notes = true
      return json(deckNow())(route)
    }),
    [`GET /api/v1/ppt/presentation/${DECK_ID}/speaker-notes/tts`]: (route) => json(ttsOf(deckNow(), state.tts))(route),
    [`POST /api/v1/ppt/presentation/${DECK_ID}/speaker-notes/tts/async`]: record('tts', json(task('tts-task', 'tts', 'pending'))),
    'GET /api/v1/async-tasks/status/tts-task': (route) => {
      state.tts = true
      return json(task('tts-task', 'tts', 'completed', { completed_slides: 2, total_slides: 2 }))(route)
    },
    [`GET /api/v1/ppt/presentation/${DECK_ID}/videos`]: (route) => {
      const videos = state.avatars ? [avatarVideo(deckNow().slides[1]!)] : []
      return json({ presentation_id: DECK_ID, total_duration_seconds: null, portrait: PORTRAIT, generation_available: true, videos })(route)
    },
    [`POST /api/v1/ppt/presentation/${DECK_ID}/videos/generate`]: record('avatars', (route) => {
      state.avatarRun = true
      return json(task('avatar-task', 'avatar_videos', 'pending'))(route)
    }),
    [`GET /api/v1/ppt/presentation/${DECK_ID}/videos/generate`]: (route) =>
      state.avatarRun
        ? json(task('avatar-task', 'avatar_videos', state.avatars ? 'completed' : 'pending'))(route)
        : json({ detail: 'Not found' }, 404)(route),
    'GET /api/v1/async-tasks/status/avatar-task': (route) => {
      state.avatars = true
      const slide = deckNow().slides[1]!
      return json(
        task('avatar-task', 'avatar_videos', 'completed', { slides: [{ slide_id: slide.id, slide_index: slide.index, state: 'done' }] }),
      )(route)
    },
    // No narrated MP4 rendered yet.
    [`GET /api/v1/ppt/presentation/${DECK_ID}/video-export`]: json({ detail: 'Not found' }, 404),
  })
  await page.route('**/static/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  return { requests, unexpected }
}


test.describe('create wizard (mocked)', () => {
  test('wizard: topic → export with resume from editor', async ({ page }) => {
    test.setTimeout(90_000)
    const { requests, unexpected } = await wizardApi(page)

    // Steps 1–2: Topic & look (a template is required), then the Presenter.
    await page.goto('/new')
    await page.getByPlaceholder(/Describe the topic/).fill('A quarterly review for the board')
    await expect(page.getByTestId('wizard-primary')).toBeDisabled()
    await page.getByRole('radio', { name: 'Pitch' }).click()
    await expect(page).toHaveURL(/\/new\?template=c1$/)
    await page.getByTestId('wizard-primary').click()
    await expect(page.getByTestId('step-presenter')).toHaveAttribute('aria-current', 'step')
    await page.getByRole('button', { name: 'Create outline' }).click()

    // Step 3: the outline streams in; Generate builds the slides from the chosen template.
    await expect(page).toHaveURL(new RegExp(`/p/${DECK_ID}/create/outline\\?template=c1$`))
    await expect(page.getByTestId('outline-count')).toHaveText('2 slides · max 50')
    await page.getByRole('button', { name: 'Generate slides' }).click()

    // Step 4: the slides stream in, then the grid shows them.
    await expect(page).toHaveURL(new RegExp(`/p/${DECK_ID}/create/preview`))
    await expect(page.getByTestId('preview-grid').getByRole('button', { name: /Open slide/ })).toHaveCount(2)
    await expect(page).not.toHaveURL(/stream=/)
    await page.getByRole('button', { name: 'Edit slides' }).click()

    // The editor offers to carry on where the wizard stands: the Avatar step.
    await expect(page).toHaveURL(`/p/${DECK_ID}`)
    const resume = page.getByTestId('continue-setup')
    await expect(resume).toHaveText('Continue: Avatar')
    await resume.click()

    // Step 5: one run writes the notes, records the voice and renders the avatar.
    await expect(page).toHaveURL(`/p/${DECK_ID}/create/avatar`)
    await expect(page.getByTestId('setup-portrait')).toHaveAttribute('data-ok', 'true')
    await page.getByRole('button', { name: 'Generate voice & avatars' }).click()
    const toExport = page.getByRole('button', { name: 'Continue to Export' })
    await expect(toExport).toBeEnabled({ timeout: 30_000 })
    await expect(page.getByTestId('setup-summary')).toHaveText('2 slides narrated · 1 with a presenter avatar')
    for (const phase of ['notes', 'voice', 'avatars']) {
      await expect(page.getByTestId(`pipeline-${phase}`)).toHaveAttribute('data-state', 'done')
    }
    await toExport.click()

    // Step 6: the export options.
    await expect(page).toHaveURL(`/p/${DECK_ID}/create/export`)
    await expect(page.getByTestId('step-export')).toHaveAttribute('aria-current', 'step')
    await expect(page.getByTestId('export-heading')).toHaveText('Quarterly Review · 2 slides')
    await expect(page.getByTestId('export-options').getByRole('radio', { name: /PowerPoint/ })).toBeVisible()

    expect(requests).toEqual(['create', 'prepare', 'stream', 'notes', 'tts', 'avatars'])
    expect(unexpected, 'API calls without a mock').toEqual([])
  })

  test('export stays open while avatars are missing, and warns inline', async ({ page }) => {
    const unexpected = await mockApi(page, {
      // Narrated (the tts fixture holds these notes), one placeholder slide, no avatar video yet.
      [`GET /api/v1/ppt/presentation/${DECK_ID}`]: json(wizardDeck(NOTES)),
      [`GET /api/v1/ppt/presentation/${DECK_ID}/videos`]: json({
        presentation_id: DECK_ID,
        total_duration_seconds: null,
        portrait: null,
        generation_available: true,
        videos: [],
      }),
    })
    await page.route('**/static/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))

    await page.goto(`/p/${DECK_ID}/create/export`)
    await expect(page).toHaveURL(`/p/${DECK_ID}/create/export`)
    await expect(page.getByTestId('export-gaps')).toContainText('1 presenter slide has no video')
    await expect(page.getByTestId('step-export')).not.toHaveAttribute('data-state', 'locked')
    expect(unexpected, 'API calls without a mock').toEqual([])
  })
})
