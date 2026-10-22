import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// A staple already on the list when the page session starts
// (chrispezza/barback#55). That is the usual state after any earlier session's
// auto-queue: Tonic is off the shelf and on the list. ADR-008 Validation: a
// staple "queues itself once per session", and the only write the user did not
// tap is the standing order itself; frontend-spec §9 promises a per-row drop.
// The standing order for this emptying was met by an earlier session, so a
// staple dropped by hand stays dropped for the rest of this one: not written
// straight back, not written back when Tonight is opened again. The session
// memory still lets go once Tonight reads the staple back on the shelf, so the
// next emptying is queued (chrispezza/barback#54), and a reload is a new
// session.
//
// The same holds for a drop made while the staples are being read again, when
// the staples in hand are stale: Tonic listed while still on the shelf and then
// used up, or put back off the shelf by a check-off's Undo, is off the shelf
// although they say otherwise. Such a drop stays dropped. One made while Tonic
// really is on the shelf still lets its next emptying be queued.
//
// Staples queued during the session are pinned in e2e/standing-orders.spec.ts.

/** Tonic off the shelf and on the list, as an earlier session's auto-queue leaves it. */
function tonicListedAndOut(): WorldSeed {
  const w = defaultWorld()
  w.shelf = w.shelf.filter((id) => id !== I.tonic)
  w.list = [I.tonic]
  return w
}

const rail = (page: Page) => page.locator('#buy')

/** A shopping-list row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })

const queuedToast = (page: Page) => page.getByText(/Staples out — queued/)

/** Client-side navigation through the visible main nav (rail or tab bar). */
async function goTo(page: Page, label: string, heading: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

/**
 * Resolve once the fake has recorded no new request for `quietMs`. The
 * assertion that follows is that a write did not happen, so the screen must go
 * quiet first.
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
const listDeletes = (bar: FakeBar) =>
  bar.calls('POST', /\/shopping-list\/batch-delete$/).map((c) => c.body)

/**
 * Run the toast queue down on the page's fake clock (toasts show one at a time
 * and an Undo toast holds for 8 seconds). A pointer resting on a toast pauses
 * it, so the pointer moves off first. Needs page.clock.install() before
 * page.goto.
 */
async function clearToasts(page: Page) {
  await page.mouse.move(0, 0)
  const host = page.locator('.toast-host')
  await expect(async () => {
    if ((await host.count()) > 0) await page.clock.fastForward(8_000)
    await expect(host).toHaveCount(0, { timeout: 100 })
  }).toPass({ timeout: 10_000 })
}

/**
 * Hold every staple read from now on (GET /ingredients/{slug}-{bar}, the
 * useStaples lookups); the fake answers them once released. The held reads are
 * recorded only then, so `settled` sees the screen quiet meanwhile.
 */
async function holdStapleReads(page: Page): Promise<() => void> {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const stapleRead = /^\/bar\/api\/ingredients\/[a-z]+(?:-[a-z]+)*-\d+$/
  await page.route(
    (url) => stapleRead.test(url.pathname),
    async (route) => {
      await held
      await route.fallback()
    },
  )
  return release
}

/**
 * Hold every list removal from now on (POST /users/{id}/shopping-list/batch-delete,
 * the drop's write); the fake takes it once released, and records it only then.
 */
async function holdListDeletes(page: Page): Promise<() => void> {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const listDelete = /^\/bar\/api\/users\/\d+\/shopping-list\/batch-delete$/
  await page.route(
    (url) => listDelete.test(url.pathname),
    async (route) => {
      if (route.request().method() === 'POST') await held
      await route.fallback()
    },
  )
  return release
}

const tonicReads = (bar: FakeBar) => bar.calls('GET', /^\/ingredients\/tonic-\d+$/).length

/** Used up: Tonic removed on the Shelf, once the shelf has taken it. Needs page.clock.install(). */
async function useUpOnShelf(page: Page, bar: FakeBar) {
  await goTo(page, 'Shelf', 'Shelf')
  await page.getByRole('button', { name: 'Remove Tonic from the shelf' }).click()
  await expect(page.getByText('Bottle removed from the shelf.')).toBeVisible()
  await expect.poll(() => bar.model.shelf.has(I.tonic)).toBe(false)
  await clearToasts(page)
}

/**
 * Drop Tonic from its row while the staples read is held, then let the read
 * land. The staples in hand are the ones read before, so the row keeps its
 * Staple note throughout.
 */
async function dropWhileStaplesRead(page: Page, bar: FakeBar, release: () => void) {
  const readsBefore = tonicReads(bar)
  await expect(listItem(page, 'Tonic')).toContainText('Staple')
  const deletesBefore = listDeletes(bar).length
  await rail(page).getByRole('button', { name: 'Remove Tonic from the list' }).click()
  await expect(listItem(page, 'Tonic')).toHaveCount(0)
  await expect.poll(() => listDeletes(bar).length).toBe(deletesBefore + 1)
  expect(listDeletes(bar).at(-1)).toEqual({ ingredients: [{ id: I.tonic }] })
  expect(tonicReads(bar)).toBe(readsBefore)

  release()
  await expect.poll(() => tonicReads(bar)).toBe(readsBefore + 1)
  await settled(bar)
}

/** Tonight with the list and the staples read: the Staple note shows once both are in. */
async function openTonight(page: Page, bar: FakeBar) {
  await page.goto('/tonight')
  await expect(listItem(page, 'Tonic')).toContainText('Staple')
  await settled(bar)
  // Already listed, so nothing is queued on opening.
  expect(listStores(bar)).toEqual([])
}

test.describe('a staple off the shelf and already listed when the session starts', () => {
  test.use({ world: tonicListedAndOut() })

  test('dropped from its row, stays dropped: no write puts it back', async ({ page, bar }) => {
    await openTonight(page, bar)

    await rail(page).getByRole('button', { name: 'Remove Tonic from the list' }).click()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await settled(bar)

    expect(listDeletes(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    expect(listStores(bar)).toEqual([])
    expect([...bar.model.list.keys()]).toEqual([])
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await expect(queuedToast(page)).toHaveCount(0)
  })

  test('dropped, stays dropped when Tonight is left and opened again', async ({ page, bar }) => {
    await openTonight(page, bar)
    await rail(page).getByRole('button', { name: 'Remove Tonic from the list' }).click()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await settled(bar)

    const listReads = () => bar.calls('GET', /\/shopping-list$/).length
    const readsBefore = listReads()
    await goTo(page, 'Shelf', 'Shelf')
    await goTo(page, 'Tonight', 'Tonight')
    // The list is read again on the way back in.
    await expect.poll(listReads).toBeGreaterThan(readsBefore)
    await settled(bar)

    expect(listStores(bar)).toEqual([])
    expect([...bar.model.list.keys()]).toEqual([])
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await expect(queuedToast(page)).toHaveCount(0)
  })

  test('taken off with the list search, stays dropped', async ({ page, bar }) => {
    await openTonight(page, bar)

    await rail(page).getByRole('searchbox', { name: 'Add to the list' }).fill('ton')
    const chip = rail(page).getByRole('button', { name: 'Tonic', exact: true })
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await chip.click()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await settled(bar)

    expect(listDeletes(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    expect(listStores(bar)).toEqual([])
    expect([...bar.model.list.keys()]).toEqual([])
    await expect(queuedToast(page)).toHaveCount(0)
  })

  test('dropped before the staples read lands, stays dropped once it does', async ({ page, bar }) => {
    const release = await holdStapleReads(page)
    await page.goto('/tonight')
    // The list is in; the staples are not, so the row has no Staple note yet.
    await expect(listItem(page, 'Tonic')).toBeVisible()
    await expect(listItem(page, 'Tonic')).not.toContainText('Staple')
    await rail(page).getByRole('button', { name: 'Remove Tonic from the list' }).click()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await expect.poll(() => listDeletes(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    expect(tonicReads(bar)).toBe(0)

    release()
    await expect.poll(() => tonicReads(bar)).toBe(1)
    await settled(bar)

    expect(listStores(bar)).toEqual([])
    expect([...bar.model.list.keys()]).toEqual([])
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await expect(queuedToast(page)).toHaveCount(0)
  })

  test('dropped, is queued again after a reload, which starts a new session', async ({ page, bar }) => {
    await openTonight(page, bar)
    await rail(page).getByRole('button', { name: 'Remove Tonic from the list' }).click()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await settled(bar)
    expect(listStores(bar)).toEqual([])

    await page.reload()
    await expect(page.getByText('Staples out — queued: Tonic.')).toBeVisible()
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await settled(bar)
    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    expect([...bar.model.list.keys()]).toEqual([I.tonic])
  })

  test('checked off, is not queued back while the staples read catches up', async ({ page, bar }) => {
    await openTonight(page, bar)
    expect(tonicReads(bar)).toBe(1)
    // The check-off refetches the list and the staples. Here the list lands
    // first: Tonic is off it, and the staples in hand still have it off the
    // shelf. It is on the shelf now, so nothing is queued.
    const release = await holdStapleReads(page)
    await listItem(page, 'Tonic').click()
    await expect(page.getByText('Moved to the shelf.')).toBeVisible()
    expect(bar.model.shelf.has(I.tonic)).toBe(true)
    await settled(bar)
    expect(tonicReads(bar)).toBe(1)
    expect(listStores(bar)).toEqual([])
    await expect(listItem(page, 'Tonic')).toHaveCount(0)

    release()
    await expect.poll(() => tonicReads(bar)).toBe(2)
    await settled(bar)
    expect(listStores(bar)).toEqual([])
    expect([...bar.model.list.keys()]).toEqual([])
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
  })

  test('checked off and then used up, is queued again the next time Tonight opens', async ({ page, bar }) => {
    await page.clock.install()
    await openTonight(page, bar)

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
    await expect(page.getByText('Staples out — queued: Tonic.')).toBeVisible()
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await settled(bar)
    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    expect([...bar.model.list.keys()]).toEqual([I.tonic])
  })

  test('checked off, put back with Undo and dropped while the staples read catches up, stays dropped', async ({ page, bar }) => {
    await openTonight(page, bar)

    // Checked off: the staples read after it has Tonic on the shelf.
    await listItem(page, 'Tonic').click()
    const toast = page.getByRole('status').filter({ hasText: 'Moved to the shelf.' })
    const undo = toast.getByRole('button', { name: 'Undo' })
    await expect(undo).toBeVisible()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await expect.poll(() => tonicReads(bar)).toBe(2)
    await settled(bar)

    // Undo: Tonic off the shelf and back on the list, while the staples read
    // that follows is held.
    const release = await holdStapleReads(page)
    await undo.click()
    await expect(listItem(page, 'Tonic')).toBeVisible()
    expect(bar.model.shelf.has(I.tonic)).toBe(false)
    // The Undo's own write, and nothing else.
    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])

    await dropWhileStaplesRead(page, bar, release)

    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    expect([...bar.model.list.keys()]).toEqual([])
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await expect(queuedToast(page)).toHaveCount(0)
  })
})

/** Tonic on the shelf and on the list: listed by hand while still in stock. */
function tonicListedAndStocked(): WorldSeed {
  const w = defaultWorld()
  w.list = [I.tonic]
  return w
}

test.describe('a staple listed while still on the shelf when the session starts', () => {
  test.use({ world: tonicListedAndStocked() })

  test('used up on the Shelf and dropped while the staples read catches up, stays dropped', async ({ page, bar }) => {
    await page.clock.install()
    await openTonight(page, bar)
    await useUpOnShelf(page, bar)

    // Back on Tonight the staples are read again. Until that read lands, the
    // staples in hand still have Tonic on the shelf.
    const release = await holdStapleReads(page)
    await goTo(page, 'Tonight', 'Tonight')
    await dropWhileStaplesRead(page, bar, release)

    expect(listStores(bar)).toEqual([])
    expect([...bar.model.list.keys()]).toEqual([])
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await expect(queuedToast(page)).toHaveCount(0)
  })

  test('dropped while on the shelf as the staples read catches up, is queued once it is used up', async ({ page, bar }) => {
    await openTonight(page, bar)

    // Left and opened again: the staples are read again, and the drop goes out
    // while that read is under way. Asked first, the read is answered first:
    // Tonic on the shelf and still listed, the same as the staples in hand.
    await goTo(page, 'Shelf', 'Shelf')
    const releaseReads = await holdStapleReads(page)
    const releaseDrop = await holdListDeletes(page)
    await goTo(page, 'Tonight', 'Tonight')
    const readsBefore = tonicReads(bar)
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await rail(page).getByRole('button', { name: 'Remove Tonic from the list' }).click()
    releaseReads()
    await expect.poll(() => tonicReads(bar)).toBe(readsBefore + 1)
    await settled(bar)
    expect(listDeletes(bar)).toEqual([])

    releaseDrop()
    await expect.poll(() => listDeletes(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await settled(bar)
    expect(listStores(bar)).toEqual([])
    expect(bar.model.shelf.has(I.tonic)).toBe(true)

    // Used up after the drop, on another device, with Tonight still open: a
    // new emptying. TanStack's focusManager reads the staples again on
    // visibilitychange, and that read queues it.
    bar.model.shelf.delete(I.tonic)
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    await expect.poll(() => tonicReads(bar)).toBe(readsBefore + 2)
    await expect(page.getByText('Staples out — queued: Tonic.')).toBeVisible()
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await settled(bar)
    expect(listStores(bar)).toEqual([{ ingredients: [{ id: I.tonic }] }])
    expect([...bar.model.list.keys()]).toEqual([I.tonic])
  })
})
