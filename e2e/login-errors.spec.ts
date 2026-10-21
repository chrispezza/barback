import type { Page } from '@playwright/test'
import { bareWorld } from '../test/fixtures/world'
import { expect, test } from './support/test'

// The login screen says why a login did not take. Upstream answers a bad
// password with 400 (AuthController.php:67), throttles POST /auth/login to
// five a minute per IP and answers the sixth with 429 "Too Many Attempts."
// (routes/api.php:60, RouteServiceProvider.php:64), and a bar that is not
// there answers nothing at all. Only the first is about the email and password.

const CREDENTIALS = 'That login did not take — check the email and password.'
const NO_ANSWER = 'The bar didn’t answer — try again.'
const WAIT = /wait a minute/i

test.use({ signedIn: false, world: bareWorld() })

async function fillLogin(page: Page, password: string) {
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill(password)
}

/** Submit once and wait for the fake to answer, so attempts never overlap. */
async function submitAndWaitForAnswer(page: Page) {
  const answered = page.waitForResponse((r) => new URL(r.url()).pathname === '/bar/api/auth/login')
  await page.getByRole('button', { name: 'Log in' }).click()
  await answered
}

function alertLine(page: Page) {
  return page.getByRole('alert')
}

test('a wrong password is told to check the email and password', async ({ page }) => {
  await page.goto('/login')
  await fillLogin(page, 'not-the-password')
  await submitAndWaitForAnswer(page)
  await expect(alertLine(page)).toHaveText(CREDENTIALS)
  await expect(page).toHaveURL(/\/login$/)
})

test('the sixth attempt in a minute is told to wait, not to check the password', async ({ page, bar }) => {
  await page.goto('/login')
  await fillLogin(page, 'not-the-password')
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await submitAndWaitForAnswer(page)
    await expect(alertLine(page)).toHaveText(CREDENTIALS)
  }

  // The throttle answers before the controller, so even the right password waits.
  await fillLogin(page, 'password')
  await submitAndWaitForAnswer(page)
  await expect(alertLine(page)).toHaveText(WAIT)
  await expect(alertLine(page)).not.toHaveText(/check the email and password/)
  await expect(page).toHaveURL(/\/login$/)
  expect(bar.calls('POST', /^\/auth\/login$/)).toHaveLength(6)
  expect(await page.evaluate(() => window.localStorage.getItem('barback.token'))).toBeNull()
})

test('a bar that does not answer says so, not that the password is wrong', async ({ page, bar }) => {
  await page.goto('/login')
  bar.takeApiDown()
  await fillLogin(page, 'password')
  const failed = page.waitForEvent('requestfailed', (r) => new URL(r.url()).pathname === '/bar/api/auth/login')
  await page.getByRole('button', { name: 'Log in' }).click()
  await failed
  await expect(alertLine(page)).toHaveText(NO_ANSWER)
  await expect(page).toHaveURL(/\/login$/)
  expect(bar.calls('POST', /^\/auth\/login$/)).toHaveLength(1)
})

test('a gateway error is the bar not answering, and the next try goes through', async ({ page, bar }) => {
  // Single origin (ADR-005): nginx fronts the API (deploy/nginx.conf, location
  // /bar/), so an API container that is down or restarting answers 502 rather
  // than dropping the connection.
  bar.fail(/^\/auth\/login$/, { method: 'POST', status: 502 })
  await page.goto('/login?next=%2Fshelf')
  await fillLogin(page, 'password')
  await submitAndWaitForAnswer(page)
  await expect(alertLine(page)).toHaveText(NO_ANSWER)
  await expect(page).toHaveURL(/\/login\?next=%2Fshelf$/)

  await submitAndWaitForAnswer(page)
  await expect(page).toHaveURL(/\/shelf$/)
})
