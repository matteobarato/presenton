import { expect, test } from '@playwright/test'

// Runs against a real backend: `E2E_BACKEND=1 E2E_USER=... E2E_PASSWORD=... npm run e2e`
// (BACKEND_URL defaults to http://localhost:5001 and is used by the dev server's proxy).
test.skip(!process.env.E2E_BACKEND, 'set E2E_BACKEND=1 to run against a live backend')

test('sign in, open the first deck, render every slide, present and exit', async ({ page }) => {
  const user = process.env.E2E_USER
  const password = process.env.E2E_PASSWORD
  expect(user && password, 'E2E_USER and E2E_PASSWORD are required').toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Username').fill(user!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'What will you create today?' })).toBeVisible()
  const cards = page.getByTestId('deck')
  await expect(cards.first()).toBeVisible()
  await cards.first().getByRole('link').first().click()
  await expect(page).toHaveURL(/\/p\/[^/]+$/)
  const editorUrl = page.url()

  const thumbnails = page.getByRole('complementary', { name: 'Slides' }).locator('button[data-slide-key]')
  await expect(thumbnails.first()).toBeVisible()
  const count = await thumbnails.count()
  for (let i = 0; i < count; i++) await thumbnails.nth(i).scrollIntoViewIfNeeded()
  await expect(page.getByText("Can't render this slide")).toHaveCount(0)

  await page.locator('header').getByRole('link', { name: 'Present' }).click()
  await expect(page.getByTestId('present')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(editorUrl)
})

test('move a component, reload, the position persisted (then restore it)', async ({ page }) => {
  const user = process.env.E2E_USER
  const password = process.env.E2E_PASSWORD
  expect(user && password, 'E2E_USER and E2E_PASSWORD are required').toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Username').fill(user!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  const cards = page.getByTestId('deck')
  await expect(cards.first()).toBeVisible()
  await cards.first().getByRole('link').first().click()
  await expect(page).toHaveURL(/\/p\/[^/]+$/)

  const overlay = page.getByTestId('selection-overlay')
  test.skip(!(await overlay.isVisible().catch(() => false)), 'first deck has no editable template slide')

  const selectionBox = page.locator('[data-selection-box]')
  const probe = async (fx: number, fy: number) => {
    const box = (await overlay.boundingBox())!
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
  }
  // A component that is not the full-bleed background (that one covers >= 90% of a side).
  const pick = async () => {
    const slide = (await overlay.boundingBox())!
    for (const [fx, fy] of [[0.3, 0.5], [0.5, 0.5], [0.2, 0.3], [0.7, 0.6], [0.5, 0.2]] as const) {
      await probe(fx, fy)
      if ((await selectionBox.count()) === 0) continue
      const b = (await selectionBox.first().boundingBox())!
      if (b.width < slide.width * 0.9 && b.height < slide.height * 0.9) return true
    }
    return false
  }
  test.skip(!(await pick()), 'no movable component found on the first slide')
  const before = (await selectionBox.first().boundingBox())!
  const scale = (await overlay.boundingBox())!.width / 1280

  // Snapshot the deck before any mutation: the restore resends it verbatim.
  const deckId = page.url().split('/p/')[1]!.split(/[/?#]/)[0]!
  const original = await page.request.get(`/api/v1/ppt/presentation/${deckId}`)
  expect(original.ok(), 'could not read the deck before editing').toBeTruthy()
  const originalDeck = (await original.json()) as { id: string; title?: string; slides: unknown[]; theme?: unknown }

  const drag = async (dx: number) => {
    const b = (await selectionBox.first().boundingBox())!
    const x = b.x + b.width / 2
    const y = b.y + b.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + (dx * scale) / 2, y, { steps: 5 })
    await page.mouse.move(x + dx * scale, y, { steps: 5 })
    await page.mouse.up()
  }

  let failed = true
  try {
    const saved = page.waitForResponse((r) => r.url().includes('/presentation/update') && r.ok())
    await drag(40)
    await saved
    await page.reload()
    await expect(overlay).toBeVisible()
    expect(await pick()).toBe(true)
    const after = (await selectionBox.first().boundingBox())!
    expect(Math.abs(after.x - before.x - 40 * scale)).toBeLessThan(6 * scale)
    failed = false
  } finally {
    // Put the original slides back through the API. The theme is always resent: the endpoint resets it when omitted.
    let restoreError: unknown
    try {
      const res = await page.request.patch('/api/v1/ppt/presentation/update', {
        data: { id: originalDeck.id, slides: originalDeck.slides, title: originalDeck.title, theme: originalDeck.theme },
      })
      if (!res.ok()) throw new Error(`restore failed: ${res.status()}`)
    } catch (e) {
      restoreError = e
      console.error('Could not restore the deck after the live editing test:', e)
    }
    if (restoreError && !failed) throw restoreError
  }
})

test('rotate a shape and change its fill, reload, both persisted (then restore the deck)', async ({ page }) => {
  const user = process.env.E2E_USER
  const password = process.env.E2E_PASSWORD
  expect(user && password, 'E2E_USER and E2E_PASSWORD are required').toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Username').fill(user!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  const cards = page.getByTestId('deck')
  await expect(cards.first()).toBeVisible()
  await cards.first().getByRole('link').first().click()
  await expect(page).toHaveURL(/\/p\/[^/]+$/)

  const overlay = page.getByTestId('selection-overlay')
  test.skip(!(await overlay.isVisible().catch(() => false)), 'first deck has no editable template slide')

  // Find a component that is not the full-bleed background and offers a Fill switch (a closed vector shape).
  const selectionBox = page.locator('[data-selection-box]')
  const fillSwitch = page.getByRole('switch', { name: 'Fill' })
  let found = false
  const slide = (await overlay.boundingBox())!
  search: for (let fy = 0.1; fy < 1 && !found; fy += 0.1) {
    for (let fx = 0.1; fx < 1; fx += 0.1) {
      await page.mouse.click(slide.x + slide.width * fx, slide.y + slide.height * fy)
      if ((await selectionBox.count()) === 0 || !(await fillSwitch.isVisible().catch(() => false))) continue
      const b = (await selectionBox.first().boundingBox())!
      if (b.width < slide.width * 0.9 && b.height < slide.height * 0.9 && (await page.locator('[data-rotate-handle]').count()) > 0) {
        found = true
        break search
      }
    }
  }
  test.skip(!found, 'no rotatable shape found on the first slide')

  // Snapshot the deck before any mutation: the restore resends it verbatim.
  const deckId = page.url().split('/p/')[1]!.split(/[/?#]/)[0]!
  const original = await page.request.get(`/api/v1/ppt/presentation/${deckId}`)
  expect(original.ok(), 'could not read the deck before editing').toBeTruthy()
  const originalDeck = (await original.json()) as { id: string; title?: string; slides: unknown[]; theme?: unknown }

  const centre = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  const rotation = page.getByRole('textbox', { name: 'Rotation' })
  const picked = (await selectionBox.first().boundingBox())!
  const pickedCentre = centre(picked)

  let failed = true
  try {
    // Rotate a quarter turn clockwise with the handle.
    const c = centre((await selectionBox.first().boundingBox())!)
    const h = centre((await page.locator('[data-rotate-handle]').boundingBox())!)
    const r = Math.hypot(h.x - c.x, h.y - c.y)
    const rotated = page.waitForResponse((res) => res.url().includes('/presentation/update') && res.ok())
    await page.mouse.move(h.x, h.y)
    await page.mouse.down()
    await page.mouse.move(c.x - r / 2, c.y + r / 2, { steps: 5 })
    await page.mouse.move(c.x - r, c.y, { steps: 5 })
    await page.mouse.up()
    await rotated
    await expect(rotation).toHaveValue(/^(8[5-9]|9[0-5])/)

    // Change the fill colour to a palette swatch.
    await page.getByRole('button', { name: 'Fill colour', exact: true }).click()
    const swatch = page.getByRole('button', { name: /^#[0-9a-f]{6}$/i }).nth(1)
    const hex = (await swatch.getAttribute('aria-label'))!
    const filled = page.waitForResponse((res) => res.url().includes('/presentation/update') && res.ok())
    await swatch.click()
    await filled

    await page.reload()
    await expect(overlay).toBeVisible()
    // The rotated shape is selectable at its old centre; its rotation and fill persisted.
    const again = (await overlay.boundingBox())!
    await page.mouse.click(again.x + (pickedCentre.x - slide.x), again.y + (pickedCentre.y - slide.y))
    await expect(rotation).toHaveValue(/^(8[5-9]|9[0-5])/)
    await expect(page.getByRole('button', { name: 'Fill colour', exact: true })).toContainText(hex.toLowerCase())
    failed = false
  } finally {
    // Put the original slides back through the API. The theme is always resent: the endpoint resets it when omitted.
    let restoreError: unknown
    try {
      const res = await page.request.patch('/api/v1/ppt/presentation/update', {
        data: { id: originalDeck.id, slides: originalDeck.slides, title: originalDeck.title, theme: originalDeck.theme },
      })
      if (!res.ok()) throw new Error(`restore failed: ${res.status()}`)
    } catch (e) {
      restoreError = e
      console.error('Could not restore the deck after the live visual editing test:', e)
    }
    if (restoreError && !failed) throw restoreError
  }
})

test('edit a table cell in place, reload, the text persisted (then restore the deck)', async ({ page }) => {
  const user = process.env.E2E_USER
  const password = process.env.E2E_PASSWORD
  expect(user && password, 'E2E_USER and E2E_PASSWORD are required').toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Username').fill(user!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('deck').first()).toBeVisible()

  type Pt = { x?: number; y?: number }
  interface Table { type: string; position?: Pt; size?: { width: number; height: number }; rotation?: number; columns?: unknown[]; rows?: unknown[][] }
  interface Deck { id: string; title?: string; slides: { ui?: { components?: { position?: Pt; elements?: Table[] }[] } | null }[]; theme?: unknown }

  // Find a deck with an unrotated table on a template slide.
  const list = await page.request.get('/api/v1/ppt/presentation/all')
  expect(list.ok()).toBeTruthy()
  let target: { deck: Deck; slide: number; frame: { x: number; y: number; width: number; height: number }; rows: number; cols: number } | null = null
  search: for (const { id } of (await list.json()) as { id: string }[]) {
    const res = await page.request.get(`/api/v1/ppt/presentation/${id}`)
    if (!res.ok()) continue
    const deck = (await res.json()) as Deck
    for (const [slide, s] of deck.slides.entries()) {
      for (const c of s.ui?.components ?? []) {
        const t = c.elements?.find((e) => e.type === 'table' && e.size && !e.rotation)
        if (!t?.size || !t.columns?.length || !t.rows?.length) continue
        const x = (c.position?.x ?? 0) + (t.position?.x ?? 0)
        const y = (c.position?.y ?? 0) + (t.position?.y ?? 0)
        target = { deck, slide, frame: { x, y, ...t.size }, rows: t.rows.length + 1, cols: t.columns.length }
        break search
      }
    }
  }
  test.skip(!target, 'no deck has an editable table')
  const { deck, slide, frame, rows, cols } = target!
  const originalDeck = structuredClone(deck)

  await page.goto(`/p/${deck.id}`)
  const overlay = page.getByTestId('selection-overlay')
  await expect(overlay).toBeVisible()
  if (slide > 0) {
    await page.getByRole('button', { name: `Slide ${slide + 1}`, exact: true }).click()
    await expect(overlay).toBeVisible()
  }
  const at = async (row: number, col: number) => {
    const box = (await overlay.boundingBox())!
    const k = box.width / 1280
    return {
      x: box.x + (frame.x + ((col + 0.5) * frame.width) / cols) * k,
      y: box.y + (frame.y + ((row + 0.5) * frame.height) / rows) * k,
    }
  }

  const marker = `Live ${Date.now()}`
  let failed = true
  try {
    const p = await at(1, 0)
    await page.mouse.click(p.x, p.y) // selects the table
    await page.mouse.click(p.x, p.y) // picks the cell
    await expect(page.locator('[data-table-cell-outline]')).toHaveAttribute('data-row', '1')
    await page.mouse.dblclick(p.x, p.y)
    await expect(page.locator('.ProseMirror')).toBeVisible()
    await page.keyboard.press('Control+a')
    await page.keyboard.type(marker)
    const saved = page.waitForResponse((r) => r.url().includes('/presentation/update') && r.ok())
    await page.keyboard.press('Escape')
    await saved

    await page.reload()
    await expect(overlay).toBeVisible()
    const res = await page.request.get(`/api/v1/ppt/presentation/${deck.id}`)
    expect(JSON.stringify(((await res.json()) as Deck).slides[slide])).toContain(marker)
    failed = false
  } finally {
    // Put the original slides back through the API. The theme is always resent: the endpoint resets it when omitted.
    let restoreError: unknown
    try {
      const res = await page.request.patch('/api/v1/ppt/presentation/update', {
        data: { id: originalDeck.id, slides: originalDeck.slides, title: originalDeck.title, theme: originalDeck.theme },
      })
      if (!res.ok()) throw new Error(`restore failed: ${res.status()}`)
    } catch (e) {
      restoreError = e
      console.error('Could not restore the deck after the live table test:', e)
    }
    if (restoreError && !failed) throw restoreError
  }
})
