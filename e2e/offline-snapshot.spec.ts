import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// The store aisle (ADR-007 Decision and Validation; frontend-spec §9
// "Installable PWA + offline posture"): "The last successful shopping-list
// response is stamped into localStorage and rendered read-only ('Offline — the
// list as it stood …') when the API is unreachable", and with the API gone "the
// rail shows the stamped snapshot". This pins the warm path: the list loads
// while the API answers, the API then goes away, and Tonight's next read of
// the list fails. The stamp, and what is kept, are pinned in
// src/api/snapshot.test.ts; the last describe here pins how Tonight words the
// stamp, with the reader's locale and time zone fixed.
//
// Not asserted here, by design: a cold start with the API unreachable (the
// snapshot never shows, chrispezza/barback#63), and what else the rail shows
// beside the snapshot (#62). Those are known defects for later PRs, and
// this spec must not pin the current behaviour as correct.

function listing(ids: number[]): WorldSeed {
  const w = defaultWorld()
  w.list = ids
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
const listReads = (bar: FakeBar) =>
  bar.calls('GET', /^\/users\/\d+\/shopping-list$/).length

test.describe('a list read while the API answered', () => {
  // Listed out of name order: upstream serves the list sorted by name.
  test.use({ world: listing([I.dryVermouth, I.cointreau, I.campari]) })

  test('the snapshot is shown read-only, stamped, once the API is out of reach', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(listItem(page, 'Dry vermouth')).toBeVisible()
    // While the API answers, there is no snapshot on screen.
    await expect(offlineLine(page)).toHaveCount(0)
    await expect(snapshotNames(page)).toHaveCount(0)

    await goTo(page, 'Shelf', 'Shelf')
    bar.takeApiDown()
    const readsBefore = listReads(bar)
    await goTo(page, 'Tonight', 'Tonight')

    await expect(offlineLine(page)).toBeVisible()
    await expect(snapshotNames(page)).toHaveText(['Campari', 'Cointreau', 'Dry vermouth'])
    await expect(page.locator('#buy .snapshot-list').getByRole('button')).toHaveCount(0)
    await expect(page.locator('#buy .snapshot-list').getByRole('checkbox')).toHaveCount(0)
    // Tonight asked for the list again and was not answered.
    expect(listReads(bar)).toBeGreaterThan(readsBefore)
  })
})

test.describe('a list changed before the API went away', () => {
  test.use({ world: listing([I.campari, I.cointreau]) })

  test('is shown as the API last served it, not as it first loaded', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(listItem(page, 'Cointreau')).toBeVisible()

    await page.getByRole('button', { name: 'Remove Cointreau from the list' }).click()
    // The row leaves once the list has been read again, which re-stamps it.
    await expect(listItem(page, 'Cointreau')).toHaveCount(0)
    await expect(listItem(page, 'Campari')).toBeVisible()
    expect([...bar.model.list.keys()]).toEqual([I.campari])

    await goTo(page, 'Shelf', 'Shelf')
    bar.takeApiDown()
    await goTo(page, 'Tonight', 'Tonight')

    await expect(offlineLine(page)).toBeVisible()
    await expect(snapshotNames(page)).toHaveText(['Campari'])
  })
})

test.describe('a list emptied before the API went away', () => {
  test.use({ world: listing([I.campari, I.cointreau]) })

  test('the snapshot is stamped empty, not with the bottles already bought', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(listItem(page, 'Campari')).toBeVisible()

    await page.getByRole('button', { name: 'Remove Campari from the list' }).click()
    await expect(listItem(page, 'Campari')).toHaveCount(0)
    await page.getByRole('button', { name: 'Remove Cointreau from the list' }).click()
    await expect(listItem(page, 'Cointreau')).toHaveCount(0)
    expect(bar.model.list.size).toBe(0)

    await goTo(page, 'Shelf', 'Shelf')
    bar.takeApiDown()
    await goTo(page, 'Tonight', 'Tonight')

    await expect(offlineLine(page)).toBeVisible()
    await expect(snapshotNames(page)).toHaveCount(0)
  })
})

test.describe('the stamp', () => {
  // ADR-007: the snapshot is "clearly stamped", and trust in stock data is the
  // driver. A weekday alone reads as this week, so a list served two weeks ago
  // must name its date (chrispezza/barback#64). The page's clock is fixed when
  // the list is served and again when it is read; locale and time zone are
  // fixed so the wording does not depend on the machine running the spec.
  test.use({ world: listing([I.campari]), locale: 'en-US', timezoneId: 'America/New_York' })

  /** Serve the list at `servedAt`, then read Tonight at `readAt` with the API gone. */
  async function readOffline(page: Page, bar: FakeBar, servedAt: string, readAt: string) {
    await page.clock.setFixedTime(servedAt)
    await page.goto('/tonight')
    await expect(listItem(page, 'Campari')).toBeVisible()

    await goTo(page, 'Shelf', 'Shelf')
    bar.takeApiDown()
    await page.clock.setFixedTime(readAt)
    await goTo(page, 'Tonight', 'Tonight')
    await expect(snapshotNames(page)).toHaveText(['Campari'])
  }

  test('a list served two weeks ago names its date', async ({ page, bar }) => {
    // Served Wednesday 7 October 2026, 5:40 PM in New York; read Wednesday
    // 21 October, 7:53 PM. ICU may put U+202F before PM, hence \s.
    await readOffline(page, bar, '2026-10-07T21:40:00Z', '2026-10-21T23:53:00Z')
    await expect(offlineLine(page)).toHaveText(/^Offline — the list as it stood Wednesday 7 October, 5:40\sPM\.$/)
  })

  test('a list served this week names the weekday and time', async ({ page, bar }) => {
    // Served Monday 19 October 2026, 9:05 AM in New York; read Wednesday
    // 21 October, 7:53 PM.
    await readOffline(page, bar, '2026-10-19T13:05:00Z', '2026-10-21T23:53:00Z')
    await expect(offlineLine(page)).toHaveText(/^Offline — the list as it stood Monday 9:05\sAM\.$/)
  })
})
