import type { Page } from '@playwright/test'
import { ISSUED_TOKEN } from './support/fake-bar'
import { expect, test } from './support/test'

// A refusal answered late, after the user has logged in again. Opening the app
// on a token the bar no longer honours sends the bootstrap's /profile and /bars
// (docs/spec/frontend-spec.md §2) on that token together. Here /profile is
// refused at once and the visitor reaches the door, as in
// e2e/e-expired-token.spec.ts, while /bars is slow and still out. They log in,
// the login stores the token the bar issues, and Tonight opens and reads
// /profile on it. Only then does the bar refuse the slow /bars, for the stale
// token it carried (upstream's Sanctum guard judges each call by its own
// token; the 401 in e2e/support/fake-bar.ts).
//
// That refusal is about the session that already ended. The fresh login stays
// stored, the visitor stays on Tonight with no "session ended" line, and the
// read that was refused is asked again on the new token (the app's one retry,
// src/api/client.ts queryDefaults), so Tonight settles.

const STALE_TOKEN = 'e2e-stale-token'
const TOKEN_KEY = 'barback.token'
const SESSION_ENDED = 'The session ended — log in to pick up where you were.'

test.use({ signedIn: false })

/** A token left over from an earlier session, stored as the login screen stores one — once per tab. */
async function seedStaleToken(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, token]) => {
      if (window.sessionStorage.getItem('e2e.stale-seeded')) return
      window.sessionStorage.setItem('e2e.stale-seeded', '1')
      window.localStorage.setItem(key, token)
    },
    [TOKEN_KEY, STALE_TOKEN] as const,
  )
}

/**
 * Hold the first /bars read before the fake sees it, until `release`; every
 * later one goes straight through. Registered after the fake, so it is asked
 * first. Keeps the Authorization the held read carried.
 */
async function holdFirstBarsRead(page: Page) {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let carried: string | undefined
  await page.route(
    (url) => url.pathname === '/bar/api/bars',
    async (route) => {
      if (carried !== undefined) return route.fallback()
      carried = route.request().headers()['authorization'] ?? ''
      await held
      return route.fallback()
    },
  )
  return { release: () => release(), carried: () => carried }
}

function answered(page: Page, apiPath: string, status: number) {
  return page.waitForResponse((r) => new URL(r.url()).pathname === `/bar/api${apiPath}` && r.status() === status)
}

function storedToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY)
}

test('a read refused on the old token after a fresh login leaves the new session where it is', async ({
  page,
  bar,
  world,
}) => {
  await seedStaleToken(page)
  const slowBars = await holdFirstBarsRead(page)
  const profileRefused = answered(page, '/profile', 401)
  await page.goto('/tonight')
  await profileRefused

  // At the door, with /bars still out on the stale token.
  await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('reason') === 'expired')
  await expect(page.getByText(SESSION_ENDED)).toBeVisible()
  await expect.poll(() => slowBars.carried()).toBe(`Bearer ${STALE_TOKEN}`)

  // Only a call on the issued token gets a 200 from the fake.
  const profileOnNewToken = answered(page, '/profile', 200)
  await page.getByLabel('Email').fill(world.user.email)
  await page.getByLabel('Password').fill(world.user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL((url) => url.pathname + url.search === '/tonight')
  await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
  // Tonight is open on the new session: its /profile read has answered.
  await profileOnNewToken
  expect(await storedToken(page)).toBe(ISSUED_TOKEN)

  // The bar refuses the slow read now, for the token it carried.
  const barsRefused = answered(page, '/bars', 401)
  slowBars.release()
  await barsRefused

  // Tonight settles on the new token; nothing sends the visitor back.
  await expect(page.locator('.bar-status')).toContainText('You can pour')
  await expect(page).toHaveURL((url) => url.pathname + url.search === '/tonight')
  await expect(page.getByText(SESSION_ENDED)).toHaveCount(0)
  expect(await storedToken(page)).toBe(ISSUED_TOKEN)
  expect(bar.calls('POST', /^\/auth\/login$/)).toHaveLength(1)
  // The refused /bars, and the one asked again on the new token.
  expect(bar.calls('GET', /^\/bars$/)).toHaveLength(2)
})
