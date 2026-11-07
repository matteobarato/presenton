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
