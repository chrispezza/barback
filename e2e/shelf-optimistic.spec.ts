import type { Locator, Page, Request } from '@playwright/test'
import { I } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// frontend-spec §5: "Chip toggle is optimistic: flip UI state immediately, fire
// batch-store / batch-delete, roll back on error … API latency must not gate
// the flip." ADR-003 Validation: "chip toggle reflects in UI in < 50 ms
// (optimistic), reconciles with API in the background." The 300 ms budget
// below is the browser's, not the ADR's: it only has to be well inside the
// held round trip. The ledger's Remove is the same toggle (useShelfMutation),
// so it is held to the same rules, and keeps its Undo.

/**
 * Hold the API calls `match` picks until released; the fake then answers them,
 * or fails them if told to. Playwright runs the newest route first, so this
 * sits in front of the fake and falls back to it.
 */
async function hold(page: Page, match: (req: Request) => boolean): Promise<() => void> {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/bar/api/**', async (route) => {
    if (match(route.request())) await gate
    await route.fallback()
  })
  return release
}

/** POST /users/{id}/ingredients/batch-store|delete, optionally for one bottle. */
const shelfWrite =
  (kind: 'store' | 'delete', ingredientId?: number) =>
  (req: Request): boolean =>
    req.method() === 'POST' &&
    new URL(req.url()).pathname.endsWith(`/ingredients/batch-${kind}`) &&
    (ingredientId === undefined ||
      (req.postDataJSON() as { ingredients: number[] }).ingredients.includes(ingredientId))

const BATCH_STORE = /\/ingredients\/batch-store$/
const BATCH_DELETE = /\/ingredients\/batch-delete$/

const chip = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const search = (page: Page) => page.getByRole('searchbox', { name: 'Add a bottle' })
const count = (page: Page) => page.locator('.shelf-count')

/** The ledger's group headers (MatchHeader renders an h2 per group). */
const groupHeaders = (page: Page) => page.getByRole('main').getByRole('heading', { level: 2 })

/** Bottle names inside the group whose header reads `header`. */
const groupRows = (page: Page, header: string) =>
  page
    .getByRole('main')
    .locator('section', { has: page.getByRole('heading', { level: 2, name: header, exact: true }) })
    .locator('.bb-row__name')

const removeButton = (page: Page, name: string) =>
  page.getByRole('button', { name: `Remove ${name} from the shelf`, exact: true })

/** GET /ingredients?filter[on_shelf]=true reads made so far: the shelf query. */
const shelfReadCount = (bar: FakeBar): number =>
  bar.calls('GET', /^\/ingredients$/).filter((c) => c.query.get('filter[on_shelf]') === 'true').length

/**
 * Record every value the chip's aria-pressed takes from now on, so a journey
 * can show it never flipped back, not only where it ended up.
 */
async function recordPressed(locator: Locator): Promise<() => Promise<string[]>> {
  type Recorded = HTMLElement & { pressedSeen?: string[] }
  await locator.evaluate((el: Recorded) => {
    const seen: string[] = []
    el.pressedSeen = seen
    new MutationObserver(() => {
      const value = el.getAttribute('aria-pressed') ?? ''
      if (seen[seen.length - 1] !== value) seen.push(value)
    }).observe(el, { attributes: true, attributeFilter: ['aria-pressed'] })
  })
  return () => locator.evaluate((el: Recorded) => [...(el.pressedSeen ?? [])])
}

async function openShelf(page: Page): Promise<void> {
  await page.goto('/shelf')
  await expect(count(page)).toHaveText('11 bottles on the shelf.')
  await expect(groupHeaders(page)).toHaveCount(6)
}

test.describe('a chip toggle', () => {
  test('flips the moment it is tapped, before the API answers', async ({ page, bar }) => {
    await openShelf(page)
    const shelfReads = () =>
      bar.calls('GET', /^\/ingredients$/).filter((c) => c.query.get('filter[on_shelf]') === 'true').length
    const readsBefore = shelfReads()
    bar.slowDown(1500)

    await search(page).fill('Cointreau')
    const cointreau = chip(page, 'Cointreau')
    await expect(cointreau).toHaveAttribute('aria-pressed', 'false')
    await cointreau.click()

    await expect(cointreau).toHaveAttribute('aria-pressed', 'true', { timeout: 300 })
    await expect(count(page)).toHaveText('12 bottles on the shelf.', { timeout: 300 })
    // The store is out and still held: nothing has been read back yet, so the
    // flip came from the client, not from a refetch.
    await expect.poll(() => bar.calls('POST', BATCH_STORE).length).toBe(1)
    expect(bar.calls('POST', BATCH_STORE)[0]?.body).toEqual({ ingredients: [I.cointreau] })
    expect(shelfReads()).toBe(readsBefore)

    // Reconciled in the background: the shelf is read back and agrees.
    await expect.poll(shelfReads, { timeout: 10_000 }).toBeGreaterThan(readsBefore)
    await expect(groupRows(page, 'Liqueurs · 1')).toHaveText(['Cointreau'], { timeout: 10_000 })
    await expect(cointreau).toHaveAttribute('aria-pressed', 'true')
    await expect(count(page)).toHaveText('12 bottles on the shelf.')
    expect(bar.model.shelf.has(I.cointreau)).toBe(true)
  })

  test('leaves the other chips live while one toggle is in flight', async ({ page, bar }) => {
    await openShelf(page)
    const release = await hold(page, shelfWrite('store'))

    await search(page).fill('rum')
    const darkRum = chip(page, 'Dark rum')
    const rum = chip(page, 'Rum')
    await expect(darkRum).toHaveAttribute('aria-pressed', 'false')
    await darkRum.click()
    await expect(darkRum).toHaveAttribute('aria-pressed', 'true', { timeout: 300 })

    // A second bottle is a second decision, not a double-tap.
    await expect(rum).toBeEnabled({ timeout: 300 })
    await expect(chip(page, 'White rum')).toBeEnabled({ timeout: 300 })
    await rum.click()
    await expect(rum).toHaveAttribute('aria-pressed', 'true', { timeout: 300 })
    await expect(count(page)).toHaveText('13 bottles on the shelf.', { timeout: 300 })

    release()
    await expect
      .poll(() => bar.calls('POST', BATCH_STORE).map((c) => c.body))
      .toEqual([{ ingredients: [I.darkRum] }, { ingredients: [I.rum] }])
    await expect.poll(() => [bar.model.shelf.has(I.darkRum), bar.model.shelf.has(I.rum)]).toEqual([true, true])
    await expect(darkRum).toHaveAttribute('aria-pressed', 'true')
    await expect(rum).toHaveAttribute('aria-pressed', 'true')
  })

  test('ignores a second tap on the same chip while its toggle is in flight', async ({ page, bar }) => {
    await openShelf(page)
    const release = await hold(page, shelfWrite('store'))

    await search(page).fill('Cointreau')
    const cointreau = chip(page, 'Cointreau')
    await expect(cointreau).toHaveAttribute('aria-pressed', 'false')
    await cointreau.click()
    await expect(cointreau).toHaveAttribute('aria-pressed', 'true', { timeout: 300 })
    // The double-tap lands while the store is still out.
    await cointreau.click({ timeout: 1000 })
    await expect(cointreau).toHaveAttribute('aria-pressed', 'true')

    release()
    await expect(groupRows(page, 'Liqueurs · 1')).toHaveText(['Cointreau'])
    await expect(cointreau).toHaveAttribute('aria-pressed', 'true')
    expect(bar.calls('POST', BATCH_STORE)).toHaveLength(1)
    expect(bar.calls('POST', BATCH_DELETE)).toHaveLength(0)
    expect(bar.model.shelf.has(I.cointreau)).toBe(true)
  })

  test('rolls back and says so when the shelf does not take it', async ({ page, bar }) => {
    await openShelf(page)
    bar.fail(BATCH_STORE, { method: 'POST', status: 500 })
    const release = await hold(page, shelfWrite('store'))

    await search(page).fill('Cointreau')
    const cointreau = chip(page, 'Cointreau')
    await expect(cointreau).toHaveAttribute('aria-pressed', 'false')
    await cointreau.click()
    await expect(cointreau).toHaveAttribute('aria-pressed', 'true', { timeout: 300 })

    release()
    await expect(cointreau).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('status')).toHaveText('The shelf didn’t take that change.')
    await expect(count(page)).toHaveText('11 bottles on the shelf.')
    await expect(groupHeaders(page)).toHaveCount(6)
    expect(bar.model.shelf.has(I.cointreau)).toBe(false)
  })

  test('rolls back only the toggle that failed', async ({ page, bar }) => {
    await openShelf(page)
    bar.fail(BATCH_STORE, { method: 'POST', status: 500, times: 1 })
    const releaseDarkRum = await hold(page, shelfWrite('store', I.darkRum))
    const releaseRum = await hold(page, shelfWrite('store', I.rum))

    await search(page).fill('rum')
    const darkRum = chip(page, 'Dark rum')
    const rum = chip(page, 'Rum')
    await expect(darkRum).toHaveAttribute('aria-pressed', 'false')
    await darkRum.click()
    await rum.click({ timeout: 1000 })
    await expect(darkRum).toHaveAttribute('aria-pressed', 'true', { timeout: 300 })
    await expect(rum).toHaveAttribute('aria-pressed', 'true', { timeout: 300 })

    // Dark rum's store reaches the fake first and is refused; Rum's is still out.
    releaseDarkRum()
    await expect(darkRum).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('status')).toHaveText('The shelf didn’t take that change.')
    await expect(rum).toHaveAttribute('aria-pressed', 'true')
    await expect(count(page)).toHaveText('12 bottles on the shelf.')

    releaseRum()
    await expect.poll(() => bar.model.shelf.has(I.rum)).toBe(true)
    await expect(rum).toHaveAttribute('aria-pressed', 'true')
    await expect(darkRum).toHaveAttribute('aria-pressed', 'false')
    await expect(count(page)).toHaveText('12 bottles on the shelf.')
    expect(bar.model.shelf.has(I.darkRum)).toBe(false)
  })

  // ADR-007 Consequences: "Offline check-off is not supported; mutations require
  // connectivity" — no outbox. A tap made offline is tried, refused and rolled
  // back; it is never held and sent on reconnect behind the user's back.
  test('rolls back and says so when the tap is made offline', async ({ page, context, bar }) => {
    await openShelf(page)
    await search(page).fill('Cointreau')
    const cointreau = chip(page, 'Cointreau')
    await expect(cointreau).toHaveAttribute('aria-pressed', 'false')
    const pressed = await recordPressed(cointreau)

    await context.setOffline(true)
    // Route interception still answers while the context is offline, so the
    // fake drops the connection as the network would.
    bar.takeApiDown()
    await cointreau.click()

    await expect(page.getByRole('status')).toHaveText('The shelf didn’t take that change.')
    // The chip flipped, as every toggle does, and came back when the write failed.
    expect(await pressed()).toEqual(['true', 'false'])
    await expect(cointreau).toHaveAttribute('aria-pressed', 'false')
    await expect(count(page)).toHaveText('11 bottles on the shelf.')
    expect(bar.calls('POST', BATCH_STORE).map((c) => c.body)).toEqual([{ ingredients: [I.cointreau] }])
    expect(bar.model.shelf.has(I.cointreau)).toBe(false)

    // Nothing is left pending, so the next tap is a fresh attempt, not a dropped double-tap.
    await cointreau.click()
    await expect.poll(pressed).toEqual(['true', 'false', 'true', 'false'])
    expect(bar.calls('POST', BATCH_STORE)).toHaveLength(2)
    await expect(count(page)).toHaveText('11 bottles on the shelf.')
    expect(bar.model.shelf.has(I.cointreau)).toBe(false)
  })

  test('holds the flip through a refetch when the tab comes back into view', async ({ page, bar }) => {
    await openShelf(page)
    const release = await hold(page, shelfWrite('store', I.cointreau))

    await search(page).fill('Cointreau')
    const cointreau = chip(page, 'Cointreau')
    await expect(cointreau).toHaveAttribute('aria-pressed', 'false')
    const pressed = await recordPressed(cointreau)
    await cointreau.click()
    await expect(cointreau).toHaveAttribute('aria-pressed', 'true', { timeout: 300 })
    const shelfReads = shelfReadCount(bar)
    const railReads = bar.calls('GET', /^\/cocktails$/).length

    // TanStack's focusManager refetches stale queries on visibilitychange. The
    // rail's pourable count goes; the shelf, with its store still out, waits.
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    await expect.poll(() => bar.calls('GET', /^\/cocktails$/).length).toBeGreaterThan(railReads)
    expect(shelfReadCount(bar)).toBe(shelfReads)
    await expect(cointreau).toHaveAttribute('aria-pressed', 'true')

    release()
    await expect.poll(() => shelfReadCount(bar)).toBeGreaterThan(shelfReads)
    await expect(groupRows(page, 'Liqueurs · 1')).toHaveText(['Cointreau'])
    await expect(count(page)).toHaveText('12 bottles on the shelf.')
    expect(await pressed()).toEqual(['true'])
    expect(bar.model.shelf.has(I.cointreau)).toBe(true)
  })
})

test.describe('the ledger’s Remove', () => {
  test('takes the row off at once, and offers Undo once the shelf has it', async ({ page, bar }) => {
    await openShelf(page)
    const release = await hold(page, shelfWrite('delete'))

    await removeButton(page, 'Gin').click()
    await expect(groupRows(page, 'Spirits · 3')).toHaveText(['Bourbon whiskey', 'Laphroaig 10', 'White rum'], {
      timeout: 300,
    })
    await expect(count(page)).toHaveText('10 bottles on the shelf.', { timeout: 300 })
    // The Undo is a receipt of what the shelf took, so it waits for the answer.
    await expect(page.getByRole('alert')).toHaveCount(0)

    release()
    const toast = page.getByRole('alert')
    await expect(toast).toContainText('Bottle removed from the shelf.')
    expect(bar.model.shelf.has(I.gin)).toBe(false)
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect(groupRows(page, 'Spirits · 4')).toHaveText(['Bourbon whiskey', 'Gin', 'Laphroaig 10', 'White rum'])
    await expect(count(page)).toHaveText('11 bottles on the shelf.')
    expect(bar.calls('POST', BATCH_DELETE).map((c) => c.body)).toEqual([{ ingredients: [I.gin] }])
    expect(bar.calls('POST', BATCH_STORE).map((c) => c.body)).toEqual([{ ingredients: [I.gin] }])
    expect(bar.model.shelf.has(I.gin)).toBe(true)
  })

  test('takes a second row off while the first is still going', async ({ page, bar }) => {
    await openShelf(page)
    const release = await hold(page, shelfWrite('delete'))

    await removeButton(page, 'Gin').click()
    await expect(groupRows(page, 'Spirits · 3')).toHaveText(['Bourbon whiskey', 'Laphroaig 10', 'White rum'], {
      timeout: 300,
    })
    await removeButton(page, 'Tonic').click()
    await expect(groupRows(page, 'Beverages · 1')).toHaveText(['Club soda'], { timeout: 300 })
    await expect(count(page)).toHaveText('9 bottles on the shelf.', { timeout: 300 })

    release()
    await expect
      .poll(() => bar.calls('POST', BATCH_DELETE).map((c) => c.body))
      .toEqual([{ ingredients: [I.gin] }, { ingredients: [I.tonic] }])
    await expect.poll(() => [bar.model.shelf.has(I.gin), bar.model.shelf.has(I.tonic)]).toEqual([false, false])
    await expect(count(page)).toHaveText('9 bottles on the shelf.')
  })

  test('puts the row back and says so when the shelf does not take the removal', async ({ page, bar }) => {
    await openShelf(page)
    bar.fail(BATCH_DELETE, { method: 'POST', status: 500 })
    const release = await hold(page, shelfWrite('delete'))

    await removeButton(page, 'Gin').click()
    await expect(groupRows(page, 'Spirits · 3')).toHaveText(['Bourbon whiskey', 'Laphroaig 10', 'White rum'], {
      timeout: 300,
    })

    release()
    await expect(groupRows(page, 'Spirits · 4')).toHaveText(['Bourbon whiskey', 'Gin', 'Laphroaig 10', 'White rum'])
    await expect(page.getByRole('status')).toHaveText('The shelf didn’t take that change.')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(count(page)).toHaveText('11 bottles on the shelf.')
    expect(bar.model.shelf.has(I.gin)).toBe(true)
  })

  test('closes an emptied group without the ledger going flat', async ({ page }) => {
    await openShelf(page)
    // Hold the root-name lookup the new set of roots would ask for.
    const release = await hold(
      page,
      (req) => req.method() === 'GET' && new URL(req.url()).searchParams.has('filter[id]'),
    )

    await removeButton(page, 'Angostura aromatic bitters').click()
    await expect(groupHeaders(page)).toHaveText(
      ['Spirits · 4', 'Beverages · 2', 'Fortified wine · 1', 'Juices · 2', 'Sweeteners · 1'],
      { timeout: 300 },
    )
    release()
    await expect(count(page)).toHaveText('10 bottles on the shelf.')
    await expect(groupHeaders(page)).toHaveText([
      'Spirits · 4',
      'Beverages · 2',
      'Fortified wine · 1',
      'Juices · 2',
      'Sweeteners · 1',
    ])
  })
})

// The Undo the ledger's Remove offers is the same toggle: the row comes back at
// once, a refusal takes it off again with the same toast, and its answer is
// never read back over another toggle still in flight.
test.describe('the Undo toast', () => {
  /** Remove Gin, let the shelf take it, and return the toast's Undo. */
  async function removeGin(page: Page, bar: FakeBar): Promise<Locator> {
    const readsAtOpen = shelfReadCount(bar)
    await removeButton(page, 'Gin').click()
    const undo = page.getByRole('alert').getByRole('button', { name: 'Undo' })
    await expect(undo).toBeVisible()
    expect(bar.model.shelf.has(I.gin)).toBe(false)
    // The removal's own read-back has gone out.
    await expect.poll(() => shelfReadCount(bar)).toBe(readsAtOpen + 1)
    await expect(groupRows(page, 'Spirits · 3')).toHaveText(['Bourbon whiskey', 'Laphroaig 10', 'White rum'])
    return undo
  }

  test('puts the row back at once, and keeps a chip in flight pressed', async ({ page, bar }) => {
    await openShelf(page)
    const undo = await removeGin(page, bar)
    const release = await hold(page, shelfWrite('store', I.cointreau))

    await search(page).fill('Cointreau')
    const cointreau = chip(page, 'Cointreau')
    await expect(cointreau).toHaveAttribute('aria-pressed', 'false')
    const pressed = await recordPressed(cointreau)
    await cointreau.click()
    await expect(cointreau).toHaveAttribute('aria-pressed', 'true', { timeout: 300 })
    const shelfReads = shelfReadCount(bar)

    const undoAnswered = page.waitForResponse((res) => shelfWrite('store', I.gin)(res.request()))
    await undo.click()
    await expect(groupRows(page, 'Spirits · 4')).toHaveText(['Bourbon whiskey', 'Gin', 'Laphroaig 10', 'White rum'], {
      timeout: 300,
    })
    await expect(count(page)).toHaveText('12 bottles on the shelf.', { timeout: 300 })
    await undoAnswered
    expect(bar.model.shelf.has(I.gin)).toBe(true)
    // Cointreau's store is still out, so nothing is read back over its flip.
    await expect(cointreau).toHaveAttribute('aria-pressed', 'true')
    expect(shelfReadCount(bar)).toBe(shelfReads)

    release()
    await expect.poll(() => shelfReadCount(bar)).toBeGreaterThan(shelfReads)
    await expect(groupRows(page, 'Liqueurs · 1')).toHaveText(['Cointreau'])
    await expect(groupRows(page, 'Spirits · 4')).toHaveText(['Bourbon whiskey', 'Gin', 'Laphroaig 10', 'White rum'])
    await expect(count(page)).toHaveText('12 bottles on the shelf.')
    expect(await pressed()).toEqual(['true'])
    // The fake records a write when it reaches it: Cointreau's only on release.
    expect(bar.calls('POST', BATCH_STORE).map((c) => c.body)).toEqual([
      { ingredients: [I.gin] },
      { ingredients: [I.cointreau] },
    ])
    expect(bar.model.shelf.has(I.cointreau)).toBe(true)
  })

  test('takes the row off again and says so when the shelf refuses the Undo', async ({ page, bar }) => {
    await openShelf(page)
    const undo = await removeGin(page, bar)
    bar.fail(BATCH_STORE, { method: 'POST', status: 500 })
    const release = await hold(page, shelfWrite('store', I.gin))

    await undo.click()
    await expect(groupRows(page, 'Spirits · 4')).toHaveText(['Bourbon whiskey', 'Gin', 'Laphroaig 10', 'White rum'], {
      timeout: 300,
    })
    await expect(count(page)).toHaveText('11 bottles on the shelf.', { timeout: 300 })

    release()
    await expect(page.getByRole('status')).toHaveText('The shelf didn’t take that change.')
    await expect(groupRows(page, 'Spirits · 3')).toHaveText(['Bourbon whiskey', 'Laphroaig 10', 'White rum'])
    await expect(count(page)).toHaveText('10 bottles on the shelf.')
    expect(bar.calls('POST', BATCH_STORE).map((c) => c.body)).toEqual([{ ingredients: [I.gin] }])
    expect(bar.model.shelf.has(I.gin)).toBe(false)
  })
})
