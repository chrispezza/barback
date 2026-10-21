import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// Standing orders on Tonight (ADR-008 Decision and Validation; frontend-spec
// §9 "Purchasing intelligence"). An out-of-stock staple from src/data/staples.ts
// is queued without a tap, with a toast naming it and a Staple note on its
// list row; a staple already on the list is left alone. Pins the effect that
// writes the list, which calls staplesToQueue (src/data/buy-next.ts). ADR-008
// Validation: it "queues itself once per session", so leaving Tonight and
// coming back is the same session and does not queue it again.

function tonicOut(listed: number[] = []): WorldSeed {
  const w = defaultWorld()
  w.shelf = w.shelf.filter((id) => id !== I.tonic)
  w.list = listed
  return w
}

/** A shopping-list row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  page.locator('#buy .shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })

/** Client-side navigation through the visible main nav (rail or tab bar). */
async function goTo(page: Page, label: string, heading: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

/**
 * Resolve once the fake has recorded no new request for `quietMs`. A
 * client-side navigation has no load state to wait on, and the assertion that
 * follows is that a write did not happen, so the screen must go quiet first.
 */
async function settled(bar: FakeBar, quietMs = 500) {
  let seen = -1
  let since = Date.now()
  await expect
    .poll(
      () => {
        if (bar.requests.length !== seen) {
          seen = bar.requests.length
          since = Date.now()
        }
        return Date.now() - since >= quietMs
      },
      { intervals: [50], timeout: 10_000 },
    )
    .toBe(true)
}

const listStores = (bar: FakeBar) =>
  bar.calls('POST', /\/shopping-list\/batch-store$/).map((c) => c.body)

test.describe('a staple off the shelf', () => {
  test.use({ world: tonicOut() })

  test('queues itself once, with a toast and a Staple note on its row', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(page.getByText('Staples out — queued: Tonic.')).toBeVisible()
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await page.waitForLoadState('networkidle')
    expect(bar.calls('POST').map((c) => [c.path, c.body])).toEqual([
      ['/users/1/shopping-list/batch-store', { ingredients: [{ id: I.tonic }] }],
    ])
    expect([...bar.model.list.keys()]).toEqual([I.tonic])
  })
})

test.describe('a staple off the shelf and already listed', () => {
  test.use({ world: tonicOut([I.tonic]) })

  test('is not queued again', async ({ page, bar }) => {
    await page.goto('/tonight')
    // The Staple note shows once the staples have resolved, so the effect has run.
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await page.waitForLoadState('networkidle')
    expect(bar.calls('POST')).toEqual([])
    await expect(page.getByText(/Staples out/)).toHaveCount(0)
  })
})

test.describe('a staple queued and then dropped from the list', () => {
  test.use({ world: tonicOut() })

  test('stays dropped when Tonight is left and opened again', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])

    await page.getByRole('button', { name: 'Remove Tonic from the list' }).click()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    expect([...bar.model.list.keys()]).toEqual([])

    await goTo(page, 'Shelf', 'Shelf')
    await goTo(page, 'Tonight', 'Tonight')
    await settled(bar)

    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    expect([...bar.model.list.keys()]).toEqual([])
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
  })

  test('is queued again after a reload, which starts a new session', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await page.getByRole('button', { name: 'Remove Tonic from the list' }).click()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)

    await page.reload()
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    expect(listStores(bar)).toEqual([
      { ingredients: [{ id: I.tonic }] },
      { ingredients: [{ id: I.tonic }] },
    ])
  })
})
