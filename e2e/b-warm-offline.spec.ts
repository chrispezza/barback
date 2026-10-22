import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Tonight on the warm path (chrispezza/barback#61): it has read the bar once,
// then the API goes away and the reads it asks again on its next opening fail.
// TanStack Query keeps a query's last answer beside its error, so the pour and
// near-miss reads still hold the cards and counts of the last good read.
//
// ADR-007 Consequences: "No stock answer is ever served stale: screens that
// need the API say so in the error voice rather than showing cached matches."
// Validation: "the rail shows the stamped snapshot; every other section shows
// the error line." A section whose read is in error shows that line and
// nothing drawn from the failed read: no card, no count in its header, no
// empty state decided from its count. The status line states no count it
// could not read. Each section keeps one alert (chrispezza/barback#67).
//
// The cold start, and the rail on the warm path, are pinned in
// e2e/offline-tonight.spec.ts.

/** The default bar with Campari listed, so the first read stamps a snapshot. */
function listingCampari(change?: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  w.list = [I.campari]
  change?.(w)
  return w
}

const status = (page: Page) => page.locator('.bar-status')
const pour = (page: Page) => page.locator('#pour')
const near = (page: Page) => page.locator('#near')
const rail = (page: Page) => page.locator('#buy')
const cards = (section: ReturnType<typeof pour>) => section.locator('.card-list > li')
const sectionHeading = (section: ReturnType<typeof pour>) => section.getByRole('heading', { level: 2 })
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
const offlineLine = (page: Page) => rail(page).getByText(/^Offline — the list as it stood .+\.$/)

/** Client-side navigation through the visible main nav (rail or tab bar). */
async function goTo(page: Page, label: string, heading: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

/** The section's one error line (ErrorLine is role="alert") and its retry. */
async function expectErrorLineAlone(section: ReturnType<typeof pour>) {
  const alert = section.getByRole('alert')
  await expect(alert).toHaveCount(1)
  await expect(alert).toContainText('The bar didn’t answer — try again.')
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
  // Nothing from the read that failed: no cards, no match marks, no empty state.
  await expect(cards(section)).toHaveCount(0)
  await expect(section.getByText('Can pour', { exact: true })).toHaveCount(0)
  await expect(section.getByText(/^One bottle away: /)).toHaveCount(0)
  await expect(section.locator('.bb-empty')).toHaveCount(0)
  await expect(section.getByRole('button', { name: /^Show all/ })).toHaveCount(0)
}

/** Tonight as the bar first served it: both sections, the counts and the list. */
async function loadWarm(page: Page, path = '/tonight') {
  await page.goto(path)
  await expect(status(page)).toHaveText(/^You can pour \d+ · \d+ one bottle away · \d+ to buy$/)
  await expect(listItem(page, 'Campari')).toBeVisible()
}

/**
 * Drop every API request whose URL `matches`, until the returned function
 * lifts it. FakeBar.takeApiDown cannot be undone, so a spec that needs the bar
 * back routes the outage itself. Playwright asks the route registered last
 * first, so this one is asked before the fake, and passes every other request
 * on to it.
 */
async function outage(page: Page, matches: (url: URL) => boolean): Promise<() => void> {
  let down = true
  await page.route(
    (url) => url.pathname.startsWith('/bar/api/'),
    (route) => (down && matches(new URL(route.request().url())) ? route.abort('connectionrefused') : route.fallback()),
  )
  return () => {
    down = false
  }
}

test.describe('Tonight read the bar, then the API went away', () => {
  test.use({ world: listingCampari() })

  test('the pour and near sections show only the error line, and the status line no count', async ({
    page,
    bar,
  }) => {
    await loadWarm(page)
    await expect(cards(pour(page)).first()).toContainText('Can pour')
    await expect(cards(near(page)).first()).toContainText('One bottle away: ')

    await goTo(page, 'Shelf', 'Shelf')
    bar.takeApiDown()
    await goTo(page, 'Tonight', 'Tonight')

    await expectErrorLineAlone(pour(page))
    await expectErrorLineAlone(near(page))
    // The headers carry no count the failed reads last gave.
    await expect(sectionHeading(pour(page))).toHaveText('You can pour')
    await expect(sectionHeading(near(page))).toHaveText('One bottle away')
    // The status line says nothing rather than the counts of the last good
    // read, and is not counting either: its reads have failed.
    await expect(status(page)).toHaveCount(0)
    await expect(page.getByText('Counting the bar…')).toHaveCount(0)
    // The rail's answer is the snapshot (chrispezza/barback#62), with no alert.
    await expect(offlineLine(page)).toBeVisible()
    await expect(rail(page).getByRole('alert')).toHaveCount(0)
    await expect(page.locator('main').getByRole('alert')).toHaveCount(2)
  })

  test('under a family, the pour section says nothing pours from counts it could not read', async ({
    page,
    bar,
  }) => {
    // No tiki drink pours or is one bottle away: on the first read the pour
    // section rightly points at the family.
    await loadWarm(page, '/tonight?family=tiki')
    await expect(sectionHeading(pour(page))).toHaveText('tiki drinks you can pour · 0')
    await expect(sectionHeading(near(page))).toHaveText('tiki drinks one bottle away · 0')
    await expect(pour(page).getByRole('heading', { name: 'No tiki drinks pour yet' })).toBeVisible()

    // The family rides the nav between Tonight and the Index (frontend-spec
    // §6), so the way out and back is through the Index.
    await goTo(page, 'Drinks', 'Drinks')
    await expect(page).toHaveURL(/\/drinks\?family=tiki$/)
    bar.takeApiDown()
    await goTo(page, 'Tonight', 'Tonight')
    await expect(page).toHaveURL(/\/tonight\?family=tiki$/)

    await expectErrorLineAlone(pour(page))
    await expectErrorLineAlone(near(page))
    await expect(sectionHeading(pour(page))).toHaveText('tiki drinks you can pour')
    await expect(sectionHeading(near(page))).toHaveText('tiki drinks one bottle away')
    await expect(page.getByText('No tiki drinks pour yet')).toHaveCount(0)
    await expect(page.getByText('None is one bottle away either')).toHaveCount(0)
    await expect(status(page)).toHaveCount(0)
  })
})

test.describe('Tonight read the bar, then only the near-miss reads fail', () => {
  // Gin alone: nothing pours, and the Gin Tonic and the Martini are each one
  // bottle away, so the pour section points at the near misses below.
  test.use({ world: listingCampari((w) => (w.shelf = [I.gin])) })

  test('the near section shows only the error line, and the pour section points at nothing below', async ({
    page,
  }) => {
    await loadWarm(page)
    await expect(sectionHeading(near(page))).toHaveText('One bottle away · 2')
    await expect(pour(page).locator('.bb-empty__body')).toHaveText(
      'Nothing pours yet — the bottles below are one purchase away.',
    )

    await goTo(page, 'Shelf', 'Shelf')
    await outage(page, (url) => url.pathname === '/bar/api/cocktails' && url.searchParams.has('filter[missing_ingredients]'))
    await goTo(page, 'Tonight', 'Tonight')

    await expectErrorLineAlone(near(page))
    await expect(sectionHeading(near(page))).toHaveText('One bottle away')
    // What pours still answered, so its count stands, and nothing in the
    // section is decided from the near-miss count that failed.
    await expect(sectionHeading(pour(page))).toHaveText('You can pour · 0')
    await expect(pour(page).getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('the bottles below are one purchase away')).toHaveCount(0)
    await expect(pour(page).locator('.bb-empty')).toHaveCount(0)
    // The whole-bar near count failed too: the status line states none.
    await expect(status(page)).toHaveCount(0)
  })
})

test.describe('Tonight read the bar, the API went away, and came back', () => {
  test.use({ world: listingCampari() })

  test('each section’s Retry brings back its live cards and count', async ({ page }) => {
    await loadWarm(page)
    // As the DOM holds it: innerText would carry the header's CSS capitals.
    const pourHeading = (await sectionHeading(pour(page)).textContent()) ?? ''
    const nearHeading = (await sectionHeading(near(page)).textContent()) ?? ''
    expect(pourHeading).toMatch(/^You can pour · [1-9]/)
    expect(nearHeading).toMatch(/^One bottle away · [1-9]/)
    const pourCount = await cards(pour(page)).count()
    const nearCount = await cards(near(page)).count()

    await goTo(page, 'Shelf', 'Shelf')
    const lift = await outage(page, () => true)
    await goTo(page, 'Tonight', 'Tonight')
    await expectErrorLineAlone(pour(page))
    await expectErrorLineAlone(near(page))

    lift()
    await pour(page).getByRole('button', { name: 'Retry' }).click()
    await expect(pour(page).getByRole('alert')).toHaveCount(0)
    await expect(sectionHeading(pour(page))).toHaveText(pourHeading)
    await expect(cards(pour(page))).toHaveCount(pourCount)
    await expect(cards(pour(page)).first()).toContainText('Can pour')
    // The near section asked nothing again: it still says only that it failed.
    await expectErrorLineAlone(near(page))

    await near(page).getByRole('button', { name: 'Retry' }).click()
    await expect(near(page).getByRole('alert')).toHaveCount(0)
    await expect(sectionHeading(near(page))).toHaveText(nearHeading)
    await expect(cards(near(page))).toHaveCount(nearCount)
    await expect(cards(near(page)).first()).toContainText('One bottle away: ')
  })
})
