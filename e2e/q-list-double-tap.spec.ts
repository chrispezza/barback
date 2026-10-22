import type { Locator, Page } from '@playwright/test'
import { RECEIPT_MS } from '../src/components/toast-timing'
import { C, I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// A list write holds its control until the list has been read back. Every
// + List and List it (frontend-spec §2 "Add gap to list": POST
// /users/{id}/shopping-list/batch-store) is held while its write is out:
// disabled, or on the Recipe aria-disabled, which keeps the focus a keyboard
// gave it (e2e/t5r-recipe.spec.ts).
// The write's answer alone does not free it: whether the bottle is listed is
// drawn from the list read the write starts (§4: shopping mutations invalidate
// ['shopping-list']), so until that read lands the control still offers the
// bottle. A second tap in that round trip sends a second batch-store, which
// upstream answers by setting the listed row's quantity back to the one sent,
// or 1 (ShoppingListController::batchStore, ShoppingListController.php 76-79
// at v5.15.3), and on Tonight it leaves a second receipt.
//
// Every API answer is held (bar.slowDown), so the read-back is still out when
// the second tap lands. The second tap is forced: a held control takes no
// tap. The browser drops a click on a disabled button, and the Recipe turns
// away a click on an aria-disabled one, so a forced tap on a held control
// sends nothing.

/** How long the fake holds every answer: the list read-back is out this long. */
const LATENCY = 1500

/**
 * The default bar with the Whiskey Sour's optional egg white on the shelf, so
 * the can-pour and one-bottle-away sets do not overlap (as e2e/tonight.spec.ts).
 * Buy next is Scotch whisky; Restock next holds Dark rum.
 */
function tonightWorld(change?: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  w.shelf.push(I.eggWhite)
  change?.(w)
  return w
}

const main = (page: Page) => page.getByRole('main')
const rail = (page: Page) => page.locator('#buy')
const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true })
/** A per-bottle List it (a recipe line, or a near-miss card on Tonight), named for its bottle after those words. */
const listIt = (scope: Locator | Page, bottle: string) =>
  scope.getByRole('button', { name: `List it: ${bottle}`, exact: true })
const listedMark = (scope: Locator) => scope.getByText('Listed', { exact: true })
/** A recipe line by the bottle it names. */
const recipeLine = (page: Page, name: string) =>
  main(page).locator('ul.recipe-ingredients').getByRole('listitem').filter({ hasText: name })
/** A near-miss card's list item on Tonight: the card's link, and what sits beside it. */
const nearItem = (page: Page, drink: string) =>
  page
    .locator('#near')
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: new RegExp(`^${drink}`) }) })
/** The rail's group under this heading: "For your favorites" or "Restock next". */
const group = (page: Page, title: string) =>
  rail(page).locator('.restock-section').filter({ has: heading(page, title) })
/** A shopping-list row's check-off control; its name starts with the bottle. */
const listRow = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
const toast = (page: Page) => page.locator('.toast-host').getByRole('status')

/** The bodies of every list write the bar has been sent. */
const listWrites = (bar: FakeBar) =>
  bar.calls('POST', /^\/users\/1\/shopping-list\/batch-store$/).map((c) => c.body)

const isListRead = (url: string) => /^\/bar\/api\/users\/\d+\/shopping-list$/.test(new URL(url).pathname)

/**
 * Let the page act on what it has just been told. TanStack tells its observers
 * on a zero timeout and Preact renders after that, so two frames cover both
 * (as e2e/d-classics-choose.spec.ts).
 */
async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

/**
 * Tap `control`, then tap it again once its write has answered and the list
 * read-back that answer starts is out: the round trip a quick second tap
 * lands in.
 */
async function tapTwice(page: Page, bar: FakeBar, control: Locator): Promise<void> {
  bar.slowDown(LATENCY)
  const readBack = page.waitForRequest((r) => r.method() === 'GET' && isListRead(r.url()))
  await control.click()
  // The read-back goes out only once the write has answered.
  await readBack
  await settled(page)
  await control.click({ force: true })
  // Off the controls at once: a receipt can appear under a pointer left where
  // it tapped, and a pointer resting on the host pauses its toast, which would
  // read as a second receipt.
  await page.mouse.move(0, 0)
}

/**
 * Record, from load on, each stretch the toast host is on screen. Register
 * before navigating. Toasts queue (src/components/toasts.tsx), and a second
 * receipt with the same words changes nothing in the page: it only holds the
 * host for a second receipt's time. So receipts are counted by how long the
 * host stays up (RECEIPT_MS each, src/components/toast-timing.ts), not by what
 * it says. A pause only lengthens a stretch, so a miscount can fail a test but
 * never pass one.
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
  await expect(page.locator('.toast-host')).toHaveCount(0, { timeout: 4 * RECEIPT_MS })
  const spans = await page.evaluate(
    () => (window as unknown as { toastHostSpans: { shown: number; gone?: number }[] }).toastHostSpans,
  )
  return spans.reduce((n, s) => n + Math.round(((s.gone ?? s.shown) - s.shown) / RECEIPT_MS), 0)
}

test.describe('on the Recipe', () => {
  test('two quick taps on List it send one write, and the line reads Listed', async ({ page, bar }) => {
    await page.goto('/drinks/penicillin-1')
    await expect(page.getByRole('heading', { level: 1, name: 'Penicillin' })).toBeVisible()
    const honey = recipeLine(page, 'Honey syrup')
    await expect(listIt(page, 'Honey syrup')).toBeEnabled()

    await tapTwice(page, bar, listIt(page, 'Honey syrup'))

    await expect(listedMark(honey)).toBeVisible({ timeout: 10_000 })
    await expect(listIt(page, 'Honey syrup')).toHaveCount(0)
    expect(listWrites(bar)).toEqual([{ ingredients: [{ id: I.honeySyrup }] }])
    // A sanity check, not the discriminator: upstream resets the quantity to 1
    // on a second write too, so only the writes above tell one tap from two.
    expect([...bar.model.list.entries()]).toEqual([[I.honeySyrup, 1]])
  })

  test('two quick taps on Add missing send one write, and every line reads Listed', async ({ page, bar }) => {
    await page.goto('/drinks/espresso-martini-1')
    await expect(page.getByRole('heading', { level: 1, name: 'Espresso Martini' })).toBeVisible()
    const addMissing = page.getByRole('button', { name: 'Add missing to the list' })
    await expect(addMissing).toBeEnabled()

    await tapTwice(page, bar, addMissing)

    await expect(main(page).getByText('Already on the list.')).toBeVisible({ timeout: 10_000 })
    for (const name of ['Vodka', 'Coffee liqueur', 'Espresso']) {
      await expect(listedMark(recipeLine(page, name))).toBeVisible()
    }
    expect(listWrites(bar)).toEqual([
      { ingredients: [{ id: I.vodka }, { id: I.coffeeLiqueur }, { id: I.espresso }] },
    ])
  })
})

test.describe('on Tonight', () => {
  test.use({ world: tonightWorld() })

  test('two quick taps on a near miss’s List it send one write and leave one receipt', async ({ page, bar }) => {
    await recordToastHost(page)
    await page.goto('/tonight')
    await expect(heading(page, 'To buy · 0')).toBeVisible()
    const negroni = nearItem(page, 'Negroni')
    await expect(listIt(negroni, 'Campari')).toBeEnabled()

    await tapTwice(page, bar, listIt(negroni, 'Campari'))

    await expect(listedMark(negroni)).toBeVisible({ timeout: 10_000 })
    await expect(toast(page)).toHaveText('Campari — listed.')
    await expect(listRow(page, 'Campari')).toBeVisible()
    // One write, and one receipt for it; the writes are read once the receipts are done.
    const receipts = await receiptsShown(page)
    expect({ writes: listWrites(bar), receipts }).toEqual({
      writes: [{ ingredients: [{ id: I.campari }] }],
      receipts: 1,
    })
  })

  test('two quick taps on Buy next’s List it send one write and leave one receipt', async ({ page, bar }) => {
    await recordToastHost(page)
    await page.goto('/tonight')
    const buyNext = page.locator('#buy .buy-next')
    await expect(buyNext.locator('.buy-next-name')).toHaveText('Scotch whisky')

    await tapTwice(page, bar, buyNext.getByRole('button', { name: 'List it' }))

    await expect(listRow(page, 'Scotch whisky')).toBeVisible({ timeout: 10_000 })
    await expect(toast(page)).toHaveText('Scotch whisky — listed.')
    // One write, and one receipt for it; the writes are read once the receipts are done.
    const receipts = await receiptsShown(page)
    expect({ writes: listWrites(bar), receipts }).toEqual({
      writes: [{ ingredients: [{ id: I.scotch }] }],
      receipts: 1,
    })
  })

  test('two quick taps on Restock next’s List it send one write and leave one receipt', async ({ page, bar }) => {
    await recordToastHost(page)
    await page.goto('/tonight')
    const darkRum = group(page, 'Restock next').locator('.restock-row').filter({ hasText: 'Dark rum' })
    await expect(darkRum).toBeVisible()

    await tapTwice(page, bar, darkRum.getByRole('button', { name: 'List it' }))

    await expect(listRow(page, 'Dark rum')).toBeVisible({ timeout: 10_000 })
    await expect(toast(page)).toHaveText('Dark rum — listed.')
    await expect(darkRum).toHaveCount(0)
    // One write, and one receipt for it; the writes are read once the receipts are done.
    const receipts = await receiptsShown(page)
    expect({ writes: listWrites(bar), receipts }).toEqual({
      writes: [{ ingredients: [{ id: I.darkRum }] }],
      receipts: 1,
    })
  })

  test.describe('with favourites waiting on bottles', () => {
    // Scotch whisky completes two of them and is Buy next; Campari, the
    // Negroni's one gap, is in For your favorites.
    test.use({ world: tonightWorld((w) => (w.favorites = [C.negroni, C.robRoy, C.bobbyBurns])) })

    test('two quick taps on For your favorites’ List it send one write and leave one receipt', async ({
      page,
      bar,
    }) => {
      await recordToastHost(page)
      await page.goto('/tonight')
      const campari = group(page, 'For your favorites').locator('.restock-row').filter({ hasText: 'Campari' })
      await expect(campari).toBeVisible()

      await tapTwice(page, bar, campari.getByRole('button', { name: 'List it' }))

      await expect(listRow(page, 'Campari')).toBeVisible({ timeout: 10_000 })
      await expect(toast(page)).toHaveText('Campari — listed.')
      // One write, and one receipt for it; the writes are read once the receipts are done.
      const receipts = await receiptsShown(page)
      expect({ writes: listWrites(bar), receipts }).toEqual({
        writes: [{ ingredients: [{ id: I.campari }] }],
        receipts: 1,
      })
    })
  })
})
