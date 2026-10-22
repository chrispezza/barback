import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// To buy is ranked by what each bottle unlocks (frontend-spec §6 Journey 3,
// "Shopping (leverage-first): items ranked by unlock count"; §2 Tonight,
// "unlocks 4" per item from GET /ingredients/{id}/extra). Upstream serves the
// list by ingredient name (ShoppingListController::index, `sortBy(
// 'ingredient.name')`, app/Http/Controllers/ShoppingListController.php:38 in
// the reference clone at v5.15.3), and the fake does the same, so the ranking
// is Tonight's: the bottle that opens the most drinks first, ties by name, a
// bottle that opens nothing last.
//
// A row's count is its own read. Until every row's count has answered, the
// rows wait in name order and then settle once, so the list never reshuffles
// as each answer lands; a bottle listed onto a ranked list waits below the
// ranked rows until its count answers, then takes its place. A count that
// cannot be read leaves the rows as they stand: the list states no rank it
// cannot back.

/**
 * The default bar with the Whiskey Sour's optional egg white on the shelf, so
 * the can-pour and one-bottle-away sets do not overlap (as e2e/tonight.spec.ts).
 */
function tonightWorld(change?: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  w.shelf.push(I.eggWhite)
  change?.(w)
  return w
}

// Against that shelf: Scotch whisky opens the Rob Roy and the Bobby Burns;
// Campari the Negroni; Dry vermouth the Martini; Mint the Mojito; Cointreau and
// Tequila open nothing alone (the Margarita needs both), so their rows say what
// they are in instead. A row that opens drinks names their families after the
// count (frontend-spec §6 Journey 3; e2e/b-unlocks-family.spec.ts), after a
// hair space that parts the two for assistive tech: the Bobby Burns carries
// no family tag, so it is counted and not named.
const LISTED = [I.campari, I.cointreau, I.dryVermouth, I.mint, I.scotch, I.tequila]
const BY_NAME = ['Campari', 'Cointreau', 'Dry vermouth', 'Mint', 'Scotch whisky', 'Tequila']
const RANKED = ['Scotch whisky', 'Campari', 'Dry vermouth', 'Mint', 'Cointreau', 'Tequila']
const RANKED_LINES = [
  'Unlocks 2·\u200A1 spirit-forward drink',
  'Unlocks 1·\u200A1 spirit-forward drink',
  'Unlocks 1·\u200A1 spirit-forward drink',
  'Unlocks 1·\u200A1 highball',
  'In 1 drink',
  'In 1 drink',
]

const rail = (page: Page) => page.locator('#buy')
const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true })
/** Every To buy row's bottle, top to bottom. */
const rowNames = (page: Page) => rail(page).locator('.shopping-row-line .bb-shop__name')
/** A To buy row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
/** A To buy row's detail line ("Unlocks 1·\u200A1 highball", "In 1 drink"; the hair space is ShoppingRow's). */
const rowLine = (page: Page, name: string) => listItem(page, name).locator('.bb-shop__meta')

/**
 * Record every order the To buy rows pass through from the first paint, so an
 * order shown for a moment is caught as surely as one that lasts (as
 * e2e/b-tonight-before-read.spec.ts records the rail).
 */
async function recordOrders(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __orders: string[][] }
    w.__orders = []
    let last = ''
    new MutationObserver(() => {
      const names = [...document.querySelectorAll('#buy .shopping-row-line .bb-shop__name')].map(
        (n) => n.textContent ?? '',
      )
      const key = JSON.stringify(names)
      if (names.length === 0 || key === last) return
      last = key
      w.__orders.push(names)
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
}

const orders = (page: Page) => page.evaluate(() => (window as unknown as { __orders: string[][] }).__orders)

/** One bottle's count, held. */
interface Held {
  /** The client has asked for the count. */
  asked: () => boolean
  /** Let the fake answer it. */
  release: () => void
}

/**
 * Hold GET /ingredients/{id}/extra for one bottle from now on; the fake
 * answers, and records, it only once released. Playwright asks the route
 * registered last first, so this one is asked before the fake's.
 */
async function holdUnlocks(page: Page, id: number): Promise<Held> {
  let release = () => {}
  let asked = false
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    (url) => url.pathname === `/bar/api/ingredients/${id}/extra`,
    async (route) => {
      asked = true
      await held
      await route.fallback()
    },
  )
  return { asked: () => asked, release }
}

test.describe('To buy on Tonight', () => {
  test.use({ world: tonightWorld((w) => (w.list = [...LISTED])) })

  test('ranks the rows by what each bottle unlocks, ties by name, nothing-unlocked last', async ({ page }) => {
    await page.goto('/tonight')
    await expect(heading(page, 'To buy · 6')).toBeVisible()
    await expect(rowNames(page)).toHaveText(RANKED)
    // The order is the counts the rows state, and nothing else.
    await expect(rail(page).locator('.shopping-row-line .bb-shop__meta')).toHaveText(RANKED_LINES)
  })

  test('waits in name order until every count has answered, then settles once', async ({ page }) => {
    await recordOrders(page)
    const holds = new Map<number, Held>()
    for (const id of LISTED) holds.set(id, await holdUnlocks(page, id))
    await page.goto('/tonight')

    await expect(heading(page, 'To buy · 6')).toBeVisible()
    // Every row's count is asked for, and none has answered.
    await expect.poll(() => LISTED.every((id) => holds.get(id)?.asked())).toBe(true)
    await expect(rowNames(page)).toHaveText(BY_NAME)
    await expect(rail(page).locator('.shopping-row-line .bb-shop__meta')).toHaveCount(0)

    // Each answer but the last shows its count and moves nothing, the bottle
    // that will lead included.
    const answers: [id: number, name: string, line: string][] = [
      [I.scotch, 'Scotch whisky', 'Unlocks 2·\u200A1 spirit-forward drink'],
      [I.mint, 'Mint', 'Unlocks 1·\u200A1 highball'],
      [I.campari, 'Campari', 'Unlocks 1·\u200A1 spirit-forward drink'],
      [I.cointreau, 'Cointreau', 'In 1 drink'],
      [I.dryVermouth, 'Dry vermouth', 'Unlocks 1·\u200A1 spirit-forward drink'],
    ]
    for (const [id, name, line] of answers) {
      holds.get(id)?.release()
      await expect(rowLine(page, name)).toHaveText(line)
      expect(await rowNames(page).allTextContents(), `after ${name} answered`).toEqual(BY_NAME)
    }

    holds.get(I.tequila)?.release()
    await expect(rowNames(page)).toHaveText(RANKED)
    await expect(rail(page).locator('.shopping-row-line .bb-shop__meta')).toHaveText(RANKED_LINES)
    expect(await orders(page)).toEqual([BY_NAME, RANKED])
  })

  test('a bottle listed from a near miss waits below the ranked rows, then takes its place', async ({ page, bar }) => {
    await recordOrders(page)
    // Rye whiskey opens the Manhattan; its count is held from the start, so
    // whichever read asks for it first waits.
    const rye = await holdUnlocks(page, I.rye)
    await page.goto('/tonight')
    await expect(rowNames(page)).toHaveText(RANKED)

    const manhattan = page
      .locator('#near')
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: /^Manhattan/ }) })
    await manhattan.getByRole('button', { name: 'Add Rye whiskey to the list', exact: true }).click()
    await expect(page.getByText('Rye whiskey — listed.')).toBeVisible()
    await expect(heading(page, 'To buy · 7')).toBeVisible()
    expect(bar.model.list.has(I.rye)).toBe(true)

    // The ranked rows hold their places; the new one waits below them.
    await expect(rowNames(page)).toHaveText([...RANKED, 'Rye whiskey'])
    await expect(rowLine(page, 'Rye whiskey')).toHaveCount(0)

    rye.release()
    const ranked = ['Scotch whisky', 'Campari', 'Dry vermouth', 'Mint', 'Rye whiskey', 'Cointreau', 'Tequila']
    await expect(rowNames(page)).toHaveText(ranked)
    await expect(rowLine(page, 'Rye whiskey')).toHaveText('Unlocks 1·\u200A1 spirit-forward drink')
    expect(await orders(page)).toEqual([BY_NAME, RANKED, [...RANKED, 'Rye whiskey'], ranked])
  })

  test('a count that cannot be read leaves the rows in name order', async ({ page, bar }) => {
    // Every attempt the client makes at Scotch whisky's count fails (retry: 1).
    const scotchCount = new RegExp(`^/ingredients/${I.scotch}/extra$`)
    bar.fail(scotchCount, { method: 'GET', status: 500, times: 2 })
    await page.goto('/tonight')

    await expect(rowLine(page, 'Campari')).toHaveText('Unlocks 1·\u200A1 spirit-forward drink')
    await expect(rowLine(page, 'Tequila')).toHaveText('In 1 drink')
    await expect.poll(() => bar.calls('GET', scotchCount).length, { timeout: 10_000 }).toBe(2)
    await expect(rowLine(page, 'Scotch whisky')).toHaveCount(0)
    await expect(rowNames(page)).toHaveText(BY_NAME)
    // No third attempt answered behind the assertion.
    expect(bar.calls('GET', scotchCount)).toHaveLength(2)
  })
})

test.describe('To buy after a check-off', () => {
  // Campari opens the Negroni and Mint the Mojito; Coffee liqueur, Cointreau
  // and Tequila open nothing alone. Once Tequila is on the shelf, Cointreau
  // opens the Margarita and rises above Coffee liqueur, which comes before it
  // by name and still opens nothing, so the order after is neither the order
  // before nor name order: only the refreshed counts give it.
  test.use({
    world: tonightWorld((w) => (w.list = [I.campari, I.coffeeLiqueur, I.cointreau, I.mint, I.tequila])),
  })

  test('re-ranks the rows on the counts the check-off refreshes', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(rowNames(page)).toHaveText(['Campari', 'Mint', 'Coffee liqueur', 'Cointreau', 'Tequila'])

    await listItem(page, 'Tequila').click()
    await expect(page.getByText('Moved to the shelf.')).toBeVisible()
    expect(bar.model.shelf.has(I.tequila)).toBe(true)

    await expect(rowNames(page)).toHaveText(['Campari', 'Cointreau', 'Mint', 'Coffee liqueur'])
    // The Negroni is spirit-forward, the Margarita a sour, the Mojito a highball.
    await expect(rail(page).locator('.shopping-row-line .bb-shop__meta')).toHaveText([
      'Unlocks 1·\u200A1 spirit-forward drink',
      'Unlocks 1·\u200A1 sour',
      'Unlocks 1·\u200A1 highball',
      'In 1 drink',
    ])
  })
})

test.describe('To buy while a check-off’s counts are read again', () => {
  // Gin off the shelf: it opens the Gimlet and the Gin Tonic; Mint the Mojito;
  // Campari and Dry vermouth nothing, since the Negroni and the Martini want
  // gin. Once Gin is shelved, Campari, Dry vermouth and Mint open one drink
  // each.
  test.use({
    world: tonightWorld((w) => {
      w.shelf = w.shelf.filter((id) => id !== I.gin)
      w.list = [I.campari, I.dryVermouth, I.gin, I.mint]
    }),
  })

  test('holds the order, less the bottle checked off, until every count has answered, then settles once', async ({
    page,
    bar,
  }) => {
    await recordOrders(page)
    await page.goto('/tonight')
    await expect(rowNames(page)).toHaveText(['Gin', 'Mint', 'Campari', 'Dry vermouth'])
    // The Gimlet is a sour, the Gin Tonic a highball.
    await expect(rowLine(page, 'Gin')).toHaveText('Unlocks 2·\u200A1 sour · 1 highball')

    // Dry vermouth's count, asked for again by the check-off, waits; its first
    // read has answered, so only the refresh is held.
    const dryVermouth = await holdUnlocks(page, I.dryVermouth)
    const answered = (id: number) =>
      page.waitForResponse((r) => new URL(r.url()).pathname === `/bar/api/ingredients/${id}/extra`)
    const campariAgain = answered(I.campari)
    const mintAgain = answered(I.mint)
    await listItem(page, 'Gin').click()
    await expect(page.getByText('Moved to the shelf.')).toBeVisible()
    expect(bar.model.shelf.has(I.gin)).toBe(true)
    await expect(heading(page, 'To buy · 3')).toBeVisible()
    await expect.poll(() => dryVermouth.asked()).toBe(true)

    // Every other count has answered again, and the rows state the new ones;
    // the order is still the one the rows held, Gin gone.
    await campariAgain
    await mintAgain
    await expect(rowLine(page, 'Campari')).toHaveText('Unlocks 1·\u200A1 spirit-forward drink')
    await expect(rowLine(page, 'Mint')).toHaveText('Unlocks 1·\u200A1 highball')
    await expect(rowNames(page)).toHaveText(['Mint', 'Campari', 'Dry vermouth'])

    dryVermouth.release()
    await expect(rowLine(page, 'Dry vermouth')).toHaveText('Unlocks 1·\u200A1 spirit-forward drink')
    await expect(rowNames(page)).toHaveText(['Campari', 'Dry vermouth', 'Mint'])
    // From one tap, one change of order beyond the bottle leaving.
    expect(await orders(page)).toEqual([
      ['Campari', 'Dry vermouth', 'Gin', 'Mint'],
      ['Gin', 'Mint', 'Campari', 'Dry vermouth'],
      ['Mint', 'Campari', 'Dry vermouth'],
      ['Campari', 'Dry vermouth', 'Mint'],
    ])
  })
})
