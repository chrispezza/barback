import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// The offline list's stamp as it is read back (ADR-007). Decision: "The last
// successful shopping-list response is stamped into localStorage and rendered
// read-only ('Offline — the list as it stood …') when the API is unreachable."
// Drivers: trust in stock data. Tonight states the stored stamp as when the
// list stood, so a stored value the writer did not write is no snapshot: the
// rail shows the error line instead, as it does with nothing stored.
//
// The writer stores toISOString's form (src/api/queries.ts snapshotOf). V8's
// legacy date parser also takes loose strings: "Wednesday 7" reads as 1 July
// 2001 and "1" as 1 January 2001, local midnight, which Tonight would print as
// "Sunday 1 July 2001, 12:00 AM". The unit cases are in
// src/api/snapshot.test.ts; this drives the screen.
//
// Locale, time zone and the page's clock are fixed so the stamp's wording does
// not depend on the machine running the spec.

/** src/api/queries.ts LIST_SNAPSHOT_KEY. The spec cannot import the client
 *  module: it reads import.meta.env when it loads. */
const LIST_SNAPSHOT_KEY = 'barback:list-snapshot'

/** Wednesday 21 October 2026, 7:53 PM in New York: the reader is in the aisle. */
const READ_AT = '2026-10-21T23:53:00Z'

/** Store a snapshot with the stamp given, as if an earlier visit had left it. */
async function storeSnapshot(page: Page, at: string, names: string[]) {
  const value = JSON.stringify({ at, names })
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

const offlineLine = (page: Page) => page.locator('#buy').getByText(/^Offline — the list as it stood .+\.$/)
const snapshotNames = (page: Page) => page.locator('#buy .snapshot-list li')

/** The section's error line (ErrorLine is role="alert") and its retry. */
async function expectErrorLine(page: Page, section: string) {
  const alert = page.locator(section).getByRole('alert')
  await expect(alert).toHaveCount(1)
  await expect(alert).toContainText('The bar didn’t answer — try again.')
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
}

test.describe('a cold start with the API out of reach', () => {
  // What the API would serve, were it reached.
  test.use({ world: listing([I.campari]), locale: 'en-US', timezoneId: 'America/New_York' })

  for (const at of ['Wednesday 7', '1']) {
    test(`a stored stamp of ${JSON.stringify(at)} is no snapshot, and the rail shows the error line`, async ({
      page,
      bar,
    }) => {
      await page.clock.setFixedTime(READ_AT)
      await storeSnapshot(page, at, ['Campari'])
      bar.takeApiDown()
      await page.goto('/tonight')

      // The other sections have answered with their error lines, so the rail
      // has had the same chance to answer with the snapshot.
      await expectErrorLine(page, '#pour')
      await expectErrorLine(page, '#buy')
      await expect(offlineLine(page)).toHaveCount(0)
      await expect(snapshotNames(page)).toHaveCount(0)
      await expect(page.getByText(/2001/)).toHaveCount(0)
    })
  }

  test('the stamp the writer stores is read back and stated', async ({ page, bar }) => {
    // Served Wednesday 7 October 2026, 5:40 PM in New York, in the form
    // toISOString writes. ICU may put U+202F before PM, hence \s.
    await page.clock.setFixedTime(READ_AT)
    await storeSnapshot(page, '2026-10-07T21:40:00.000Z', ['Campari'])
    bar.takeApiDown()
    await page.goto('/tonight')

    await expect(offlineLine(page)).toHaveText(/^Offline — the list as it stood Wednesday 7 October, 5:40\sPM\.$/)
    await expect(snapshotNames(page)).toHaveText(['Campari'])
    await expect(page.locator('#buy').getByRole('alert')).toHaveCount(0)
  })
})
