import type { Locator, Page, Request } from '@playwright/test'
import { C, I, T } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Classics Choose against frontend-spec §1 ("favorite a classic, queue its
// missing bottles") and ADR-008 ("Attribution over surprise: every list entry
// must be able to say why it exists"). A bottle Choose queues is on the list
// because a drink is a favourite, so:
//
// - the list write goes out only for a tap that meant to choose, and only once
//   toggle-favorite has answered that the drink is now a favourite (sequenced,
//   as check-off is); nothing is said about the favourite before that answer,
//   and what is said is what the answer says;
// - Choose decides what to queue from the list as read, so it waits until the
//   list has been read: upstream batch-store resets a listed row's quantity to
//   the one sent, or 1 (ShoppingListController::batchStore,
//   ShoppingListController.php 76-79). A later read under way (the tab coming
//   back into view) holds no button, since that would take a keyboard user's
//   focus; a Choose made during it waits for it before deciding;
// - un-choosing speaks of bottles only when one of the drink's missing bottles
//   is on the list.

const TOGGLE = /^\/cocktails\/\d+\/toggle-favorite$/

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One roster entry: the drink card and its Choose button. */
function entry(page: Page, name: string): Locator {
  return page.locator('.first-pour-item').filter({
    has: page.getByRole('heading', { level: 3, name: new RegExp(`^(Favorited )?${escape(name)}$`) }),
  })
}

function chooseButton(page: Page, name: string): Locator {
  return entry(page, name).getByRole('button')
}

function toast(page: Page): Locator {
  return page.locator('.toast-host').getByRole('status')
}

async function openRoster(page: Page): Promise<void> {
  await page.goto('/first-pours')
  await expect(entry(page, 'Margarita')).toBeVisible()
}

/** Resolves once the shopping list GET has answered the page. Register before navigating. */
function listLoaded(page: Page): Promise<unknown> {
  return page.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith('/shopping-list'),
  )
}

function listedIds(body: unknown): number[] {
  return ((body as { ingredients: { id: number }[] }).ingredients ?? []).map((i) => i.id).sort((a, b) => a - b)
}

const isFavouriteWrite = (req: Request): boolean =>
  req.method() === 'POST' && TOGGLE.test(new URL(req.url()).pathname.replace(/^\/bar\/api/, ''))

const isListRead = (req: Request): boolean =>
  req.method() === 'GET' && new URL(req.url()).pathname.endsWith('/shopping-list')

/**
 * Hold the API calls `match` picks until released; the fake then answers them
 * as upstream would. Playwright runs the newest route first, so this sits in
 * front of the fake and falls back to it. `arrived` resolves once the first
 * held call has been sent by the page.
 */
async function hold(
  page: Page,
  match: (req: Request) => boolean,
): Promise<{ arrived: Promise<void>; release: () => void }> {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let arrive = () => {}
  const arrived = new Promise<void>((resolve) => {
    arrive = resolve
  })
  await page.route('**/bar/api/**', async (route) => {
    if (match(route.request())) {
      arrive()
      await gate
    }
    await route.fallback()
  })
  return { arrived, release }
}

/**
 * Record every toast the page shows from load on, in order, so a journey can
 * show what was never said, not only what is on screen at the end. Register
 * before navigating.
 */
async function recordToasts(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = []
    Object.assign(window, { toastsSeen: seen })
    let last = ''
    new MutationObserver(() => {
      const text = document.querySelector('.toast-host .bb-toast__text')?.textContent ?? ''
      if (text !== '' && text !== last) seen.push(text)
      last = text
    }).observe(document, { subtree: true, childList: true, characterData: true })
  })
  return () => page.evaluate(() => [...((window as unknown as { toastsSeen?: string[] }).toastsSeen ?? [])])
}

/**
 * Record, by drink, every Choose that is disabled from now on. A disabled
 * button drops the focus it holds, and the focus does not come back when it is
 * enabled again, so a keyboard or screen-reader user loses their place.
 */
async function recordDisabled(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const seen: string[] = []
    Object.assign(window, { disabledSeen: seen })
    const roster = document.querySelector('.card-list')
    if (roster === null) throw new Error('the roster is not on the page')
    new MutationObserver((records) => {
      for (const r of records) {
        // No old value: the attribute was added, whatever came after it.
        if (r.oldValue === null && r.target instanceof Element) {
          seen.push(r.target.closest('.first-pour-item')?.querySelector('h3')?.textContent ?? '')
        }
      }
    }).observe(roster, { subtree: true, attributes: true, attributeFilter: ['disabled'], attributeOldValue: true })
  })
  return () => page.evaluate(() => [...((window as unknown as { disabledSeen?: string[] }).disabledSeen ?? [])])
}

/**
 * Let the page act on a request it has just sent. TanStack tells its observers
 * on a zero timeout and Preact renders after that, so two frames cover both.
 */
async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

/** The tab comes back into view: TanStack's focusManager refetches stale queries, the list among them. */
async function returnToTab(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
}

/** Wait until no toast is showing or queued: the host empties only when the queue does. */
async function toastsDone(page: Page): Promise<void> {
  await expect(page.locator('.toast-host')).toHaveCount(0, { timeout: 15_000 })
}

test.describe('Choose waits for the favourite (§1, ADR-008)', () => {
  test('a refused favourite queues nothing and says only that it did not take', async ({ page, bar }) => {
    const toasts = await recordToasts(page)
    bar.fail(TOGGLE, { method: 'POST', status: 500 })
    const listed = listLoaded(page)
    await openRoster(page)
    await listed
    const button = chooseButton(page, 'Margarita')

    await button.click()
    await expect(toast(page)).toHaveText('The favorite didn’t take.')
    await expect(button).toBeEnabled()
    await expect(button).toHaveText('Choose')
    await expect(button).toHaveAttribute('aria-pressed', 'false')

    // No favourite, so no bottle on the list can say why it is there.
    expect(bar.calls('POST').map((r) => r.path)).toEqual([`/cocktails/${C.margarita}/toggle-favorite`])
    expect([...bar.model.list.keys()]).toEqual([])
    expect(bar.model.favorites.has(C.margarita)).toBe(false)
    await toastsDone(page)
    expect(await toasts()).toEqual(['The favorite didn’t take.'])
  })

  test('a drink with nothing to queue is called favorited only once the favourite has taken', async ({ page, bar }) => {
    const toasts = await recordToasts(page)
    const listed = listLoaded(page)
    await openRoster(page)
    await listed
    const favourite = await hold(page, isFavouriteWrite)

    // Daiquiri pours: nothing is missing, so the favourite is the whole change.
    await chooseButton(page, 'Daiquiri').click()
    await favourite.arrived
    expect(await toasts(), 'nothing is claimed before the server answers').toEqual([])

    favourite.release()
    await expect(toast(page)).toHaveText('Daiquiri — favorited.')
    await expect(chooseButton(page, 'Daiquiri')).toHaveAttribute('aria-pressed', 'true')
    expect(await toasts()).toEqual(['Daiquiri — favorited.'])
    expect(bar.calls('POST', /\/shopping-list\//)).toEqual([])
  })

  test('the list write goes out only once the favourite has answered', async ({ page, bar }) => {
    const toasts = await recordToasts(page)
    const listed = listLoaded(page)
    await openRoster(page)
    await listed
    const favourite = await hold(page, isFavouriteWrite)

    await chooseButton(page, 'Margarita').click()
    await favourite.arrived
    expect(await toasts(), 'nothing is claimed before the server answers').toEqual([])

    favourite.release()
    await expect(toast(page)).toHaveText('Margarita — favorited, 2 bottles queued.')
    // The fake records a held call when it is answered, so the order is the
    // order the server answered in: the favourite, then the list.
    expect(bar.calls('POST').map((r) => r.path)).toEqual([
      `/cocktails/${C.margarita}/toggle-favorite`,
      '/users/1/shopping-list/batch-store',
    ])
    expect(listedIds(bar.calls('POST', /\/shopping-list\/batch-store$/)[0]?.body)).toEqual(
      [I.tequila, I.cointreau].sort((a, b) => a - b),
    )
    expect(bar.model.favorites.has(C.margarita)).toBe(true)
  })

  test('a drink the server already holds as a favourite is taken off, and nothing is queued', async ({ page, bar }) => {
    const listed = listLoaded(page)
    await openRoster(page)
    await listed
    const button = chooseButton(page, 'Negroni')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    // Favourited elsewhere (the Recipe screen, another device) after the roster was read.
    bar.model.favorites.add(C.negroni)

    await button.click()
    // toggle-favorite toggles, and answers which way it went
    // (CocktailController::toggleFavorite, CocktailController.php 221-228).
    await expect(toast(page)).toHaveText('Negroni — removed from favorites.')
    await expect(button).toBeEnabled()
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(bar.model.favorites.has(C.negroni)).toBe(false)
    expect(bar.calls('POST', /\/shopping-list\//)).toEqual([])
    expect(bar.model.list.has(I.campari)).toBe(false)
  })

  test('un-choosing a drink the server no longer holds favourites it again, and queues nothing', async ({
    page,
    bar,
  }) => {
    bar.model.favorites.add(C.margarita)
    const listed = listLoaded(page)
    await openRoster(page)
    await listed
    const button = chooseButton(page, 'Margarita')
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    // Taken off elsewhere after the roster was read.
    bar.model.favorites.delete(C.margarita)

    await button.click()
    // The tap meant to take it off; the server put it back on. It says so, and
    // queues nothing: a list write here is a Choose, and this tap was not one.
    await expect(toast(page)).toHaveText('Margarita — favorited.')
    await expect(button).toBeEnabled()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(bar.model.favorites.has(C.margarita)).toBe(true)
    expect(bar.calls('POST', /\/shopping-list\//)).toEqual([])
    expect([...bar.model.list.keys()]).toEqual([])
  })
})

test.describe('Choose waits for the list (§1, ADR-008)', () => {
  test('while the list is being read, Choose is held, then queues only what is not listed', async ({ page, bar }) => {
    bar.model.list.set(I.tequila, 2)
    const list = await hold(page, isListRead)
    await openRoster(page)
    await list.arrived
    const button = chooseButton(page, 'Margarita')

    await expect(button).toBeDisabled()
    // An impatient tap lands on a held button.
    await button.click({ force: true })

    const listed = listLoaded(page)
    list.release()
    await listed
    await expect(button).toBeEnabled()
    expect(bar.calls('POST')).toEqual([])

    await button.click()
    await expect(toast(page)).toHaveText('Margarita — favorited, 1 bottle queued.')
    const stores = bar.calls('POST', /\/shopping-list\/batch-store$/)
    expect(stores).toHaveLength(1)
    expect(listedIds(stores[0]?.body)).toEqual([I.cointreau])
    expect(bar.model.list.get(I.tequila)).toBe(2)
  })

  test('while the list is read back after a write, Choose is held until the new rows are in', async ({
    page,
    bar,
  }) => {
    // Paloma shares Margarita's tequila. The roster names it; this world lacks
    // it, so it is seeded here: tequila missing, lime and soda on the shelf.
    bar.model.world.cocktails.push({
      id: 90,
      name: 'Paloma',
      tagIds: [T.highball],
      lines: [
        { ingredientId: I.tequila, amount: 50, units: 'ml' },
        { ingredientId: I.limeJuice, amount: 15, units: 'ml' },
        { ingredientId: I.clubSoda, amount: 100, units: 'ml' },
      ],
      instructions: 'Build over ice and top with soda.',
    })
    const listed = listLoaded(page)
    await openRoster(page)
    await listed
    await expect(entry(page, 'Paloma')).toContainText('One bottle away: Tequila')
    // Hold every list read from here on: the read-back after Margarita's write.
    const reread = await hold(page, isListRead)

    await chooseButton(page, 'Margarita').click()
    await expect(toast(page)).toHaveText('Margarita — favorited, 2 bottles queued.')
    await reread.arrived
    // The rows in hand predate the write: Paloma's tequila would read as unlisted.
    await expect(chooseButton(page, 'Paloma')).toBeDisabled()
    await chooseButton(page, 'Paloma').click({ force: true })

    const listedAgain = listLoaded(page)
    reread.release()
    await listedAgain
    await expect(chooseButton(page, 'Paloma')).toBeEnabled()
    expect(bar.calls('POST', /\/shopping-list\/batch-store$/)).toHaveLength(1)

    await chooseButton(page, 'Paloma').click()
    // Toasts queue: Paloma's follows Margarita's receipt.
    await expect(toast(page)).toHaveText('Paloma — favorited.', { timeout: 10_000 })
    expect(bar.calls('POST', /\/shopping-list\/batch-store$/)).toHaveLength(1)
    expect(bar.model.favorites.has(90)).toBe(true)
  })

  test('a read under way leaves a focused Choose as it is, and Enter waits for that read to decide', async ({
    page,
    bar,
  }) => {
    const listed = listLoaded(page)
    await openRoster(page)
    await listed
    const button = chooseButton(page, 'Margarita')
    await button.focus()
    await expect(button).toBeFocused()
    // Listed elsewhere (Tonight, another device) after this screen read the list.
    bar.model.list.set(I.tequila, 2)
    const read = await hold(page, isListRead)
    const disabled = await recordDisabled(page)

    await returnToTab(page)
    await read.arrived
    await settled(page)
    // Rows from a read that succeeded are in hand, so nothing is held.
    expect(await disabled(), 'a read under way holds no Choose').toEqual([])
    await expect(button).toBeFocused()
    await expect(button).toBeEnabled()

    const mark = bar.calls().length
    await page.keyboard.press('Enter')
    // The rows in hand say tequila is unlisted; the read under way says it is listed.
    read.release()
    await expect(toast(page)).toHaveText('Margarita — favorited, 1 bottle queued.')
    const stores = bar.calls('POST', /\/shopping-list\/batch-store$/)
    expect(stores).toHaveLength(1)
    expect(listedIds(stores[0]?.body)).toEqual([I.cointreau])
    expect(bar.model.list.get(I.tequila)).toBe(2)
    // The fake records a held call when it answers it: the read landed before the favourite went out.
    const sent = bar
      .calls()
      .slice(mark)
      .map((r) => `${r.method} ${r.path}`)
      .filter((call) => call.startsWith('POST') || call === 'GET /users/1/shopping-list')
    expect(sent.slice(0, 3)).toEqual([
      'GET /users/1/shopping-list',
      `POST /cocktails/${C.margarita}/toggle-favorite`,
      'POST /users/1/shopping-list/batch-store',
    ])
  })

  test('a read that lands leaves a focused Choose focused, and Enter decides against its rows', async ({
    page,
    bar,
  }) => {
    const listed = listLoaded(page)
    await openRoster(page)
    await listed
    const button = chooseButton(page, 'Margarita')
    await button.focus()
    await expect(button).toBeFocused()
    bar.model.list.set(I.tequila, 2)
    const read = await hold(page, isListRead)
    const disabled = await recordDisabled(page)

    await returnToTab(page)
    await read.arrived
    const landed = listLoaded(page)
    read.release()
    await landed
    await settled(page)
    expect(await disabled(), 'a read that lands holds no Choose').toEqual([])
    await expect(button).toBeFocused()
    await expect(button).toBeEnabled()

    await page.keyboard.press('Enter')
    await expect(toast(page)).toHaveText('Margarita — favorited, 1 bottle queued.')
    const stores = bar.calls('POST', /\/shopping-list\/batch-store$/)
    expect(stores).toHaveLength(1)
    expect(listedIds(stores[0]?.body)).toEqual([I.cointreau])
    expect(bar.model.list.get(I.tequila)).toBe(2)
  })

  test('a list that cannot be read holds Choose and says so; Retry reads it', async ({ page, bar }) => {
    bar.model.list.set(I.tequila, 2)
    // The read and its one retry (app.tsx: retry 1) both fail.
    bar.fail(/\/shopping-list$/, { method: 'GET', status: 500, times: 2 })
    await openRoster(page)
    const button = chooseButton(page, 'Margarita')

    await expect(button).toBeDisabled()
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(page.getByRole('alert')).toContainText('The bar didn’t answer — try again.')
    await expect(button).toBeDisabled()
    await button.click({ force: true })
    expect(bar.calls('POST')).toEqual([])

    const listed = listLoaded(page)
    await page.getByRole('alert').getByRole('button', { name: 'Retry' }).click()
    await listed
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(button).toBeEnabled()

    await button.click()
    await expect(toast(page)).toHaveText('Margarita — favorited, 1 bottle queued.')
    const stores = bar.calls('POST', /\/shopping-list\/batch-store$/)
    expect(stores).toHaveLength(1)
    expect(listedIds(stores[0]?.body)).toEqual([I.cointreau])
    expect(bar.model.list.get(I.tequila)).toBe(2)
  })
})

test.describe('un-choosing (§1, ADR-008)', () => {
  test('a drink that pours is taken off without a word about bottles', async ({ page, bar }) => {
    bar.model.favorites.add(C.daiquiri)
    const listed = listLoaded(page)
    await openRoster(page)
    await listed
    const button = chooseButton(page, 'Daiquiri')
    await expect(button).toHaveAttribute('aria-pressed', 'true')

    await button.click()
    await expect(toast(page)).toHaveText('Daiquiri — removed from favorites.')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(bar.calls('POST').map((r) => r.path)).toEqual([`/cocktails/${C.daiquiri}/toggle-favorite`])
  })

  test('a drink whose missing bottles are not listed is taken off without a word about bottles', async ({
    page,
    bar,
  }) => {
    bar.model.favorites.add(C.margarita)
    const listed = listLoaded(page)
    await openRoster(page)
    await listed
    const button = chooseButton(page, 'Margarita')
    await expect(button).toHaveAttribute('aria-pressed', 'true')

    await button.click()
    await expect(toast(page)).toHaveText('Margarita — removed from favorites.')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(bar.calls('POST').map((r) => r.path)).toEqual([`/cocktails/${C.margarita}/toggle-favorite`])
    expect([...bar.model.list.keys()]).toEqual([])
  })

  test('a refused un-choose says only that it did not take', async ({ page, bar }) => {
    const toasts = await recordToasts(page)
    bar.model.favorites.add(C.margarita)
    bar.model.list.set(I.tequila, 1)
    bar.fail(TOGGLE, { method: 'POST', status: 500 })
    const listed = listLoaded(page)
    await openRoster(page)
    await listed
    const button = chooseButton(page, 'Margarita')
    await expect(button).toHaveAttribute('aria-pressed', 'true')

    await button.click()
    await expect(toast(page)).toHaveText('The favorite didn’t take.')
    await expect(button).toBeEnabled()
    await expect(button).toHaveText('✓ Chosen')
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(bar.model.favorites.has(C.margarita)).toBe(true)
    expect([...bar.model.list.entries()]).toEqual([[I.tequila, 1]])
    await toastsDone(page)
    expect(await toasts()).toEqual(['The favorite didn’t take.'])
  })
})
