import type { BrowserContext, Locator, Page } from '@playwright/test'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// The two ingredient pickers when their search has no answer: the Shelf's
// "Add a bottle" and Tonight's "Add to the list" (frontend-spec §9 free-form
// add). Each searches Meilisearch and, failing that, the REST name filter
// (ADR-004; src/api/search.ts). When both fail, the picker says so in the
// error voice, in its chip row, with a Retry, and shows no chip: not an empty
// row, not "Nothing by that name." (a search that failed has not said that),
// and not the chips of an earlier query. ADR-007 Consequences: "screens that
// need the API say so in the error voice rather than showing cached matches."
// This is the Index search's rule (e2e/d-index-search.spec.ts).
//
// The store aisle is the device offline, not only the bar out of reach: the
// browser reports navigator.onLine false, and nothing it asks of the bar or of
// search arrives. A search asked for then has no answer either, and says so the
// same way; it is asked again by itself when the device reconnects. Whether
// that search waits paused for the network (TanStack Query's default
// networkMode) or is tried and fails (chrispezza/barback#136) is
// chrispezza/barback#107's open question, not this spec's: the offline
// journeys hold either way.
//
// What the type-ahead does while Meilisearch alone is down is
// chrispezza/barback#76, not this spec's: the REST name filter answers there
// (e2e/shelf.spec.ts). Every failed read below fails its first try and its one
// retry (src/app.tsx, retry: 1).

const ERROR = 'The bar didn’t answer — try again.'
const NOTHING = 'Nothing by that name.'
const NAME_READ = /^\/ingredients$/

interface Picker {
  screen: string
  label: string
  /** Where the picker and its chips live on the screen. */
  scope: (page: Page) => Locator
  /** Open the screen and wait until its own reads have answered. */
  open: (page: Page, bar: FakeBar) => Promise<void>
}

/**
 * Resolve once the fake has recorded no new request for `quietMs` (as in
 * e2e/t-tonight-reads.spec.ts), so a failure armed next is taken by the
 * picker's search and by nothing the screen was still reading.
 */
async function settled(bar: FakeBar, quietMs = 500): Promise<void> {
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

/**
 * The device's network, as the page sees it and as the bar does (the pattern
 * of e2e/x-offline-device.spec.ts on chrispezza/barback#136). Route
 * interception still answers while the context is offline
 * (chrispezza/barback#107), so off also drops every request to the bar or to
 * search before the fake sees it, as the network would, and keeps each one as
 * "METHOD /path?query", with the body when there is one. On lifts the drop
 * before the browser reports itself online again. Registered after the fake,
 * so it is asked first.
 */
async function deviceNetwork(page: Page, context: BrowserContext) {
  let online = true
  const dropped: string[] = []
  await page.route(
    (url) => url.pathname.startsWith('/bar/') || url.pathname.startsWith('/search/'),
    (route) => {
      if (online) return route.fallback()
      const req = route.request()
      const { pathname, search } = new URL(req.url())
      const body = req.postData()
      dropped.push(`${req.method()} ${pathname}${search}${body ? ` ${body}` : ''}`)
      return route.abort('internetdisconnected')
    },
  )
  return {
    /** Every request dropped while the device was offline. */
    dropped: (): string[] => [...dropped],
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
 * The picker's own search for `name`, as the network sees it: Meilisearch,
 * then the REST name filter (ADR-004; src/api/search.ts).
 */
function isPickerSearch(request: string, name: string): boolean {
  return (
    request.startsWith(`POST /search/indexes/ingredients/search {"q":${JSON.stringify(name)},`) ||
    request.startsWith(`GET /bar/api/ingredients?filter[name]=${encodeURIComponent(name)}&`)
  )
}

const PICKERS: Picker[] = [
  {
    screen: 'the Shelf',
    label: 'Add a bottle',
    scope: (page) => page.getByRole('main'),
    open: async (page, bar) => {
      await page.goto('/shelf')
      await expect(page.getByRole('main').getByRole('heading', { level: 2, name: 'Spirits · 4' })).toBeVisible()
      await settled(bar)
    },
  },
  {
    screen: 'Tonight',
    label: 'Add to the list',
    scope: (page) => page.locator('#buy'),
    open: async (page, bar) => {
      await page.goto('/tonight')
      await expect(page.locator('#buy').getByRole('heading', { name: 'To buy · 0', exact: true })).toBeVisible()
      await settled(bar)
    },
  },
]

for (const picker of PICKERS) {
  const searchBox = (page: Page) => picker.scope(page).getByRole('searchbox', { name: picker.label })
  const chipRow = (page: Page) => picker.scope(page).locator('.chip-row')
  const chips = (page: Page) => chipRow(page).locator('.bb-chip')
  const chip = (page: Page, name: string) => chipRow(page).getByRole('button', { name, exact: true })

  /** The page's one error line, in the picker's chip row, with its Retry. */
  async function expectPickerErrorLine(page: Page): Promise<Locator> {
    await expect(page.getByRole('alert')).toHaveCount(1)
    const alert = chipRow(page).getByRole('alert')
    await expect(alert).toContainText(ERROR)
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
    return alert
  }

  /** Meilisearch out of reach, and the REST name filter failing its first try and its retry. */
  function failBoth(bar: FakeBar): void {
    bar.takeSearchDown()
    bar.fail(NAME_READ, { method: 'GET', status: 500, times: 2 })
  }

  /** The ingredient reads sent since `from`, by their filter[name]. */
  function nameReads(bar: FakeBar, from: number): (string | null)[] {
    return bar.requests
      .slice(from)
      .filter((r) => r.service === 'api' && r.method === 'GET' && NAME_READ.test(r.path))
      .map((r) => r.query.get('filter[name]'))
  }

  test.describe(`${picker.screen}’s "${picker.label}" picker, when its search fails`, () => {
    test('says so in the error voice in its chip row, with no chip and no "Nothing by that name."', async ({
      page,
      bar,
    }) => {
      await picker.open(page, bar)
      const asked = bar.requests.length
      failBoth(bar)

      await searchBox(page).fill('tequila')

      await expectPickerErrorLine(page)
      await expect(chips(page)).toHaveCount(0)
      await expect(page.getByText(NOTHING)).toHaveCount(0)
      // Meilisearch was asked, then the REST name filter (ADR-004), twice
      // each: the first try and its retry. Nothing else read the ingredients.
      expect(
        bar.requests.slice(asked).filter((r) => r.service === 'search' && r.path === '/indexes/ingredients/search'),
      ).toHaveLength(2)
      expect(nameReads(bar, asked)).toEqual(['tequila', 'tequila'])
    })

    test('a search that fails after one that answered shows the error line, not the last query’s chips', async ({
      page,
      bar,
    }) => {
      await picker.open(page, bar)
      await searchBox(page).fill('gin')
      await expect(chip(page, 'Gin')).toBeVisible()
      await expect(chip(page, 'London dry gin')).toBeVisible()

      failBoth(bar)
      await searchBox(page).fill('tequila')

      await expectPickerErrorLine(page)
      await expect(chips(page)).toHaveCount(0)
      await expect(page.getByText(NOTHING)).toHaveCount(0)
    })

    test('its Retry asks again, and the chips take the error line’s place', async ({ page, bar }) => {
      await picker.open(page, bar)
      const asked = bar.requests.length
      failBoth(bar)
      await searchBox(page).fill('tequila')
      const alert = await expectPickerErrorLine(page)

      await alert.getByRole('button', { name: 'Retry' }).click()

      // Meilisearch is still down; the REST name filter answers this time.
      await expect(chip(page, 'Tequila')).toBeVisible()
      await expect(chip(page, 'Tequila')).toHaveAttribute('aria-pressed', 'false')
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(nameReads(bar, asked)).toEqual(['tequila', 'tequila', 'tequila'])
    })
  })

  test.describe(`${picker.screen}’s "${picker.label}" picker, with the device offline`, () => {
    test('says so in the error voice in its chip row, not an empty row', async ({ page, bar, context }) => {
      await picker.open(page, bar)
      const network = await deviceNetwork(page, context)
      await network.off()
      const asked = bar.requests.length

      await searchBox(page).fill('tequila')

      await expectPickerErrorLine(page)
      await expect(chips(page)).toHaveCount(0)
      await expect(page.getByText(NOTHING)).toHaveCount(0)
      // Nothing reached the bar while the device was offline. Whatever the
      // network dropped was the picker's search for "tequila" and nothing
      // else: none if the search waits paused, its tries if it fails.
      expect(bar.requests.slice(asked)).toEqual([])
      expect(network.dropped().filter((d) => !isPickerSearch(d, 'tequila'))).toEqual([])
    })

    test('a search after one that answered shows the error line, not the last query’s chips', async ({
      page,
      bar,
      context,
    }) => {
      await picker.open(page, bar)
      const network = await deviceNetwork(page, context)
      await searchBox(page).fill('gin')
      await expect(chip(page, 'Gin')).toBeVisible()

      await network.off()
      await searchBox(page).fill('tequila')

      await expectPickerErrorLine(page)
      await expect(chips(page)).toHaveCount(0)
    })

    test('the search is asked again on reconnect, and the chips take the error line’s place', async ({
      page,
      bar,
      context,
    }) => {
      await picker.open(page, bar)
      const network = await deviceNetwork(page, context)
      await network.off()
      await searchBox(page).fill('tequila')
      await expectPickerErrorLine(page)

      await network.on()

      await expect(chip(page, 'Tequila')).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
    })
  })
}
