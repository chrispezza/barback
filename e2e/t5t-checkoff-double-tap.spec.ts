import type { Locator, Page } from '@playwright/test'
import { ACTION_MS } from '../src/components/toast-timing'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// A check-off holds its row until the list has been read back
// (chrispezza/barback#142). A To buy row on Tonight checks its bottle off
// (frontend-spec §5: shelf batch-store first, list batch-delete only on
// success), and a second tap while that check-off is out is a double tap, not a
// second decision: Tonight drops it (the row's guard, checkOff.isPending). The
// two writes answering do not end the check-off. The row leaves the rail only
// when the list read the check-off starts has landed (§4: shelf and list
// mutations invalidate ['shopping-list']; §6 journey 3, "Check-off moves the
// bottle to the shelf and refreshes all counts"), so until then the row is
// still there to tap. Freed on the writes' answer alone, a second tap in that
// round trip sends a second check-off pair, and leaves a second "Moved to the
// shelf." receipt whose Undo would put the bottle back on the list a second
// time.
//
// Every API answer is held (bar.slowDown), so the read-back is still out when
// the second tap lands. The row is never disabled, so the second tap is an
// ordinary one; it is forced only so that it lands where the first did, even
// if the receipt has appeared over the rail.

/** How long the fake holds every answer: the list read-back is out this long. */
const LATENCY = 1500

/**
 * The default bar with the Whiskey Sour's optional egg white on the shelf, as
 * e2e/tonight.spec.ts builds it, so the can-pour and one-bottle-away sets do
 * not overlap (chrispezza/barback#19), with Campari and Scotch whisky listed.
 * Pours 5; one bottle away 6. Campari pours the Negroni.
 */
function tonightWorld(change?: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  w.shelf.push(I.eggWhite)
  w.list = [I.campari, I.scotch]
  change?.(w)
  return w
}

const status = (page: Page) => page.locator('.bar-status')
const rail = (page: Page) => page.locator('#buy')
/** A shopping-list row's check-off control; its name starts with the bottle. */
const listRow = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
const toast = (page: Page) => page.locator('.toast-host').getByRole('status')

/** Every write the bar has been sent, in order: its path and body. */
const writes = (bar: FakeBar) => bar.calls('POST').map((c) => [c.path, c.body])

/** One check-off of `id`, as frontend-spec §5 orders it. */
const checkOffWrites = (id: number) => [
  ['/users/1/ingredients/batch-store', { ingredients: [id] }],
  ['/users/1/shopping-list/batch-delete', { ingredients: [{ id }] }],
]

const isListRead = (url: string) => /^\/bar\/api\/users\/\d+\/shopping-list$/.test(new URL(url).pathname)

/**
 * Let the page act on what it has just been told. TanStack tells its observers
 * on a zero timeout and Preact renders after that, so two frames cover both
 * (as e2e/q-list-double-tap.spec.ts).
 */
async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

/**
 * Count the taps that reach `row` from now on, so a second tap that the
 * receipt or a re-render kept from the row cannot pass for one Tonight dropped.
 */
async function countTaps(row: Locator): Promise<() => Promise<number>> {
  await row.evaluate((el) => {
    el.setAttribute('data-taps', '0')
    el.addEventListener('click', () => el.setAttribute('data-taps', String(Number(el.getAttribute('data-taps')) + 1)))
  })
  return async () => Number(await row.getAttribute('data-taps'))
}

/**
 * Tap `row`, then tap it again once the check-off's writes have answered and
 * the list read-back they start is out: the round trip a quick second tap
 * lands in. Resolves to how many taps reached the row.
 */
async function tapTwice(page: Page, bar: FakeBar, row: Locator): Promise<number> {
  const taps = await countTaps(row)
  bar.slowDown(LATENCY)
  const readBack = page.waitForRequest((r) => r.method() === 'GET' && isListRead(r.url()))
  await row.click()
  // The read-back goes out only once both writes have answered.
  await readBack
  await settled(page)
  await row.click({ force: true })
  const reached = await taps()
  // Off the controls at once: a pointer resting on the toast host pauses its
  // receipt, which would read as a second receipt.
  await page.mouse.move(0, 0)
  return reached
}

/**
 * Record, from load on, each stretch the toast host is on screen. Register
 * before navigating. Toasts queue (src/components/toasts.tsx), and a second
 * receipt with the same words changes nothing in the page: it only holds the
 * host for a second receipt's time. So receipts are counted by how long the
 * host stays up, not by what they say (as e2e/q-list-double-tap.spec.ts). A
 * check-off's receipt carries its Undo, so each holds the host for ACTION_MS
 * (src/components/toast-timing.ts). A pause only lengthens a stretch, so a
 * miscount can fail a test but never pass one.
 */
async function recordToastHost(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const spans: { shown: number; gone?: number }[] = []
    Object.assign(window, { toastHostSpans: spans })
    new MutationObserver(() => {
      const up = document.querySelector('.toast-host') !== null
      const last = spans[spans.length - 1]
      if (up && (last === undefined || last.gone !== undefined)) spans.push({ shown: performance.now() })
      if (!up && last !== undefined && last.gone === undefined) last.gone = performance.now()
    }).observe(document, { subtree: true, childList: true })
  })
}

/** How many receipts the toast host has shown, once it has emptied. */
async function receiptsShown(page: Page): Promise<number> {
  // Off the controls: a pointer resting on the host pauses its toast.
  await page.mouse.move(0, 0)
  await expect(page.locator('.toast-host')).toHaveCount(0, { timeout: 3 * ACTION_MS })
  const spans = await page.evaluate(
    () => (window as unknown as { toastHostSpans: { shown: number; gone?: number }[] }).toastHostSpans,
  )
  return spans.reduce((n, s) => n + Math.round(((s.gone ?? s.shown) - s.shown) / ACTION_MS), 0)
}

test.describe('a check-off on Tonight’s To buy (§5)', () => {
  test.use({ world: tonightWorld() })

  test('two quick taps on a list row send one check-off and leave one receipt', async ({ page, bar }) => {
    // Each receipt holds the host for ACTION_MS; a second would hold it twice as long.
    test.setTimeout(30_000 + 3 * ACTION_MS)
    await recordToastHost(page)
    await page.goto('/tonight')
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 2 to buy')
    const campari = listRow(page, 'Campari')
    await expect(campari).toBeVisible()

    const reached = await tapTwice(page, bar, campari)

    await expect(campari).toHaveCount(0, { timeout: 10_000 })
    await expect(toast(page).getByText('Moved to the shelf.', { exact: true })).toBeVisible()
    await expect(toast(page).getByRole('button', { name: 'Undo', exact: true })).toBeVisible()
    await expect(status(page)).toHaveText('You can pour 6 · 5 one bottle away · 1 to buy', { timeout: 10_000 })
    // One check-off, and one receipt for it, from two taps that both reached
    // the row; the writes are read once the receipts are done.
    const receipts = await receiptsShown(page)
    expect({ reached, writes: writes(bar), receipts }).toEqual({
      reached: 2,
      writes: checkOffWrites(I.campari),
      receipts: 1,
    })
    expect(bar.model.shelf.has(I.campari)).toBe(true)
    expect(bar.model.list.has(I.campari)).toBe(false)
  })

  test('a tap on another row once the list has been read back checks that bottle off', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 2 to buy')
    bar.slowDown(LATENCY)

    await listRow(page, 'Campari').click()
    await expect(listRow(page, 'Campari')).toHaveCount(0, { timeout: 10_000 })
    // The hold ends with the read that took the row away: the next row is live.
    await listRow(page, 'Scotch whisky').click()

    await expect(listRow(page, 'Scotch whisky')).toHaveCount(0, { timeout: 10_000 })
    await expect(rail(page).getByText('Nothing to buy yet — a near miss puts its bottle here.')).toBeVisible({
      timeout: 10_000,
    })
    expect(writes(bar)).toEqual([...checkOffWrites(I.campari), ...checkOffWrites(I.scotch)])
  })

  // The hold is the row's own. A press on another row while the first
  // check-off is read back is a second decision, not a double tap: it checks
  // that bottle off. Dropped, it would be dropped silently, from a row that
  // looks and reports itself as live (WCAG 4.1.2), and ticking bottles off in
  // turn is the store-aisle use of the list.
  test('a tap on another row while the list is read back checks that bottle off, and the first row still takes none', async ({
    page,
    bar,
  }) => {
    await page.goto('/tonight')
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 2 to buy')
    const campari = listRow(page, 'Campari')
    const scotch = listRow(page, 'Scotch whisky')
    const campariTaps = await countTaps(campari)
    const scotchTaps = await countTaps(scotch)
    bar.slowDown(LATENCY)

    const readBack = page.waitForRequest((r) => r.method() === 'GET' && isListRead(r.url()))
    await campari.click()
    await readBack
    await settled(page)
    // Both land while Campari's list read is out, so its row is still there.
    await scotch.click({ force: true })
    await campari.click({ force: true })
    await page.mouse.move(0, 0)
    expect({ campari: await campariTaps(), scotch: await scotchTaps() }).toEqual({ campari: 2, scotch: 1 })

    // Scotch whisky's pair follows Campari's, and nothing follows it.
    await expect
      .poll(() => writes(bar), { timeout: 10_000 })
      .toEqual([...checkOffWrites(I.campari), ...checkOffWrites(I.scotch)])
    await expect(campari).toHaveCount(0, { timeout: 10_000 })
    await expect(scotch).toHaveCount(0, { timeout: 10_000 })
    await expect(rail(page).getByText('Nothing to buy yet — a near miss puts its bottle here.')).toBeVisible({
      timeout: 10_000,
    })
    expect(writes(bar)).toEqual([...checkOffWrites(I.campari), ...checkOffWrites(I.scotch)])
    expect([...bar.model.list.keys()]).toEqual([])
  })

  test('Enter on another row while the list is read back checks that bottle off, and the first row still takes none', async ({
    page,
    bar,
  }) => {
    await page.goto('/tonight')
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 2 to buy')
    const campari = listRow(page, 'Campari')
    const scotch = listRow(page, 'Scotch whisky')
    const campariPresses = await countTaps(campari)
    const scotchPresses = await countTaps(scotch)
    bar.slowDown(LATENCY)

    const readBack = page.waitForRequest((r) => r.method() === 'GET' && isListRead(r.url()))
    await campari.focus()
    await page.keyboard.press('Enter')
    await readBack
    await settled(page)
    await scotch.focus()
    await page.keyboard.press('Enter')
    await campari.focus()
    await page.keyboard.press('Enter')
    // Enter on a button is a click, so the same count holds for a key.
    expect({ campari: await campariPresses(), scotch: await scotchPresses() }).toEqual({ campari: 2, scotch: 1 })

    await expect
      .poll(() => writes(bar), { timeout: 10_000 })
      .toEqual([...checkOffWrites(I.campari), ...checkOffWrites(I.scotch)])
    await expect(campari).toHaveCount(0, { timeout: 10_000 })
    await expect(scotch).toHaveCount(0, { timeout: 10_000 })
    await expect(rail(page).getByText('Nothing to buy yet — a near miss puts its bottle here.')).toBeVisible({
      timeout: 10_000,
    })
    expect(writes(bar)).toEqual([...checkOffWrites(I.campari), ...checkOffWrites(I.scotch)])
    expect([...bar.model.list.keys()]).toEqual([])
  })
})
