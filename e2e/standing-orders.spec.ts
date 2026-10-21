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
// coming back is the same session and does not queue it again. Once per
// emptying, not once ever: a staple Tonight has seen back on the shelf is
// queued again when it next runs out, and a write that failed is sent again
// the next time Tonight opens (chrispezza/barback#54 review).

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

const listStores = (bar: FakeBar) =>
  bar.calls('POST', /\/shopping-list\/batch-store$/).map((c) => c.body)

/**
 * Run the toast queue down on the page's fake clock. Toasts show one at a time
 * (src/components/toasts.tsx) and an Undo toast holds for 8 seconds, so a
 * journey that checks off and removes would otherwise wait 16 seconds for the
 * receipt it is about. A pointer resting on a toast pauses it, so the pointer
 * moves off first. Needs page.clock.install() before page.goto.
 */
async function clearToasts(page: Page) {
  await page.mouse.move(0, 0)
  const host = page.locator('.toast-host')
  await expect(async () => {
    if ((await host.count()) > 0) await page.clock.fastForward(8_000)
    await expect(host).toHaveCount(0, { timeout: 100 })
  }).toPass({ timeout: 10_000 })
}

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

test.describe('a staple queued, checked off on Tonight and then used up', () => {
  test.use({ world: tonicOut() })

  test('is queued again, with its toast, the next time Tonight opens', async ({ page, bar }) => {
    await page.clock.install()
    const queued = page.getByText('Staples out — queued: Tonic.')
    await page.goto('/tonight')
    await expect(queued).toBeVisible()
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await clearToasts(page)

    // Bought and checked off here, so Tonight reads Tonic back on the shelf.
    await listItem(page, 'Tonic').click()
    await expect(page.getByText('Moved to the shelf.')).toBeVisible()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    expect(bar.model.shelf.has(I.tonic)).toBe(true)
    await settled(bar)
    await clearToasts(page)

    // Used up: removed on the Shelf.
    await goTo(page, 'Shelf', 'Shelf')
    await page.getByRole('button', { name: 'Remove Tonic from the shelf' }).click()
    await expect(page.getByText('Bottle removed from the shelf.')).toBeVisible()
    await expect.poll(() => bar.model.shelf.has(I.tonic)).toBe(false)
    await clearToasts(page)

    await goTo(page, 'Tonight', 'Tonight')
    await expect(queued).toBeVisible()
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await settled(bar)
    expect(listStores(bar)).toEqual([
      { ingredients: [{ id: I.tonic }] },
      { ingredients: [{ id: I.tonic }] },
    ])
    expect([...bar.model.list.keys()]).toEqual([I.tonic])
  })
})

test.describe('a staple whose queue write fails', () => {
  test.use({ world: tonicOut() })

  test('is sent again the next time Tonight opens, and not again on this one', async ({ page, bar }) => {
    bar.fail(/\/shopping-list\/batch-store$/, { method: 'POST', status: 500, times: 1 })
    await page.goto('/tonight')
    await expect(page.getByText('The list didn’t take that change.')).toBeVisible()
    await settled(bar)
    // One attempt on this mount: no retry loop against a failing list.
    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    expect([...bar.model.list.keys()]).toEqual([])

    await goTo(page, 'Shelf', 'Shelf')
    await goTo(page, 'Tonight', 'Tonight')
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await settled(bar)
    expect(listStores(bar)).toEqual([
      { ingredients: [{ id: I.tonic }] },
      { ingredients: [{ id: I.tonic }] },
    ])
    expect([...bar.model.list.keys()]).toEqual([I.tonic])
  })
})
