import type { Page } from '@playwright/test'
import { ISSUED_TOKEN } from './support/fake-bar'
import { expect, test } from './support/test'

// Opening the app on a token the bar no longer honours, against
// docs/spec/frontend-spec.md §1 (/login is token acquisition) and §2 (the
// bootstrap reads /profile and /bars, every call carrying the token). Upstream's
// Sanctum guard answers each call on a stale token with 401
// {"message":"Unauthenticated."} (the guard in e2e/support/fake-bar.ts), so the
// first screen's reads all 401 together. The visitor lands at the door once,
// with the route they opened as `next`, and logging in returns them there —
// never back to the door.

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

/** At the door: /login with exactly this `next` and `reason`. */
function atDoor(next: string | null, reason: string | null) {
  return (url: URL) =>
    url.pathname === '/login' && url.searchParams.get('next') === next && url.searchParams.get('reason') === reason
}

/** Back on an app route: this pathname and search, nothing of the door left in it. */
function at(pathAndQuery: string) {
  return (url: URL) => url.pathname + url.search === pathAndQuery
}

function storedToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY)
}

/** Wait for the bar to have answered this API path with 401. */
function answered401(page: Page, apiPath: string) {
  return page.waitForResponse((r) => new URL(r.url()).pathname === `/bar/api${apiPath}` && r.status() === 401)
}

async function logIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

test('a stale token at /tonight lands at the door once, keeping /tonight, and logging in returns there', async ({
  page,
  bar,
  world,
}) => {
  await seedStaleToken(page)
  const profile = answered401(page, '/profile')
  const bars = answered401(page, '/bars')
  await page.goto('/tonight')
  // §2: both bootstrap reads went out on the stale token and both were refused.
  await Promise.all([profile, bars])

  await expect(page).toHaveURL(atDoor('/tonight', 'expired'))
  await expect(page.getByText(SESSION_ENDED)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Barback' })).toBeVisible()
  expect(await storedToken(page)).toBeNull()

  await logIn(page, world.user.email, world.user.password)
  await expect(page).toHaveURL(at('/tonight'))
  await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
  await expect(page.locator('.bar-status')).toContainText('You can pour')
  expect(await storedToken(page)).toBe(ISSUED_TOKEN)
  expect(bar.calls('POST', /^\/auth\/login$/)).toHaveLength(1)
})

// Every screen's first reads 401 together on a stale token; each keeps its own
// URL, query and all (§6: the family lives in the URL), as the place to return to.
const SCREENS: [route: string, heading: string][] = [
  ['/tonight?family=sour', 'Tonight'],
  ['/shelf', 'Shelf'],
  ['/first-pours', 'The classics'],
  ['/drinks/daiquiri-1', 'Daiquiri'],
]
for (const [route, heading] of SCREENS) {
  test(`a stale token at ${route} lands at the door once, keeping ${route}, and logging in returns there`, async ({
    page,
    world,
  }) => {
    await seedStaleToken(page)
    const profile = answered401(page, '/profile')
    const bars = answered401(page, '/bars')
    await page.goto(route)
    await Promise.all([profile, bars])

    await expect(page).toHaveURL(atDoor(route, 'expired'))
    await expect(page.getByText(SESSION_ENDED)).toBeVisible()

    await logIn(page, world.user.email, world.user.password)
    await expect(page).toHaveURL(at(route))
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    expect(await storedToken(page)).toBe(ISSUED_TOKEN)
  })
}

// The door is never a destination: a `next` that names /login, however it is
// dressed, logs in to Tonight rather than back onto the login screen.
for (const next of ['/login', '/login/', '/login?reason=expired&next=%2Ftonight', '/login?next=%2Fshelf#top']) {
  test(`a next of ${next} logs in to /tonight, not back to the door`, async ({ page, world }) => {
    await page.goto(`/login?next=${encodeURIComponent(next)}`)
    await logIn(page, world.user.email, world.user.password)
    await expect(page).toHaveURL(at('/tonight'))
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
    expect(await storedToken(page)).toBe(ISSUED_TOKEN)
  })
}
