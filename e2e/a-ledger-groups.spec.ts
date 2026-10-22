import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// The Shelf ledger keeps its groups through a shelf change (frontend-spec §9,
// "Shelf ledger: rows grouped by root ancestor via materialized_path"; Visual
// foundations in The Back Bar Design System/readme.md: no layout motion). The
// group headers are named by one GET /ingredients?filter[id]=… lookup over the
// distinct roots; a write that opens a group (the first Liqueurs bottle) or
// closes one changes that set, and with it the lookup. The groups the ledger
// already had are still the same groups under the same names while the new
// set is read: none of them may drop out, and the ledger never reads flat, for
// that round trip. A bottle whose own group is still being named waits outside
// the ledger, as a bottle just tapped on waits for the shelf read-back; the
// chip and the count carry it until its group opens. The cold read, with no
// name known yet, reads flat (e2e/shelf-hierarchy.spec.ts).

/** The six groups of the default shelf, as their headers read. */
const SIX = [
  'Spirits · 4',
  'Beverages · 2',
  'Bitters · 1',
  'Fortified wine · 1',
  'Juices · 2',
  'Sweeteners · 1',
]

/** The ledger's group headers (MatchHeader renders an h2 per group). */
const groupHeaders = (page: Page) => page.getByRole('main').getByRole('heading', { level: 2 })

/** Bottle names inside the group whose header reads `header`. */
const groupRows = (page: Page, header: string) =>
  page
    .getByRole('main')
    .locator('section', { has: page.getByRole('heading', { level: 2, name: header, exact: true }) })
    .locator('.bb-row__name')

const search = (page: Page) => page.getByRole('searchbox', { name: 'Add a bottle' })
const chip = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const count = (page: Page) => page.locator('.shelf-count')
const removeButton = (page: Page, name: string) =>
  page.getByRole('button', { name: `Remove ${name} from the shelf`, exact: true })

/** The main navigation the viewport shows: the rail on desktop, the tab bar on the phone. */
const navLink = (page: Page, label: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) })

/** Tonight's list column and a row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  page.locator('#buy').locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })

/** Whether a response URL is the shelf read, GET /ingredients?filter[on_shelf]=true. */
const shelfRead = (href: string): boolean => {
  const url = new URL(href)
  return url.pathname === '/bar/api/ingredients' && url.searchParams.get('filter[on_shelf]') === 'true'
}

/** The root-name lookups asked for so far, as the comma-joined ids each asked for. */
const nameLookups = (bar: FakeBar): string[] =>
  bar
    .calls('GET', /^\/ingredients$/)
    .map((c) => c.query.get('filter[id]'))
    .filter((ids): ids is string => ids !== null)

/** What the Shelf showed at one moment: its group headers, and bottles outside any group. */
interface LedgerMoment {
  headers: string[]
  ungrouped: string[]
}

/**
 * Watch the whole window, not one instant: from now on, record every state
 * of the Shelf's ledger, on every DOM change, whenever the Shelf is the
 * screen shown. It survives navigating away and back (an SPA route).
 */
async function recordLedger(page: Page): Promise<() => Promise<LedgerMoment[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __ledger: LedgerMoment[] }
    w.__ledger = []
    const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    let last = ''
    new MutationObserver(() => {
      const main = document.querySelector('main')
      if (!main || main.querySelector('h1')?.textContent !== 'Shelf') return
      const moment = {
        headers: [...main.querySelectorAll('h2')].map(text),
        ungrouped: [...main.querySelectorAll('.bb-row__name')].filter((n) => !n.closest('section')).map(text),
      }
      const key = JSON.stringify(moment)
      if (key !== last) w.__ledger.push(moment)
      last = key
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  return () => page.evaluate(() => (window as unknown as { __ledger: LedgerMoment[] }).__ledger)
}

/** The moments that dropped a header from `kept`, or showed a bottle outside the groups. */
const collapsed = (moments: LedgerMoment[], kept: string[]) =>
  moments.filter((m) => m.ungrouped.length > 0 || !kept.every((h) => m.headers.includes(h)))

async function openShelf(page: Page): Promise<void> {
  await page.goto('/shelf')
  await expect(count(page)).toHaveText('11 bottles on the shelf.')
  await expect(groupHeaders(page)).toHaveText(SIX)
}

test.describe('the shelf ledger while a write changes its groups', () => {
  test('keeps every group in place while the group a new bottle opens is named', async ({ page, bar }) => {
    await openShelf(page)
    const seen = await recordLedger(page)
    bar.slowDown(1500)

    await search(page).fill('Cointreau')
    await chip(page, 'Cointreau').click()
    await expect(count(page)).toHaveText('12 bottles on the shelf.', { timeout: 300 })

    // Read back, then named: the lookup for the new set of roots was out.
    await expect(groupRows(page, 'Liqueurs · 1')).toHaveText(['Cointreau'], { timeout: 15_000 })
    expect(nameLookups(bar).filter((ids) => ids.split(',').includes(String(I.liqueurs)))).toHaveLength(1)
    await expect(groupHeaders(page)).toHaveText([
      'Spirits · 4',
      'Beverages · 2',
      'Bitters · 1',
      'Fortified wine · 1',
      'Juices · 2',
      'Liqueurs · 1',
      'Sweeteners · 1',
    ])

    const moments = await seen()
    expect(moments.length).toBeGreaterThan(0)
    expect(collapsed(moments, SIX)).toEqual([])
  })

  test('keeps the other groups in place while a group it empties closes', async ({ page, bar }) => {
    await openShelf(page)
    const seen = await recordLedger(page)
    bar.slowDown(1500)
    const fiveRoots = [I.spirits, I.wines, I.juices, I.syrups, I.beverages].sort((a, b) => a - b).join(',')
    const fiveNamed = page.waitForResponse((res) => new URL(res.url()).searchParams.get('filter[id]') === fiveRoots)
    const shelfReadBack = page.waitForResponse(
      async (res) => shelfRead(res.url()) && !(await res.text()).includes('Angostura aromatic bitters'),
    )

    await removeButton(page, 'Angostura aromatic bitters').click()
    await expect(count(page)).toHaveText('10 bottles on the shelf.', { timeout: 300 })
    const five = SIX.filter((h) => h !== 'Bitters · 1')
    await expect(groupHeaders(page)).toHaveText(five, { timeout: 300 })

    // The lookup for the five roots left has answered, and the shelf has been read back.
    await fiveNamed
    await shelfReadBack
    expect(bar.model.shelf.has(I.angostura)).toBe(false)
    await expect(groupHeaders(page)).toHaveText(five)

    expect(collapsed(await seen(), five)).toEqual([])
  })
})

/** The default bar with the egg white shelved, as e2e/tonight.spec.ts builds it, and Campari listed. */
function campariListed(): WorldSeed {
  const w = defaultWorld()
  w.shelf.push(I.eggWhite)
  w.list = [I.campari]
  return w
}

test.describe('the shelf ledger after a check-off on Tonight', () => {
  test.use({ world: campariListed() })

  test('opens on the groups it already had while the group the bottle opened is named', async ({ page, bar }) => {
    // The egg white opens Other alongside the default six.
    const seven = [...SIX.slice(0, 4), 'Juices · 2', 'Other · 1', 'Sweeteners · 1']
    await page.goto('/shelf')
    await expect(count(page)).toHaveText('12 bottles on the shelf.')
    await expect(groupHeaders(page)).toHaveText(seven)

    await navLink(page, 'Tonight').click()
    // Tonight reads the shelf back after the check-off; the Shelf is not mounted.
    const shelfReadBack = page.waitForResponse(
      async (res) => shelfRead(res.url()) && (await res.text()).includes('"Campari"'),
    )
    await listItem(page, 'Campari').click()
    await shelfReadBack
    expect(bar.model.shelf.has(I.campari)).toBe(true)

    const seen = await recordLedger(page)
    bar.slowDown(1500)
    await navLink(page, 'Shelf').click()
    await expect(groupRows(page, 'Liqueurs · 1')).toHaveText(['Campari'], { timeout: 15_000 })
    expect(nameLookups(bar).filter((ids) => ids.split(',').includes(String(I.liqueurs)))).toHaveLength(1)
    await expect(count(page)).toHaveText('13 bottles on the shelf.')

    const moments = await seen()
    expect(moments.length).toBeGreaterThan(0)
    expect(collapsed(moments, seven)).toEqual([])
  })
})
