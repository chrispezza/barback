import type { Page } from '@playwright/test'
import { I } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// The Index's search section (/drinks) when the search itself fails, and when
// it matches more drinks than it lists.
//
// ADR-007 Consequences: "screens that need the API say so in the error voice
// rather than showing cached matches." Search answers from Meilisearch or,
// failing that, the REST name filter (ADR-004; frontend-spec §5 "Search
// degrades", §9 "Cocktail search"); when both fail, the section says so in the
// error line and lists nothing — not a bare "Matches" header, and not the
// previous query's cards. A cold start with the API out of reach is pinned in
// e2e/d-cold-start.spec.ts; these start warm, with the index already read.
//
// Content fundamentals ("Numbers are stated flatly"): the header states how
// many drinks match, not how many came back. Meilisearch is asked for 12
// (src/api/search.ts) and reports the whole count as estimatedTotalHits; the
// REST fallback asks for per_page=12 and reports meta.total. When only the
// first 12 are listed, one line says so and names the next action. What the
// type-ahead does while Meilisearch is down is chrispezza/barback#76, not this
// spec's.
//
// Every failed read below fails its first try and its one retry
// (src/api/client.ts queryDefaults, retry: 1).
//
// The store aisle (ADR-007) is the device offline, not only the bar out of
// reach: the browser reports navigator.onLine false. A search asked for then
// is tried and fails, as it does with the bar out of reach, and says so the
// same way: never held until the device reconnects (src/api/client.ts
// queryDefaults; chrispezza/barback#107). It is asked again by itself when the
// device reconnects.

const ERROR = 'The bar didn’t answer — try again.'

const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Find a drink' })
const sectionHeading = (page: Page, name: string) =>
  page.getByRole('main').getByRole('heading', { level: 2, name, exact: true })
/** The Index's search section, headed "Matches" with or without a count. */
const matchesSection = (page: Page) =>
  page.getByRole('main').locator('section', { has: page.getByRole('heading', { level: 2, name: /^Matches/ }) })
const cards = (page: Page) => page.locator('main .card-list > li')
const cardNames = (page: Page) => cards(page).getByRole('heading', { level: 3 })
const firstOf = (shown: number, total: number) =>
  `The first ${shown} of ${total} — type more of the name to narrow them.`

/** The index has been read: fifteen drinks listed under "The index · 15". */
async function openIndex(page: Page): Promise<void> {
  await page.goto('/drinks')
  await expect(sectionHeading(page, 'The index · 15')).toBeVisible()
  await expect(cards(page)).toHaveCount(15)
}

/** The page's one error line, inside the search section, with its Retry. */
async function expectSearchErrorLine(page: Page) {
  await expect(page.getByRole('alert')).toHaveCount(1)
  const alert = matchesSection(page).getByRole('alert')
  await expect(alert).toContainText(ERROR)
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
  return alert
}

/** Fifty drinks named "House sour 01" … "House sour 50", all of which pour. */
function addHouseSours(bar: FakeBar, count = 50): void {
  for (let n = 1; n <= count; n += 1) {
    bar.model.world.cocktails.push({
      id: 2000 + n,
      name: `House sour ${String(n).padStart(2, '0')}`,
      lines: [
        { ingredientId: I.whiteRum, amount: 60, units: 'ml' },
        { ingredientId: I.limeJuice, amount: 22.5, units: 'ml' },
        { ingredientId: I.simpleSyrup, amount: 22.5, units: 'ml' },
      ],
      instructions: 'Shake with ice and strain.',
    })
  }
}

test.describe('the search itself fails', () => {
  test('with Meilisearch and the API both out of reach, a search says so in the error voice and lists nothing', async ({
    page,
    bar,
  }) => {
    await openIndex(page)
    bar.takeSearchDown()
    bar.takeApiDown()

    await searchBox(page).fill('daiq')

    await expect(sectionHeading(page, 'Matches')).toBeVisible()
    await expectSearchErrorLine(page)
    await expect(page.getByText('Nothing by that name.')).toHaveCount(0)
    await expect(cards(page)).toHaveCount(0)
    // Meilisearch was asked, then the REST name filter (ADR-004), and both dropped.
    expect(bar.requests.some((r) => r.service === 'search' && r.path === '/indexes/cocktails/search')).toBe(true)
    expect(bar.calls('GET', /^\/cocktails$/).some((r) => r.query.get('filter[name]') === 'daiq')).toBe(true)
  })

  test('a search that fails after one that answered shows the error line, not the last query’s cards', async ({
    page,
    bar,
  }) => {
    await openIndex(page)
    await searchBox(page).fill('daiq')
    await expect(sectionHeading(page, 'Matches · 1')).toBeVisible()
    await expect(cardNames(page)).toHaveText(['Daiquiri'])

    bar.takeSearchDown()
    bar.takeApiDown()
    await searchBox(page).fill('gim')

    await expectSearchErrorLine(page)
    await expect(sectionHeading(page, 'Matches')).toBeVisible()
    // ADR-007: no stock answer served stale — Daiquiri's "Can pour" is not
    // left standing under a query it does not match.
    await expect(cards(page)).toHaveCount(0)
  })

  test('the search’s Retry asks again, and the matches take the error line’s place', async ({ page, bar }) => {
    bar.takeSearchDown()
    await openIndex(page)
    // The REST name filter drops, its first try and its retry, then answers.
    bar.fail(/^\/cocktails$/, { method: 'GET', abort: true, times: 2 })

    await searchBox(page).fill('daiq')
    const alert = await expectSearchErrorLine(page)
    await expect(cards(page)).toHaveCount(0)

    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect(sectionHeading(page, 'Matches · 1')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(cardNames(page)).toHaveText(['Daiquiri'])
  })
})

test.describe('the device is offline', () => {
  test('a search says so in the error voice, not a bare "Matches" header', async ({ page, bar, context }) => {
    await openIndex(page)
    await context.setOffline(true)
    bar.takeSearchDown()
    bar.takeApiDown()

    await searchBox(page).fill('daiq')

    await expect(sectionHeading(page, 'Matches')).toBeVisible()
    await expectSearchErrorLine(page)
    await expect(page.getByText('Nothing by that name.')).toHaveCount(0)
    await expect(cards(page)).toHaveCount(0)
  })

  test('a search after one that answered shows the error line, not the last query’s count and cards', async ({
    page,
    bar,
    context,
  }) => {
    await openIndex(page)
    await searchBox(page).fill('daiq')
    await expect(sectionHeading(page, 'Matches · 1')).toBeVisible()
    await expect(cardNames(page)).toHaveText(['Daiquiri'])

    await context.setOffline(true)
    bar.takeSearchDown()
    bar.takeApiDown()
    await searchBox(page).fill('gim')

    await expectSearchErrorLine(page)
    await expect(sectionHeading(page, 'Matches')).toBeVisible()
    await expect(cards(page)).toHaveCount(0)
  })

  test('a search made offline fails, is asked again on reconnect, and the matches take the error line’s place', async ({
    page,
    bar,
    context,
  }) => {
    await openIndex(page)
    // Route interception still answers while the context is offline, so this
    // handler, asked before the fake, drops what the page asks of the bar and
    // of search while the device is offline, as the network would. It keeps
    // each one as "METHOD /path?query", with the body when there is one: the
    // Index's own list is also GET /bar/api/cocktails, so the path alone cannot
    // tell the search's REST fallback from it. Unlike takeApiDown and
    // takeSearchDown, it can be lifted.
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
    online = false
    await context.setOffline(true)
    const asked = bar.requests.length

    await searchBox(page).fill('daiq')
    await expectSearchErrorLine(page)
    // Failed, not held: the search for "daiq" was asked of Meilisearch and
    // then of the REST name filter (ADR-004; src/api/search.ts), and the
    // network dropped both.
    expect(dropped).toContain('POST /search/indexes/cocktails/search {"q":"daiq","limit":12}')
    expect(dropped).toContain('GET /bar/api/cocktails?filter[name]=daiq&per_page=12')
    // The original journey's line, kept. It now holds by construction while
    // the route above matches every /bar/ and /search/ path: it checks that
    // this journey's dropped network took every request ahead of the fake, not
    // anything the app did.
    expect(bar.requests.slice(asked)).toEqual([])

    online = true
    await context.setOffline(false)

    await expect(sectionHeading(page, 'Matches · 1')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(cardNames(page)).toHaveText(['Daiquiri'])
  })
})

test.describe('more matches than the search lists', () => {
  test('Meilisearch: the header states all fifty, twelve are listed, and one line says so', async ({ page, bar }) => {
    addHouseSours(bar)
    await page.goto('/drinks')
    await expect(sectionHeading(page, 'The index · 65')).toBeVisible()

    const sent = page.waitForRequest((r) => new URL(r.url()).pathname === '/search/indexes/cocktails/search')
    await searchBox(page).fill('house')
    expect((await sent).postDataJSON()).toMatchObject({ q: 'house', limit: 12 })

    await expect(sectionHeading(page, 'Matches · 50')).toBeVisible()
    await expect(sectionHeading(page, 'Matches · 12')).toHaveCount(0)
    await expect(cards(page)).toHaveCount(12)
    await expect(matchesSection(page).getByText(firstOf(12, 50), { exact: true })).toBeVisible()
    // The REST name filter is the fallback only.
    expect(bar.calls('GET', /^\/cocktails$/).filter((r) => r.query.has('filter[name]'))).toEqual([])
  })

  test('the REST fallback: the header states meta.total, and the same line says only the first twelve are listed', async ({
    page,
    bar,
  }) => {
    addHouseSours(bar)
    bar.takeSearchDown()
    await page.goto('/drinks')
    await expect(sectionHeading(page, 'The index · 65')).toBeVisible()

    await searchBox(page).fill('house')

    await expect(sectionHeading(page, 'Matches · 50')).toBeVisible()
    await expect(cards(page)).toHaveCount(12)
    await expect(matchesSection(page).getByText(firstOf(12, 50), { exact: true })).toBeVisible()
    const fallback = bar.calls('GET', /^\/cocktails$/).filter((r) => r.query.get('filter[name]') === 'house')
    expect(fallback.map((r) => r.query.get('per_page'))).toEqual(['12'])
  })

  test('when every match is listed, the header states the count and no line says otherwise', async ({ page, bar }) => {
    addHouseSours(bar, 12)
    await page.goto('/drinks')
    await expect(sectionHeading(page, 'The index · 27')).toBeVisible()

    await searchBox(page).fill('house')

    await expect(sectionHeading(page, 'Matches · 12')).toBeVisible()
    await expect(cards(page)).toHaveCount(12)
    await expect(matchesSection(page).getByText(/^The first \d+ of \d+/)).toHaveCount(0)
  })

  test('narrowing the query restates the count, and the line goes when everything is listed', async ({
    page,
    bar,
  }) => {
    addHouseSours(bar)
    await page.goto('/drinks')
    await expect(sectionHeading(page, 'The index · 65')).toBeVisible()
    await searchBox(page).fill('house')
    await expect(sectionHeading(page, 'Matches · 50')).toBeVisible()

    // Every word must prefix a word of the name: "05" names one house sour.
    await searchBox(page).fill('house sour 05')

    await expect(sectionHeading(page, 'Matches · 1')).toBeVisible()
    await expect(cardNames(page)).toHaveText(['House sour 05'])
    await expect(matchesSection(page).getByText(/^The first \d+ of \d+/)).toHaveCount(0)
  })
})
