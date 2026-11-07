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
  const pick = async () => {
    const box = (await overlay.boundingBox())!
    // The slide's centre-left area; any component there is picked, else the test skips.
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5)
  }
  await pick()
  test.skip((await selectionBox.count()) === 0, 'nothing selectable at the probe point')
  const before = (await selectionBox.first().boundingBox())!
  const scale = (await overlay.boundingBox())!.width / 1280

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

  const saved = page.waitForResponse((r) => r.url().includes('/presentation/update') && r.ok())
  await drag(40)
  await saved
  try {
    await page.reload()
    await expect(overlay).toBeVisible()
    await pick()
    await expect(selectionBox.first()).toBeVisible()
    const after = (await selectionBox.first().boundingBox())!
    expect(Math.abs(after.x - before.x - 40 * scale)).toBeLessThan(6 * scale)
  } finally {
    // Leave the user's deck as it was: drag the component back (history does not survive a reload).
    const restored = page.waitForResponse((r) => r.url().includes('/presentation/update') && r.ok())
    await drag(-40)
    await restored
  }
})
