import type { BrowserContext, Page } from '@playwright/test'
import { C, I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// The store aisle with no signal at all: the DEVICE reports no network, not
// only the bar out of reach (ADR-007; chrispezza/barback#107, #52). The
// browser says navigator.onLine is false and fires "offline"
// (context.setOffline). Route interception still answers while the context is
// offline, so every spec here also drops the bar's requests, as the network
// would.
//
// ADR-007 Decision: the stamped list is "rendered read-only ('Offline — the
// list as it stood …') when the API is unreachable". Consequences: "screens
// that need the API say so in the error voice"; "Offline check-off is not
// supported; mutations require connectivity"; the outbox (option 3) was not
// chosen. frontend-spec §8 defers offline write-sync, and §5 says an
// optimistic flip rolls back on error.
//
// TanStack Query's default networkMode ('online') does neither. Once the
// browser has said it is offline, a read is paused, not failed, so no section
// reaches its error line and Tonight never shows its snapshot; a write is
// paused too, says nothing, and is sent when the device reconnects: an outbox
// nobody chose. A read or a write asked for with no network fails here, as it
// does with the bar out of reach, and nothing goes out later behind the
// user's back.

/** src/api/queries.ts LIST_SNAPSHOT_KEY. The spec cannot import the client
 *  module: it reads import.meta.env when it loads. */
const LIST_SNAPSHOT_KEY = 'barback:list-snapshot'

/** Store a snapshot as an earlier visit would have stamped it, three hours ago. */
async function seedSnapshot(page: Page, names: string[]) {
  const value = JSON.stringify({ at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), names })
  await page.addInitScript(
    ([key, stored]) => window.localStorage.setItem(key, stored),
    [LIST_SNAPSHOT_KEY, value] as const,
  )
}

function listing(ids: number[]): WorldSeed {
  const w = defaultWorld()
  w.list = ids
  return w
}

/**
 * The device's network, as the page sees it and as the bar does. Off, the
 * browser reports itself offline and fires "offline", and every request to
 * the bar or to search is dropped before the fake sees it; each one dropped is
 * kept, as "METHOD /path below /bar/api". On, the bar answers again. Unlike
 * FakeBar.takeApiDown, it can be lifted, so a spec can see what goes out once
 * the device reconnects. Registered after the fake, so it is asked first.
 */
async function deviceNetwork(page: Page, context: BrowserContext) {
  let online = true
  const dropped: string[] = []
  await page.route(
    (url) => url.pathname.startsWith('/bar/') || url.pathname.startsWith('/search/'),
    (route) => {
      if (online) return route.fallback()
      const req = route.request()
      dropped.push(`${req.method()} ${new URL(req.url()).pathname.replace(/^\/bar\/api/, '')}`)
      return route.abort('internetdisconnected')
    },
  )
  return {
    /** Requests dropped while offline, optionally only those of one method. */
    dropped: (method?: string) => dropped.filter((d) => !method || d.startsWith(`${method} `)),
    off: async () => {
      online = false
      await context.setOffline(true)
    },
    on: async () => {
      online = true
      await context.setOffline(false)
    },
  }
}

/**
 * Resolve once the fake has recorded no new request for `quietMs` (as in
 * e2e/standing-orders.spec.ts). The assertion that follows is that a write did
 * not happen, so the screen must go quiet first.
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

/** Client-side navigation through the visible main nav (rail or tab bar). */
async function goTo(page: Page, label: string, heading: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

const rail = (page: Page) => page.locator('#buy')
/** A live shopping-list row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
const offlineLine = (page: Page) => rail(page).getByText(/^Offline — the list as it stood .+\.$/)
const snapshotNames = (page: Page) => rail(page).locator('.snapshot-list li')
/** The toast (role="status" for a neutral one; the DS Toast). */
const toast = (page: Page) => page.locator('.toast-host').getByRole('status')

/** The section's one error line (ErrorLine is role="alert") and its retry. */
async function expectErrorLine(page: Page, section: string) {
  const alert = page.locator(section).getByRole('alert')
  await expect(alert).toHaveCount(1)
  await expect(alert).toContainText('The bar didn’t answer — try again.')
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
}

/**
 * The section's error line for a failure the pour section's line announces
 * (the bootstrap): the same words and a Retry named for what it asks again,
 * with no second alert (chrispezza/barback#71).
 */
async function expectQuietErrorLine(page: Page, section: string, retry: string) {
  await expect(page.locator(section).getByRole('alert')).toHaveCount(0)
  const line = page.locator(section).getByText('The bar didn’t answer — try again.')
  await expect(line).toHaveCount(1)
  await expect(line.getByRole('button', { name: retry, exact: true })).toBeVisible()
}

/**
 * Tonight as ADR-007 Validation reads it with the API gone: "the rail shows the
 * stamped snapshot; every other section shows the error line" — and nothing
 * stated that the bar did not say. Opened from a warm start, each section's
 * own read failed and each announces it; on a cold start the one failure is
 * the bootstrap's, which the pour section announces and the near section
 * states without a second alert (chrispezza/barback#71).
 */
async function expectTonightOffline(page: Page, names: string[], start: 'warm' | 'cold') {
  await expect(offlineLine(page)).toBeVisible()
  await expect(snapshotNames(page)).toHaveText(names)
  await expectErrorLine(page, '#pour')
  if (start === 'warm') await expectErrorLine(page, '#near')
  else await expectQuietErrorLine(page, '#near', 'Retry the drinks one bottle away')
  await expect(rail(page).getByRole('alert')).toHaveCount(0)
  // Nothing in the rail writes (chrispezza/barback#62).
  await expect(rail(page).locator('.shopping-row-line')).toHaveCount(0)
  await expect(rail(page).getByRole('searchbox', { name: 'Add to the list' })).toHaveCount(0)
  await expect(rail(page).getByRole('button', { name: 'List it' })).toHaveCount(0)
  await expect(page.getByText('Counting the bar…')).toHaveCount(0)
  await expect(page.getByText('Nothing to buy yet')).toHaveCount(0)
}

test.describe('Tonight with the device offline', () => {
  test.use({ world: listing([I.campari, I.cointreau]) })

  test('opened after the signal went, it shows the stamped snapshot and the error lines', async ({
    page,
    context,
    bar,
  }) => {
    // The app is open on the Shelf, as at home; Tonight has read nothing yet.
    await seedSnapshot(page, ['Campari', 'Cointreau'])
    await page.goto('/shelf')
    await expect(page.locator('.shelf-count')).toHaveText('11 bottles on the shelf.')

    // The phone loses its signal in the aisle, then Tonight is opened.
    await context.setOffline(true)
    bar.takeApiDown()
    await goTo(page, 'Tonight', 'Tonight')

    await expectTonightOffline(page, ['Campari', 'Cointreau'], 'warm')
    expect(bar.calls('POST')).toEqual([])
  })

  test('a cold start that loses the signal before the bar answers shows the snapshot and the error lines', async ({
    page,
    context,
    bar,
  }) => {
    await seedSnapshot(page, ['Campari', 'Cointreau'])
    // Nothing in memory: the first reads (/bars, /profile) are held on their
    // way out, the signal goes, and then they reach a network that is gone.
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const waiting: string[] = []
    await page.route('**/bar/api/**', async (route) => {
      waiting.push(new URL(route.request().url()).pathname)
      await held
      await route.fallback()
    })
    await page.goto('/tonight')
    await expect.poll(() => [...waiting].sort()).toEqual(['/bar/api/bars', '/bar/api/profile'])

    await context.setOffline(true)
    bar.takeApiDown()
    release()

    await expectTonightOffline(page, ['Campari', 'Cointreau'], 'cold')
    expect(bar.calls('POST')).toEqual([])
  })

  test('a cold start with the device already offline shows the snapshot and the error lines', async ({
    page,
    context,
    bar,
    baseURL,
  }) => {
    // The installed app opens anywhere (ADR-007): public/sw.js serves the
    // shell from its cache. Workers are blocked in these journeys
    // (playwright.config.ts), so the shell is served here instead, fetched by
    // Playwright rather than the offline page. Only the preview server's own
    // files: a request for any other origin still reaches the fake, which
    // records it as escaped and fails the journey (ADR-011, hermetic).
    const preview = new URL(baseURL ?? '').origin
    await page.route(
      (url) => url.origin === preview && !url.pathname.startsWith('/bar/') && !url.pathname.startsWith('/search/'),
      async (route) => route.fulfill({ response: await route.fetch() }),
    )
    await seedSnapshot(page, ['Campari', 'Cointreau'])
    await context.setOffline(true)
    bar.takeApiDown()
    await page.goto('/tonight')
    expect(await page.evaluate(() => navigator.onLine)).toBe(false)

    await expectTonightOffline(page, ['Campari', 'Cointreau'], 'cold')
    expect(bar.calls('POST')).toEqual([])
  })
})

test.describe('the classics with the device offline', () => {
  test.use({ world: listing([I.campari]) })

  test('opened after the signal went, the roster says so in the error voice', async ({ page, context, bar }) => {
    await page.goto('/tonight')
    await expect(listItem(page, 'Campari')).toBeVisible()

    await context.setOffline(true)
    bar.takeApiDown()
    await goTo(page, 'Classics', 'The classics')

    const alert = page.getByRole('main').getByRole('alert')
    await expect(alert).toHaveCount(1)
    await expect(alert).toContainText('The bar didn’t answer — try again.')
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
    await expect(page.locator('main .card-list > li')).toHaveCount(0)
  })
})

// A write made offline is tried, fails with its own toast, and is never sent
// later (ADR-007 Consequences; frontend-spec §8). Each journey reads the bar
// while the device is online, makes the write with no signal, brings the
// signal back, and checks the bar holds what it held before.
test.describe('a write made with the device offline', () => {
  test.use({ world: listing([I.campari, I.cointreau]) })

  test('dropping a bottle from the list fails with its toast, and is not sent on reconnect', async ({
    page,
    context,
    bar,
  }) => {
    const network = await deviceNetwork(page, context)
    await page.goto('/tonight')
    await expect(listItem(page, 'Campari')).toBeVisible()
    await settled(bar)

    await network.off()
    await page.getByRole('button', { name: 'Remove Campari from the list' }).click()

    await expect(toast(page)).toHaveText('The list didn’t take that change.')
    // Tried, and dropped by the network: not held for later.
    expect(network.dropped('POST')).toEqual(['POST /users/1/shopping-list/batch-delete'])
    // The list it reads back cannot be read either: the rail shows the snapshot.
    await expect(offlineLine(page)).toBeVisible()
    await expect(snapshotNames(page)).toHaveText(['Campari', 'Cointreau'])

    await network.on()
    // The list is read again on reconnect, and Campari is still on it.
    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(listItem(page, 'Cointreau')).toBeVisible()
    await settled(bar)
    expect(bar.calls('POST')).toEqual([])
    expect([...bar.model.list.keys()]).toEqual([I.campari, I.cointreau])
  })

  test('a check-off fails with its toast, leaves the bottle on the list, and is not sent on reconnect', async ({
    page,
    context,
    bar,
  }) => {
    const network = await deviceNetwork(page, context)
    await page.goto('/tonight')
    await expect(listItem(page, 'Campari')).toBeVisible()
    await settled(bar)

    await network.off()
    await listItem(page, 'Campari').click()

    await expect(toast(page)).toHaveText('That didn’t move — the bottle is still on the list.')
    expect(network.dropped('POST')).toEqual(['POST /users/1/ingredients/batch-store'])

    await network.on()
    await expect(listItem(page, 'Campari')).toBeVisible()
    await settled(bar)
    expect(bar.calls('POST')).toEqual([])
    expect([...bar.model.list.keys()]).toEqual([I.campari, I.cointreau])
    expect(bar.model.shelf.has(I.campari)).toBe(false)
  })

  test('listing a bottle fails with its toast, and is not sent on reconnect', async ({ page, context, bar }) => {
    const network = await deviceNetwork(page, context)
    await page.goto('/tonight')
    const buyNext = page.locator('.buy-next')
    await expect(buyNext).toContainText('Scotch whisky')
    await settled(bar)

    await network.off()
    await buyNext.getByRole('button', { name: 'List it' }).click()

    await expect(toast(page)).toHaveText('The list didn’t take that change.')
    await expect(page.getByText('Scotch whisky — listed.')).toHaveCount(0)
    expect(network.dropped('POST')).toEqual(['POST /users/1/shopping-list/batch-store'])

    await network.on()
    await expect(listItem(page, 'Campari')).toBeVisible()
    await settled(bar)
    expect(bar.calls('POST')).toEqual([])
    expect(bar.model.list.has(I.scotch)).toBe(false)
    await expect(page.getByText('Scotch whisky — listed.')).toHaveCount(0)
  })

  test('a favourite rolls back with its toast, and is not sent on reconnect', async ({ page, context, bar }) => {
    const network = await deviceNetwork(page, context)
    await page.goto('/drinks/daiquiri-1')
    const favorite = page.getByRole('main').getByRole('button', { name: /favorite/i })
    await expect(favorite).toHaveText('Favorite')
    await settled(bar)

    await network.off()
    await favorite.click()

    await expect(toast(page)).toHaveText('The favorite didn’t take.')
    // The flip went back when the write failed (frontend-spec §5).
    await expect(favorite).toHaveText('Favorite')
    await expect(favorite).toHaveAttribute('aria-pressed', 'false')
    expect(network.dropped('POST')).toEqual([`POST /cocktails/${C.daiquiri}/toggle-favorite`])

    await network.on()
    await settled(bar)
    expect(bar.calls('POST')).toEqual([])
    expect(bar.model.favorites.has(C.daiquiri)).toBe(false)
    await expect(favorite).toHaveText('Favorite')
  })
})
