import { bareWorld } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Harness self-checks (ADR-011): the fake answers the bootstrap, the client
// talks to it in the single-origin shape, and an unanswered request is caught.

test('the fake bar answers the bootstrap and Tonight counts from it', async ({ page, bar }) => {
  await page.goto('/tonight')
  await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
  await expect(page.locator('.bar-status')).toHaveText('You can pour 5 · 7 one bottle away · 0 to buy')
  // Single origin (ADR-005): relative /bar/api, the bar header on bar-scoped calls.
  expect(bar.calls('GET', /^\/profile$/)).toHaveLength(1)
  expect(bar.calls('GET', /^\/cocktails$/).length).toBeGreaterThan(0)
})

test.describe('signed out', () => {
  test.use({ signedIn: false, world: bareWorld() })

  test('logging in with the seeded user reaches Tonight', async ({ page }) => {
    await page.goto('/tonight')
    await expect(page).toHaveURL(/\/login\?next=%2Ftonight$/)
    await page.getByLabel('Email').fill('admin@example.com')
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
  })
})

test('a request the fixtures do not answer is recorded, not silently served', async ({ page, bar }) => {
  await page.goto('/tonight')
  await page.evaluate(() =>
    fetch('/bar/api/not-a-route', { headers: { Authorization: 'Bearer e2e-token' } }),
  )
  expect(bar.unhandled).toEqual(['GET /not-a-route?'])
  bar.unhandled.length = 0 // the teardown assertion would otherwise fail this spec
})
