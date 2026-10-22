import type { Page } from '@playwright/test'
import { C, I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// What Tonight's rail states before the reads it depends on have answered
// (chrispezza/barback#69). An empty state is a statement of fact
// (frontend-spec §5 "Empty states are directive"; the design system's
// "Content fundamentals": numbers stated flatly), so the To buy count and the
// "Nothing to buy yet" line wait for the list read.
//
// Buy next, For your favorites and Restock next (ADR-008; frontend-spec §9
// "Purchasing intelligence") are decided against what the user owns or has
// listed: the shelf read (which also says what a held child brand covers,
// chrispezza/barback#20) and the list read. Until both have answered, each
// group can offer a bottle the shelf already covers or the list already holds,
// with a live "List it". So none renders before then; and a shelf read that
// failed says so in the error voice where the suggestions go, rather than
// offering them from no shelf at all (ADR-007 Consequences: a screen that
// needs the API says so "rather than showing cached matches").
//
// In the default world the shelf holds a Laphroaig 10, which covers Islay
// Scotch (its direct parent) for the matcher; the user's ranking still names
// Islay Scotch (it compares ids). A favourited Penicillin calls Islay Scotch,
// Lemon juice and Honey syrup, so once the shelf is read Honey syrup is its
// one gap.

const rail = (page: Page) => page.locator('#buy')
const toBuy = (page: Page) => rail(page).getByRole('heading', { level: 2, name: /^To buy/ })
const emptyLine = (page: Page) => rail(page).getByText('Nothing to buy yet — a near miss puts its bottle here.')
const buyNext = (page: Page) => rail(page).locator('.buy-next')
const group = (page: Page, heading: string) =>
  rail(page)
    .locator('.restock-section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
/** A shopping-list row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })

function world(change: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  change(w)
  return w
}

/** One state of the rail, as recorded on every change to the page. */
interface RailState {
  /** The To buy heading's text, count included ("To buy · 1"). */
  toBuy: string | null
  /** Every bottle the rail offers to list: Buy next, then each group's rows. */
  offers: string[]
  /** "Name — reason" of the Buy next card, if any. */
  buyNext: string | null
  /** The rail says the list is empty. */
  empty: boolean
}

/**
 * Record every state the rail passes through from the first paint, so a state
 * shown for a moment is caught as surely as one that lasts.
 */
async function recordRail(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __rail: unknown[] }
    w.__rail = []
    let last = ''
    new MutationObserver(() => {
      const rail = document.getElementById('buy')
      if (!rail) return
      const heading = [...rail.querySelectorAll('h2')].find((h) => (h.textContent ?? '').startsWith('To buy'))
      const card = rail.querySelector('.buy-next')
      const state = {
        toBuy: heading?.textContent ?? null,
        offers: [...rail.querySelectorAll('.buy-next-name, .restock-name')].map((n) => n.textContent ?? ''),
        buyNext: card
          ? `${card.querySelector('.buy-next-name')?.textContent ?? ''} — ${card.querySelector('.buy-next-reason')?.textContent ?? ''}`
          : null,
        empty: (rail.textContent ?? '').includes('Nothing to buy yet'),
      }
      const key = JSON.stringify(state)
      if (key === last) return
      last = key
      w.__rail.push(state)
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
}

const recorded = (page: Page) =>
  page.evaluate(() => (window as unknown as { __rail: RailState[] }).__rail)

/** Every bottle the rail offered in any recorded state, each named once. */
const offered = (states: RailState[]): string[] => [...new Set(states.flatMap((s) => s.offers))]

/** Each value in turn, a run of the same value counted once. */
const runs = <T>(values: T[]): T[] => values.filter((v, i) => i === 0 || v !== values[i - 1])

/**
 * Hold every request `matches` picks out from now on; the fake answers, and
 * records, each one only once released. Playwright asks the route registered
 * last first, so this one is asked before the fake's.
 */
async function hold(page: Page, matches: (url: URL) => boolean): Promise<() => void> {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    (url) => matches(url),
    async (route) => {
      if (route.request().method() === 'GET') await held
      await route.fallback()
    },
  )
  return release
}

/** GET /ingredients?filter[on_shelf]=true: useShelf. */
const shelfRead = (url: URL) =>
  url.pathname === '/bar/api/ingredients' && url.searchParams.get('filter[on_shelf]') === 'true'
/** GET /users/{id}/shopping-list: useShoppingList. */
const listRead = (url: URL) => /^\/bar\/api\/users\/\d+\/shopping-list$/.test(url.pathname)

/**
 * Resolve once the fake has recorded no new request for `quietMs` (as in
 * e2e/offline-tonight.spec.ts): every read the screen asks for has answered
 * and been drawn, the held one aside.
 */
async function settled(bar: FakeBar, quietMs = 500) {
  let seen = -1
  let since = Date.now()
  await expect
    .poll(
      () => {
        const count = bar.calls().length
        if (count !== seen) {
          seen = count
          since = Date.now()
        }
        return Date.now() - since >= quietMs
      },
      { intervals: [50], timeout: 10_000 },
    )
    .toBe(true)
}

test.describe('while the list is on its way', () => {
  // One bottle listed: a rail that says "To buy · 0" or "Nothing to buy yet"
  // before it is read says something false.
  test.use({ world: world((w) => (w.list = [I.campari])) })

  test('To buy states no count and no empty line until the list has been read', async ({ page, bar }) => {
    await recordRail(page)
    bar.slowDown(1500)
    await page.goto('/tonight')

    // The list read is out, and held for 1.5 seconds.
    await expect.poll(() => bar.calls('GET', /^\/users\/1\/shopping-list$/).length).toBeGreaterThan(0)
    expect(await toBuy(page).textContent()).toBe('To buy')
    expect(await emptyLine(page).count()).toBe(0)

    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(toBuy(page)).toHaveText('To buy · 1')
    const states = await recorded(page)
    expect(runs(states.map((s) => s.toBuy).filter((t) => t !== null))).toEqual(['To buy', 'To buy · 1'])
    expect(states.filter((s) => s.empty)).toEqual([])
  })
})

test.describe('until the list has been read', () => {
  // Scotch whisky, the bottle the user's ranking names first, is already
  // listed: offered before the list is read, it would be listed twice.
  test.use({ world: world((w) => (w.list = [I.scotch])) })

  test('the rail offers no bottle, not even the one already listed', async ({ page, bar }) => {
    await recordRail(page)
    const releaseList = await hold(page, listRead)
    await page.goto('/tonight')

    // The shelf, the ranking and the favourites have answered and been drawn.
    await expect.poll(() => bar.calls('GET', /^\/users\/1\/ingredients\/recommend$/).length).toBeGreaterThan(0)
    await settled(bar)
    expect(bar.calls('GET', /^\/ingredients$/).length).toBeGreaterThan(0)
    expect(offered(await recorded(page))).toEqual([])
    expect(await buyNext(page).count()).toBe(0)
    expect(await rail(page).locator('.restock-section').count()).toBe(0)
    expect(await rail(page).getByRole('button', { name: 'List it' }).count()).toBe(0)
    expect(await toBuy(page).textContent()).toBe('To buy')
    expect(await emptyLine(page).count()).toBe(0)

    releaseList()
    await expect(listItem(page, 'Scotch whisky')).toBeVisible()
    await expect(toBuy(page)).toHaveText('To buy · 1')
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Dark rum')
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText([
      'Rye whiskey',
      'Tequila',
      'Vodka',
      'Cointreau',
    ])
    const states = await recorded(page)
    expect(offered(states)).not.toContain('Scotch whisky')
    expect(states.filter((s) => s.empty)).toEqual([])
  })
})

test.describe('until the shelf has been read', () => {
  test.use({ world: world((w) => (w.favorites = [C.penicillin])) })

  test('the rail offers no bottle, and then only what the shelf does not cover', async ({ page, bar }) => {
    await recordRail(page)
    const releaseShelf = await hold(page, shelfRead)
    await page.goto('/tonight')

    // The list, the ranking and the favourites have answered and been drawn.
    await expect.poll(() => bar.calls('GET', /^\/users\/1\/ingredients\/recommend$/).length).toBeGreaterThan(0)
    await settled(bar)
    expect(bar.calls('GET', /^\/users\/1\/shopping-list$/).length).toBeGreaterThan(0)
    expect(bar.calls('GET', /^\/cocktails$/).filter((c) => c.query.get('filter[favorites]') === 'true').length).toBeGreaterThan(0)
    expect(offered(await recorded(page))).toEqual([])
    expect(await buyNext(page).count()).toBe(0)
    expect(await rail(page).locator('.restock-section').count()).toBe(0)
    expect(await rail(page).getByRole('button', { name: 'List it' }).count()).toBe(0)
    // The list is read: its count and its empty line are true.
    await expect(toBuy(page)).toHaveText('To buy · 0')
    await expect(emptyLine(page)).toBeVisible()

    releaseShelf()
    // Honey syrup is the Penicillin's one gap: the Laphroaig 10 covers Islay Scotch.
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Honey syrup')
    await expect(buyNext(page).locator('.buy-next-reason')).toHaveText('completes 1 favorite')
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText([
      'Scotch whisky',
      'Dark rum',
      'Rye whiskey',
      'Tequila',
      'Vodka',
    ])
    await expect(group(page, 'For your favorites')).toHaveCount(0)
    const states = await recorded(page)
    expect(offered(states)).not.toContain('Islay Scotch')
    expect(runs(states.map((s) => s.buyNext).filter((b) => b !== null))).toEqual([
      'Honey syrup — completes 1 favorite',
    ])
  })
})

test.describe('a shelf that cannot be read', () => {
  test.use({ world: world((w) => (w.favorites = [C.penicillin])) })

  test('the rail says so where its suggestions go and offers nothing, and Retry brings them', async ({
    page,
    bar,
  }) => {
    // GET /ingredients?filter[on_shelf]=true fails twice: the first try and its
    // one retry (src/app.tsx, retry: 1). The bar answers from the third.
    bar.fail(/^\/ingredients$/, { method: 'GET', status: 500, times: 2 })
    await recordRail(page)
    await page.goto('/tonight')

    const alert = rail(page).getByRole('alert')
    await expect(alert).toHaveCount(1)
    await expect(alert).toContainText('The bar didn’t answer — try again.')
    // The list was read: its count and its empty line stand, above the line.
    await expect(toBuy(page)).toHaveText('To buy · 0')
    await expect(emptyLine(page)).toBeVisible()
    const lineBox = await emptyLine(page).boundingBox()
    const alertBox = await alert.boundingBox()
    expect(lineBox && alertBox && alertBox.y > lineBox.y).toBe(true)
    await expect(buyNext(page)).toHaveCount(0)
    await expect(rail(page).locator('.restock-section')).toHaveCount(0)
    await expect(rail(page).getByRole('button', { name: 'List it' })).toHaveCount(0)
    await settled(bar)
    expect(offered(await recorded(page))).toEqual([])

    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(rail(page).getByRole('alert')).toHaveCount(0)
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Honey syrup')
    await expect(buyNext(page).locator('.buy-next-reason')).toHaveText('completes 1 favorite')
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText([
      'Scotch whisky',
      'Dark rum',
      'Rye whiskey',
      'Tequila',
      'Vodka',
    ])
    const states = await recorded(page)
    expect(offered(states)).not.toContain('Islay Scotch')
  })
})
