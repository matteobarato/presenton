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

  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
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
