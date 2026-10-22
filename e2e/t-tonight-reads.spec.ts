import type { Page } from '@playwright/test'
import { C, I, bareWorld, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// What Tonight acts on before, or without, the reads its rail is decided from.
//
// ADR-008: every list entry must be able to say why it exists, and the rail's
// offer is a ranking: favourites gaps outrank the server's recommend, staples
// are standing orders that stay out of the suggestions, and each group leaves
// out what a higher one claimed. So each part of the offer waits for the reads
// it is decided from, as it already waits for the shelf and the list
// (e2e/b-tonight-before-read.spec.ts): Buy next and For your favorites for the
// favourites; Restock next, and a Buy next taken from it, for the ranking and
// the staples as well. Nothing is shown and then swapped for something else.
//
// A read that fails says so in the error voice (ADR-007 Consequences: "screens
// that need the API say so in the error voice"), in the rail where the offer
// goes, and once: one line for whichever of its reads failed, not one per read
// (chrispezza/barback#71). Nothing is decided from the read that failed.
//
// The "Add to the list" type-ahead marks a bottle already listed (pressed) and
// takes it off on a tap. That is a fact about the list, so its chips wait for
// the list read: before it, a listed bottle would show as not listed and a tap
// would list it again.
//
// The empty state names the bottles to start with from the same suggestions
// as Restock next (frontend-spec §5 "Empty states are directive"), so it names
// them only once those are ready, and says the generic line until then.

const rail = (page: Page) => page.locator('#buy')
const pour = (page: Page) => page.locator('#pour')
const near = (page: Page) => page.locator('#near')
const buyNext = (page: Page) => rail(page).locator('.buy-next')
const group = (page: Page, heading: string) =>
  rail(page)
    .locator('.restock-section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
/** A shopping-list row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
const chips = (page: Page) => rail(page).locator('.chip-row .bb-chip')
const emptyBody = (page: Page) => pour(page).locator('.bb-empty__body')

const ERROR = 'The bar didn’t answer — try again.'

function world(base: WorldSeed, change: (w: WorldSeed) => void): WorldSeed {
  change(base)
  return base
}

/** One state of the rail and the pour section's empty state, as recorded on every change. */
interface Frame {
  /** "Name — reason" of the Buy next card, if any. */
  buyNext: string | null
  /** Every bottle the rail offers to list: Buy next, then each group's rows. */
  offers: string[]
  /** Error lines in the rail. */
  alerts: number
  /** The pour section's empty-state body, if any. */
  body: string | null
}

/**
 * Record every state the rail and the empty state pass through from the first
 * paint, so a state shown for a moment is caught as surely as one that lasts.
 */
async function record(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: unknown[] }
    w.__frames = []
    let last = ''
    new MutationObserver(() => {
      const rail = document.getElementById('buy')
      if (!rail) return
      const card = rail.querySelector('.buy-next')
      const frame = {
        buyNext: card
          ? `${card.querySelector('.buy-next-name')?.textContent ?? ''} — ${card.querySelector('.buy-next-reason')?.textContent ?? ''}`
          : null,
        offers: [...rail.querySelectorAll('.buy-next-name, .restock-name')].map((n) => n.textContent ?? ''),
        alerts: rail.querySelectorAll('[role="alert"]').length,
        body: document.querySelector('#pour .bb-empty__body')?.textContent ?? null,
      }
      const key = JSON.stringify(frame)
      if (key === last) return
      last = key
      w.__frames.push(frame)
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
}

const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames)

/** Each value in turn, a run of the same value counted once. */
const runs = <T>(values: T[]): T[] => values.filter((v, i) => i === 0 || v !== values[i - 1])

/** Every bottle offered in any recorded state, each named once. */
const offered = (states: Frame[]): string[] => [...new Set(states.flatMap((s) => s.offers))]

/**
 * Hold every GET `matches` picks out from now on; the fake answers, and
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

/**
 * Answer the first `times` GETs `matches` picks out with a 500, before the fake
 * sees them; the fake answers the rest. FakeBar.fail matches a path alone, and
 * the favourites share theirs with every other drinks read. Returns how many
 * have failed so far.
 */
async function failFirst(page: Page, matches: (url: URL) => boolean, times: number): Promise<() => number> {
  let failed = 0
  await page.route(
    (url) => matches(url),
    async (route) => {
      if (route.request().method() === 'GET' && failed < times) {
        failed += 1
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Server Error' }) })
      }
      return route.fallback()
    },
  )
  return () => failed
}

/**
 * Drop every API request `matches` picks out, until `lift` is called, and
 * count those dropped (e2e/t-warm-stale.spec.ts). Playwright asks the route
 * registered last first, so this one is asked before the fake, and passes
 * every other request on to it.
 */
async function outage(page: Page, matches: (url: URL) => boolean) {
  let down = true
  let dropped = 0
  await page.route(
    (url) => url.pathname.startsWith('/bar/api/'),
    (route) => {
      if (!down || !matches(new URL(route.request().url()))) return route.fallback()
      dropped += 1
      return route.abort('connectionrefused')
    },
  )
  return {
    lift: () => {
      down = false
    },
    dropped: () => dropped,
  }
}

/** Client-side navigation through the visible main nav (rail or tab bar). */
async function goTo(page: Page, label: string, heading: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

/** GET /users/{id}/shopping-list: useShoppingList. */
const listRead = (url: URL) => /^\/bar\/api\/users\/\d+\/shopping-list$/.test(url.pathname)
/** GET /cocktails?filter[favorites]=true: Tonight's favourites read. */
const favoritesRead = (url: URL) =>
  url.pathname === '/bar/api/cocktails' && url.searchParams.get('filter[favorites]') === 'true'
/** GET /users/{id}/ingredients/recommend: the server's ranking. */
const recommendRead = (url: URL) => /^\/bar\/api\/users\/\d+\/ingredients\/recommend$/.test(url.pathname)
/** GET /ingredients/{slug}-{bar}: the useStaples lookups. */
const stapleRead = (url: URL) => /^\/bar\/api\/ingredients\/[a-z]+(?:-[a-z]+)*-\d+$/.test(url.pathname)

/** The rail's offer, by its three headings. */
const offerHeadings = (page: Page) =>
  rail(page).getByRole('heading', { name: /^(Buy next|For your favorites|Restock next)$/ })

/**
 * Resolve once the fake has recorded no new request, API or search, for
 * `quietMs`: every read the screen asks for has answered and been drawn, the
 * held ones aside (a held read is recorded only once released).
 */
async function settled(bar: FakeBar, quietMs = 500) {
  let seen = -1
  let since = Date.now()
  await expect
    .poll(
      () => {
        const count = bar.requests.length
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

const listStores = (bar: FakeBar) => bar.calls('POST', /\/shopping-list\/batch-store$/).map((c) => c.body)
const listDeletes = (bar: FakeBar) => bar.calls('POST', /\/shopping-list\/batch-delete$/).map((c) => c.body)

/** The rail's error line, the page's only one, with its Retry. */
async function expectOneRailError(page: Page) {
  const alert = rail(page).getByRole('alert')
  await expect(alert).toHaveCount(1)
  await expect(page.getByRole('alert')).toHaveCount(1)
  await expect(alert).toContainText(ERROR)
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
  return alert
}

test.describe('the "Add to the list" type-ahead, until the list has been read', () => {
  // Campari is listed: a chip that says it is not, before the list is read,
  // would list it a second time on a tap instead of taking it off.
  test.use({ world: world(defaultWorld(), (w) => (w.list = [I.campari])) })

  test('shows no chip, then marks the listed bottle and takes it off on a tap', async ({ page, bar }) => {
    const releaseList = await hold(page, listRead)
    await page.goto('/tonight')
    await rail(page).getByRole('searchbox', { name: 'Add to the list' }).fill('camp')

    // The search has answered and been drawn; the list read is still held.
    await expect
      .poll(() => bar.requests.filter((r) => r.service === 'search' && r.path === '/indexes/ingredients/search').length)
      .toBeGreaterThan(0)
    await settled(bar)
    expect(
      await chips(page).evaluateAll((els) =>
        els.map((e) => `${e.textContent ?? ''} aria-pressed=${e.getAttribute('aria-pressed') ?? ''}`),
      ),
    ).toEqual([])

    releaseList()
    await expect(listItem(page, 'Campari')).toBeVisible()
    const chip = chips(page).filter({ hasText: 'Campari' })
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await chip.click()
    await expect(listItem(page, 'Campari')).toHaveCount(0)
    await settled(bar)
    expect(listDeletes(bar)).toEqual([{ ingredients: [{ id: I.campari }] }])
    expect(listStores(bar)).toEqual([])
  })
})

test.describe('Buy next, until the favourites have been read', () => {
  // A favourited Penicillin: once the shelf is read, Honey syrup is its one
  // gap (the Laphroaig 10 covers Islay Scotch), so it outranks the server's
  // Scotch whisky as Buy next (ADR-008).
  test.use({ world: world(defaultWorld(), (w) => (w.favorites = [C.penicillin])) })

  test('names no bottle, then the favourite’s, never the server’s first', async ({ page, bar }) => {
    await record(page)
    const releaseFavorites = await hold(page, favoritesRead)
    await page.goto('/tonight')

    // The shelf, the list, the ranking and the staples have answered and been drawn.
    await expect.poll(() => bar.calls('GET', /^\/users\/1\/ingredients\/recommend$/).length).toBeGreaterThan(0)
    await settled(bar)
    expect(bar.calls('GET', /^\/users\/1\/shopping-list$/).length).toBeGreaterThan(0)
    expect(runs((await frames(page)).map((f) => f.buyNext))).toEqual([null])
    expect(offered(await frames(page))).toEqual([])

    releaseFavorites()
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Honey syrup')
    await expect(buyNext(page).locator('.buy-next-reason')).toHaveText('completes 1 favorite')
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText([
      'Scotch whisky',
      'Dark rum',
      'Rye whiskey',
      'Tequila',
      'Vodka',
    ])
    const states = await frames(page)
    expect(runs(states.map((f) => f.buyNext).filter((b) => b !== null))).toEqual(['Honey syrup — completes 1 favorite'])
  })
})

test.describe('a favourites read that fails', () => {
  test.use({ world: world(defaultWorld(), (w) => (w.favorites = [C.penicillin])) })

  test('says so in the rail, offers nothing it would decide, and Retry brings the favourite’s pick', async ({
    page,
    bar,
  }) => {
    // The first try and its one retry (src/app.tsx, retry: 1); the bar answers from the third.
    const failed = await failFirst(page, favoritesRead, 2)
    await record(page)
    await page.goto('/tonight')
    await expect.poll(failed).toBe(2)
    await settled(bar)

    const alert = await expectOneRailError(page)
    await expect(buyNext(page)).toHaveCount(0)
    await expect(rail(page).locator('.restock-section')).toHaveCount(0)
    expect(offered(await frames(page))).toEqual([])

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
    const states = await frames(page)
    expect(runs(states.map((f) => f.buyNext).filter((b) => b !== null))).toEqual(['Honey syrup — completes 1 favorite'])
  })
})

test.describe('a recommend read that fails', () => {
  test.use({ world: world(defaultWorld(), (w) => (w.favorites = [C.penicillin])) })

  test('says so in the rail; the favourite’s pick stands, and Retry brings Restock next', async ({ page, bar }) => {
    bar.fail(/^\/users\/1\/ingredients\/recommend$/, { method: 'GET', status: 500, times: 2 })
    await page.goto('/tonight')
    await expect.poll(() => bar.calls('GET', /^\/users\/1\/ingredients\/recommend$/).length).toBeGreaterThan(1)
    await settled(bar)

    const alert = await expectOneRailError(page)
    // Favourites outrank the ranking (ADR-008): the pick is decided without it.
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Honey syrup')
    await expect(group(page, 'Restock next')).toHaveCount(0)

    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(rail(page).getByRole('alert')).toHaveCount(0)
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText([
      'Scotch whisky',
      'Dark rum',
      'Rye whiskey',
      'Tequila',
      'Vodka',
    ])
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Honey syrup')
  })
})

test.describe('a staples read that fails', () => {
  // Tonic off the shelf: its standing order runs once the staples are read
  // (e2e/standing-orders.spec.ts).
  test.use({ world: world(defaultWorld(), (w) => (w.shelf = w.shelf.filter((id) => id !== I.tonic))) })

  test('says so in the rail, queues nothing, and Retry runs the standing order', async ({ page, bar }) => {
    // One staple failing fails the set (useStaples); the first try and its one retry.
    bar.fail(/^\/ingredients\/tonic-1$/, { method: 'GET', status: 500, times: 2 })
    await record(page)
    await page.goto('/tonight')
    await expect.poll(() => bar.calls('GET', /^\/ingredients\/tonic-1$/).length).toBeGreaterThan(1)
    await settled(bar)

    const alert = await expectOneRailError(page)
    expect(listStores(bar)).toEqual([])
    // Restock next leaves the staples out, and cannot tell which they are.
    await expect(rail(page).locator('.restock-section')).toHaveCount(0)
    await expect(buyNext(page)).toHaveCount(0)
    expect(offered(await frames(page))).not.toContain('Tonic')

    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(rail(page).getByRole('alert')).toHaveCount(0)
    await expect(listItem(page, 'Tonic')).toBeVisible()
    await expect(page.getByText('Staples out — queued: Tonic.')).toBeVisible()
    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    expect(offered(await frames(page))).not.toContain('Tonic')
  })
})

// The warm path (chrispezza/barback#144, item 3): Tonight has read the bar
// once, then one of the offer's reads fails when it is asked again. TanStack
// Query keeps that read's last answer beside the error, and the answer is
// stale: nothing is decided from it (unlessFailed), as from a first read that
// failed. The shelf, the list and both drink sections answer, so the rail's
// line is the page's only one.
test.describe('a read of the offer’s that fails when Tonight asks again', () => {
  // A favourited Penicillin: Honey syrup is Buy next, ahead of the server's ranking.
  test.use({ world: world(defaultWorld(), (w) => (w.favorites = [C.penicillin])) })

  const RESTOCK = ['Scotch whisky', 'Dark rum', 'Rye whiskey', 'Tequila', 'Vodka']

  /** Read Tonight once, then come back to it with `matches` down. */
  async function comeBackWith(page: Page, matches: (url: URL) => boolean) {
    await page.goto('/tonight')
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Honey syrup')
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText(RESTOCK)
    await goTo(page, 'Shelf', 'Shelf')
    const down = await outage(page, matches)
    await goTo(page, 'Tonight', 'Tonight')
    // The read and its one retry (src/app.tsx, retry: 1).
    await expect.poll(down.dropped, { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
    return down
  }

  test('the favourites: says so in the rail, offers nothing from the last answer, and Retry brings it back', async ({
    page,
  }) => {
    const { lift } = await comeBackWith(page, favoritesRead)

    const alert = await expectOneRailError(page)
    // Not the favourite's pick, nor the ranking's in its place: Restock
    // leaves out what the favourites claim, so it waits for them too.
    await expect(offerHeadings(page)).toHaveCount(0)

    lift()
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Honey syrup')
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText(RESTOCK)
  })

  test('the ranking: says so in the rail, the favourite’s pick stands, and Retry brings Restock next back', async ({
    page,
  }) => {
    const { lift } = await comeBackWith(page, recommendRead)

    const alert = await expectOneRailError(page)
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Honey syrup')
    await expect(offerHeadings(page)).toHaveText(['Buy next'])

    lift()
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText(RESTOCK)
  })

  test('the staples: says so in the rail, the favourite’s pick stands, and Retry brings Restock next back', async ({
    page,
  }) => {
    const { lift } = await comeBackWith(page, stapleRead)

    const alert = await expectOneRailError(page)
    // Restock next leaves the staples out, so it waits for their read.
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Honey syrup')
    await expect(offerHeadings(page)).toHaveText(['Buy next'])

    lift()
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText(RESTOCK)
  })

  // A whole outage fails the drink sections' reads as well, each under its
  // own line, and the rail shows the stamped list (ADR-007). Either section's
  // Retry asks again for the reads the offer is decided from, as it does for
  // the status line's (e2e/t-warm-stale.spec.ts pins the pour section's), so
  // the rail offers again with it rather than raising a line of its own
  // (chrispezza/barback#71).
  test('after a whole outage, the near section’s Retry brings the offer back with its cards', async ({ page }) => {
    const { lift } = await comeBackWith(page, () => true)
    await expect(near(page).getByRole('alert')).toHaveCount(1)
    await expect(offerHeadings(page)).toHaveCount(0)

    lift()
    await near(page).getByRole('alert').getByRole('button', { name: 'Retry' }).click()
    await expect(near(page).getByRole('alert')).toHaveCount(0)
    await expect(rail(page).getByRole('alert')).toHaveCount(0)
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Honey syrup')
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText(RESTOCK)
  })
})

// The standing orders are writes the user did not tap (ADR-008), so they are
// decided only from a staples read that has answered, as they are only against
// a list just read: not from the last answer while the staples are read again,
// nor from the one a failed refetch leaves in hand. Either may say a staple is
// off the shelf that is back on it, or on it when it has run out.
test.describe('the standing orders, when the staples fail as Tonight asks again', () => {
  test('send no write from the last answer, and Retry reads the staple back on the shelf', async ({ page, bar }) => {
    // Tonic off the shelf, and its standing order's write fails, so the
    // next Tonight would send it again (e2e/standing-orders.spec.ts).
    bar.model.shelf.delete(I.tonic)
    bar.fail(/\/shopping-list\/batch-store$/, { method: 'POST', status: 500, times: 1 })
    await page.goto('/tonight')
    await expect(page.getByText('The list didn’t take that change.')).toBeVisible()
    await settled(bar)
    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])

    await goTo(page, 'Shelf', 'Shelf')
    // Tonic is back on the shelf (bought, and put there on another device),
    // and the staples cannot be read again.
    bar.model.shelf.add(I.tonic)
    const { lift } = await outage(page, stapleRead)
    await goTo(page, 'Tonight', 'Tonight')

    const alert = await expectOneRailError(page)
    await settled(bar)
    // The last answer has Tonic off the shelf; the list and the shelf were read, and it is on the shelf.
    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    await expect(listItem(page, 'Tonic')).toHaveCount(0)

    lift()
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await settled(bar)
    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    expect([...bar.model.list.keys()]).toEqual([])
  })

  test('hold a staple dropped meanwhile as dropped once they answer', async ({ page, bar }) => {
    // Tonic on the shelf: the staples read says so.
    await page.goto('/tonight')
    await settled(bar)
    expect(listStores(bar)).toEqual([])

    await goTo(page, 'Shelf', 'Shelf')
    // Used up and listed on another device, and the staples cannot be read again.
    bar.model.shelf.delete(I.tonic)
    bar.model.list.set(I.tonic, 1)
    const { lift } = await outage(page, stapleRead)
    await goTo(page, 'Tonight', 'Tonight')

    const alert = await expectOneRailError(page)
    // Taken off the list by hand while the staples are unknown (chrispezza/barback#55).
    await page.getByRole('button', { name: 'Remove Tonic from the list' }).click()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    expect(listDeletes(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])

    lift()
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await settled(bar)
    // Tonic is off the shelf and off the list: dropped by hand, it stays dropped.
    expect(listStores(bar)).toEqual([])
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    expect([...bar.model.list.keys()]).toEqual([])
  })
})

test.describe('the bare shelf’s empty state, until its suggestions are ready', () => {
  const GENERIC = 'Add a spirit, a citrus and a sweetener and the first drinks open up.'

  /** The empty state's bodies so far, from the first paint, a run of one counted once. */
  const bodies = async (page: Page) => runs((await frames(page)).map((f) => f.body).filter((b) => b !== null))

  test.describe('the staples', () => {
    // Every staple is off a bare shelf and queues itself once read; the
    // ranking names several. They are standing orders, never a bottle to
    // start with.
    test.use({ world: bareWorld() })

    test('says the generic line, then names bottles that are not staples, and no others', async ({ page, bar }) => {
      await record(page)
      const releaseStaples = await hold(page, stapleRead)
      await page.goto('/tonight')
      await expect(pour(page).getByRole('heading', { name: 'The shelf is bare', exact: true })).toBeVisible()
      await expect.poll(() => bar.calls('GET', /^\/users\/1\/ingredients\/recommend$/).length).toBeGreaterThan(0)
      await settled(bar)
      expect(await bodies(page)).toEqual([GENERIC])

      releaseStaples()
      const names = 'Start with Gin, Sweet vermouth, White rum — ranked by how many recipes call for them.'
      await expect(emptyBody(page)).toHaveText(names)
      expect(await bodies(page)).toEqual([GENERIC, names])
    })
  })

  test.describe('the favourites', () => {
    // A favourited Negroni wants Campari, gin and sweet vermouth: its group
    // claims all three, so the names go on to the next bottles the ranking
    // gives (ADR-008: each group leaves out what a higher one claimed).
    test.use({ world: world(bareWorld(), (w) => (w.favorites = [C.negroni])) })

    test('says the generic line, then names bottles no favourite claims, and no others', async ({ page, bar }) => {
      await record(page)
      const releaseFavorites = await hold(page, favoritesRead)
      await page.goto('/tonight')
      await expect(pour(page).getByRole('heading', { name: 'The shelf is bare', exact: true })).toBeVisible()
      await expect.poll(() => bar.calls('GET', /^\/users\/1\/ingredients\/recommend$/).length).toBeGreaterThan(0)
      await settled(bar)
      expect(await bodies(page)).toEqual([GENERIC])

      releaseFavorites()
      const names = 'Start with White rum, Scotch whisky, Bourbon whiskey — ranked by how many recipes call for them.'
      await expect(emptyBody(page)).toHaveText(names)
      expect(await bodies(page)).toEqual([GENERIC, names])
    })
  })
})
