import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './support/test'

// Where the installed app opens, and where a path no screen answers goes.
//
// The manifest's start_url is "/" (public/manifest.webmanifest; ADR-007: "the
// installed app opens anywhere"), and the route table names Tonight's screen
// /tonight (frontend-spec §1). "/" is no screen of its own: it lands on
// /tonight, and so does any path no screen answers, as a replace navigation,
// so the address the app opened at leaves no history entry for Back to spend.
//
// ADR-003 Consequences: "SPA routing/focus management must be handled
// deliberately for accessibility". On /tonight the nav marks Tonight as the
// current page (aria-current, which the rail and the tab bar draw as the brass
// marker; frontend-spec §7, the design system's "state is never colour alone")
// and the tab names the screen (src/app.tsx RouteEffects).
//
// The defect: at "/" the default route rendered Tonight in place. NavLink
// marks aria-current only on an exact "/tonight", and the titles had no "/",
// so the installed app opened on a Tonight with no current tab — no brass
// marker, no "current page" for a screen reader — and the tab kept
// index.html's bare "Barback". A mistyped or stale path rendered the same
// unmarked Tonight under its own address.
//
// Landing is part of the page load, not a route change: it moves no focus, as
// a cold deep link moves none (e2e/t5r-route-focus.spec.ts).
//
// Each project reads the nav its width shows: the rail on desktop, the tab bar
// on the phone. Only one "Main" navigation is rendered at a time.

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' })
// The rail's links carry a role hint after the label ("Tonight", "pour now").
const navLink = (page: Page, label: string) => mainNav(page).getByRole('link', { name: new RegExp(`^${label}`) })
const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true })
const familyButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Drink family' }).getByRole('button', { name, exact: true })
const historyLength = (page: Page) => page.evaluate(() => window.history.length)

/** The focused element as markup, or "BODY" when nothing has focus. */
const focused = (page: Page) =>
  page.evaluate(() =>
    document.activeElement === document.body ? 'BODY' : (document.activeElement?.outerHTML ?? 'NONE'),
  )

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** Pathname and search exactly, nothing of the address the app was opened at left in it. */
function at(pathAndQuery: string) {
  return (url: URL) => url.pathname + url.search === pathAndQuery
}

/** Tonight as the current screen: its heading, its tab, its title and its address. */
async function expectTonight(page: Page, pathAndQuery = '/tonight'): Promise<void> {
  await expect(h1(page, 'Tonight')).toBeVisible()
  await expect(navLink(page, 'Tonight')).toHaveAttribute('aria-current', 'page')
  // One current tab, and it is Tonight.
  await expect(mainNav(page).locator('[aria-current]')).toHaveCount(1)
  await expect(page).toHaveTitle('Tonight · Barback')
  await expect(page).toHaveURL(at(pathAndQuery))
}

test.describe('the installed app opens on Tonight, the current tab (ADR-007, ADR-003, §7)', () => {
  test('opened at the manifest’s start_url, the app lands on /tonight, marked and named', async ({
    page,
    request,
  }) => {
    const manifest = (await (await request.get('/manifest.webmanifest')).json()) as { start_url: string }
    await page.goto(manifest.start_url)

    await expectTonight(page)
  })

  test('"/" is replaced, not pushed: Back returns to the page before in one press', async ({ page }) => {
    await page.goto('/shelf')
    await expect(h1(page, 'Shelf')).toBeVisible()
    const before = await historyLength(page)

    await page.goto('/')
    await expectTonight(page)
    // The load of "/" is one entry; landing on /tonight adds none.
    expect(await historyLength(page)).toBe(before + 1)

    await page.goBack()
    await expect(page).toHaveURL(at('/shelf'))
    await expect(h1(page, 'Shelf')).toBeVisible()
    await expect(navLink(page, 'Shelf')).toHaveAttribute('aria-current', 'page')
  })

  test('a family in the query comes along: "/?family=sour" lands on a sour Tonight', async ({ page }) => {
    await page.goto('/?family=sour')

    await expectTonight(page, '/tonight?family=sour')
    await expect(familyButton(page, 'SOUR')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { level: 2, name: /^sours you can pour/ })).toBeVisible()
    await expect(navLink(page, 'Drinks')).toHaveAttribute('href', '/drinks?family=sour')
  })

  // Guard: landing is the page load, so focus stays where a page load leaves
  // it, as on a cold deep link to any screen. It held before landing existed
  // (Tonight rendered at "/"), and a landing counted as a route change would
  // move focus to the heading. Tonight renders only once landed, so its read
  // status line stands after the heading would have taken focus.
  test('opening at "/" moves no focus: the page load is not a route change', async ({ page }) => {
    await page.goto('/')
    await expect(h1(page, 'Tonight')).toBeVisible()
    await expect(page.locator('.bar-status')).toContainText('You can pour')

    expect(await focused(page)).toBe('BODY')
  })

  // The checks run over the main nav, which carries the current tab. The rest
  // of Tonight is outside this change: at this base its Buy next action fails
  // colour-contrast, which chrispezza/barback#171 fixes.
  test('landed, the main nav with its current tab passes the automated accessibility checks', async ({
    page,
  }) => {
    await page.goto('/')
    await expectTonight(page)

    const results = await new AxeBuilder({ page }).include('nav[aria-label="Main"]').withTags(AXE_TAGS).analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('a path no screen answers lands on Tonight too', () => {
  for (const path of ['/tonite', '/drinks/daiquiri-1/notes']) {
    test(`${path} is replaced by /tonight, and Back returns to the page before`, async ({ page }) => {
      await page.goto('/drinks')
      await expect(h1(page, 'Drinks')).toBeVisible()
      const before = await historyLength(page)

      await page.goto(path)
      await expectTonight(page)
      expect(await historyLength(page)).toBe(before + 1)

      await page.goBack()
      await expect(page).toHaveURL(at('/drinks'))
      await expect(h1(page, 'Drinks')).toBeVisible()
    })
  }
})

test.describe('signed out (frontend-spec §1)', () => {
  test.use({ signedIn: false })

  async function logIn(page: Page, email: string, password: string): Promise<void> {
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Log in' }).click()
  }

  test('"/" goes to the door remembering Tonight, and logging in lands there', async ({ page, world }) => {
    await page.goto('/')
    await expect(page).toHaveURL(at(`/login?next=${encodeURIComponent('/tonight')}`))
    await expect(h1(page, 'Barback')).toBeVisible()

    await logIn(page, world.user.email, world.user.password)
    await expectTonight(page)
  })

  // A door whose next is "/" (an address remembered before this fix, or typed
  // by hand) logs in to /tonight: one entry for the one step the reader took,
  // and focus on the heading, as after any route change (RouteEffects).
  test('a door whose next is "/" logs in to /tonight, one step, focus on the heading', async ({
    page,
    world,
  }) => {
    await page.goto(`/login?next=${encodeURIComponent('/')}`)
    await expect(h1(page, 'Barback')).toBeVisible()
    const before = await historyLength(page)

    await logIn(page, world.user.email, world.user.password)
    await expectTonight(page)
    await expect(h1(page, 'Tonight')).toBeFocused()
    expect(await historyLength(page)).toBe(before + 1)

    await page.goBack()
    await expect(page).toHaveURL(at(`/login?next=${encodeURIComponent('/')}`))
  })
})
