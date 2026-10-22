import type { Page } from '@playwright/test'
import { C, I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Tonight with the API out of reach (ADR-007). Validation: "Kill the API
// containers: the installed app still opens; the rail shows the stamped
// snapshot; every other section shows the error line." Decision: the snapshot
// is "rendered read-only … when the API is unreachable". Consequences:
// "Offline check-off is not supported; mutations require connectivity."
//
// The store aisle is usually a cold start: nothing in memory, a snapshot in
// localStorage, and /bars and /profile fail before anything else is asked
// (chrispezza/barback#63). After a warm start the cached list must not render
// its live rows beside the snapshot either (chrispezza/barback#62). Whatever
// the cause, a list Tonight cannot read is shown as the snapshot alone, and
// nothing in the rail writes.
//
// How the stamp is worded is pinned in e2e/offline-snapshot.spec.ts and
// src/api/snapshot.test.ts; here it is only required to be there.

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

function listing(ids: number[], favorites: number[] = []): WorldSeed {
  const w = defaultWorld()
  w.list = ids
  w.favorites = favorites
  return w
}

/** Client-side navigation through the visible main nav (rail or tab bar). */
async function goTo(page: Page, label: string, heading: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

/** A live shopping-list row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  page.locator('#buy .shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })

const offlineLine = (page: Page) => page.locator('#buy').getByText(/^Offline — the list as it stood .+\.$/)
const snapshotNames = (page: Page) => page.locator('#buy .snapshot-list li')

/** The section's error line (ErrorLine is role="alert") and its retry. */
async function expectErrorLine(page: Page, section: string) {
  const alert = page.locator(section).getByRole('alert')
  await expect(alert).toHaveCount(1)
  await expect(alert).toContainText('The bar didn’t answer — try again.')
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
}

/**
 * Nothing in the rail can write: no check-off, no drop, no "List it", no add
 * field. Check-off rows and add-field chips are toggles (aria-pressed); the
 * error line's Retry is not, and only reads.
 */
async function expectNothingWrites(page: Page) {
  const rail = page.locator('#buy')
  await expect(rail.locator('.shopping-row-line')).toHaveCount(0)
  await expect(rail.locator('button[aria-pressed]')).toHaveCount(0)
  await expect(rail.getByRole('button', { name: /from the list$/ })).toHaveCount(0)
  await expect(rail.getByRole('button', { name: 'List it' })).toHaveCount(0)
  await expect(rail.getByRole('searchbox', { name: 'Add to the list' })).toHaveCount(0)
}

test.describe('a cold start with the API out of reach', () => {
  // What the API would serve, were it reached.
  test.use({ world: listing([I.campari, I.cointreau]) })

  test('the rail shows the stamped snapshot read-only, and the pour and near sections the error line', async ({
    page,
    bar,
  }) => {
    await seedSnapshot(page, ['Campari', 'Cointreau'])
    bar.takeApiDown()
    await page.goto('/tonight')

    await expect(offlineLine(page)).toBeVisible()
    await expect(snapshotNames(page)).toHaveText(['Campari', 'Cointreau'])
    await expectErrorLine(page, '#pour')
    await expectErrorLine(page, '#near')
    // The rail's answer is the snapshot, not the error line.
    await expect(page.locator('#buy').getByRole('alert')).toHaveCount(0)
    await expectNothingWrites(page)
    // Nothing the bar did not say: no count on To buy, no empty list, and no
    // count of the bar still under way.
    await expect(page.locator('#buy').getByRole('heading', { name: 'To buy', exact: true })).toBeVisible()
    await expect(page.getByText('Nothing to buy yet')).toHaveCount(0)
    await expect(page.getByText('Counting the bar…')).toHaveCount(0)
    expect(bar.calls('POST')).toEqual([])
  })

  test('with no snapshot stored, the rail shows the error line too', async ({ page, bar }) => {
    bar.takeApiDown()
    await page.goto('/tonight')

    await expectErrorLine(page, '#pour')
    await expectErrorLine(page, '#near')
    await expectErrorLine(page, '#buy')
    await expect(offlineLine(page)).toHaveCount(0)
    await expect(snapshotNames(page)).toHaveCount(0)
    await expectNothingWrites(page)
    await expect(page.getByText('Nothing to buy yet')).toHaveCount(0)
    await expect(page.getByText('Counting the bar…')).toHaveCount(0)
  })

  test('Retry asks the bar again, and the live list takes the snapshot’s place', async ({ page, bar }) => {
    await seedSnapshot(page, ['Campari'])
    // Each bootstrap read fails twice: the first try and its one retry
    // (src/app.tsx, retry: 1). The bar answers from the third.
    bar.fail(/^\/bars$/, { abort: true, times: 2 })
    bar.fail(/^\/profile$/, { abort: true, times: 2 })
    await page.goto('/tonight')
    await expect(offlineLine(page)).toBeVisible()
    await expectErrorLine(page, '#pour')

    await page.locator('#pour').getByRole('button', { name: 'Retry' }).click()

    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(listItem(page, 'Cointreau')).toBeVisible()
    await expect(offlineLine(page)).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.locator('#pour .card-list > li').first()).toBeVisible()
  })
})

test.describe('the profile cannot be read, the bar can', () => {
  // A favourited Manhattan wants only Rye whiskey, so Buy next has a pick to
  // offer from reads that need no profile.
  test.use({ world: listing([I.campari], [C.manhattan]) })

  test('the drinks still pour, and the rail shows only the snapshot', async ({ page, bar }) => {
    await seedSnapshot(page, ['Campari'])
    bar.fail(/^\/profile$/, { status: 500, times: 2 })
    await page.goto('/tonight')

    await expect(offlineLine(page)).toBeVisible()
    await expect(snapshotNames(page)).toHaveText(['Campari'])
    // Can pour and one bottle away need only the bar id: they answer.
    await expect(page.locator('#pour .card-list > li').first()).toBeVisible()
    await expect(page.locator('#pour').getByRole('alert')).toHaveCount(0)
    await expect(page.locator('#near').getByRole('alert')).toHaveCount(0)
    await expectNothingWrites(page)
  })
})

test.describe('a warm start: the list was read, then the API went away', () => {
  test.use({ world: listing([I.campari, I.cointreau]) })

  test('the snapshot takes the live rows’ place, and nothing in the rail writes', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(listItem(page, 'Campari')).toBeVisible()
    // While the API answers, the rail offers bottles to list.
    await expect(page.locator('#buy').getByRole('button', { name: 'List it' }).first()).toBeVisible()

    await goTo(page, 'Shelf', 'Shelf')
    bar.takeApiDown()
    await goTo(page, 'Tonight', 'Tonight')

    await expect(offlineLine(page)).toBeVisible()
    await expect(snapshotNames(page)).toHaveText(['Campari', 'Cointreau'])
    await expectNothingWrites(page)
  })
})
