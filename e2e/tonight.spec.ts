import type { Page } from '@playwright/test'
import { C, I, defaultWorld, bareWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Tonight (/tonight) against docs/spec/frontend-spec.md: the §6 journeys that
// run through it (1, stock-first; 3, shopping), the §5 rules that touch it
// (check-off ordering, directive empty states), the §2 Tonight calls, and the
// §9 surfaces that landed on it (dashboard status line, one-column order, To
// buy, ADR-008 purchasing intelligence, printable list).
//
// Only conformant behaviour is asserted. Where the code diverges from the spec
// the case is left out and tracked instead (see the PR body).

/**
 * The default bar with the Whiskey Sour's optional egg white on the shelf, so
 * the can-pour and one-bottle-away server sets do not overlap (that overlap is
 * chrispezza/barback#19 and is asserted neither way here). Pours 5: Daiquiri,
 * Gimlet, Gin Tonic, Old Fashioned, Whiskey Sour. One bottle away 6: Bobby
 * Burns, Manhattan, Martini, Mojito, Negroni, Rob Roy.
 */
function tonightWorld(change?: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  w.shelf.push(I.eggWhite)
  change?.(w)
  return w
}

test.use({ world: tonightWorld() })

const status = (page: Page) => page.locator('.bar-status')
const pour = (page: Page) => page.locator('#pour')
const near = (page: Page) => page.locator('#near')
const rail = (page: Page) => page.locator('#buy')
const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true })
/** A shopping-list row's check-off control; its name starts with the bottle.
 *  Scoped to the rows, so a search chip of the same name never stands in. */
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
const groupWith = (page: Page, title: string) =>
  rail(page).locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

test.describe('dashboard status line (§9)', () => {
  test('leads with the whole-bar counts', async ({ page }) => {
    await page.goto('/tonight')
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 0 to buy')
    await expect(heading(page, 'You can pour · 5')).toBeVisible()
    await expect(heading(page, 'One bottle away · 6')).toBeVisible()
    await expect(heading(page, 'To buy · 0')).toBeVisible()
  })

  test('each count is a link to its section, which takes focus', async ({ page }) => {
    await page.goto('/tonight')
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 0 to buy')
    for (const [hash, count] of [
      ['#near', '6'],
      ['#buy', '0'],
      ['#pour', '5'],
    ] as const) {
      const link = status(page).getByRole('link', { name: count, exact: true })
      await expect(link).toHaveAttribute('href', hash)
      await link.click()
      await expect(page).toHaveURL(new RegExp(`/tonight${hash}$`))
      await expect(page.locator(hash)).toBeFocused()
    }
  })

  test('stays whole-bar while a family narrows the sections below it', async ({ page }) => {
    await page.goto('/tonight?family=spirit-forward')
    await expect(heading(page, 'spirit-forward drinks you can pour · 1')).toBeVisible()
    await expect(heading(page, 'spirit-forward drinks one bottle away · 4')).toBeVisible()
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 0 to buy')
  })
})

test.describe('journey 1: stock-first (§6)', () => {
  test('open, can-make count, narrow by family, drink, recipe led by its ratio device', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(heading(page, 'You can pour · 5')).toBeVisible()

    const families = page.getByRole('group', { name: 'Drink family' })
    await families.getByRole('button', { name: 'SOUR', exact: true }).click()
    await expect(page).toHaveURL(/\/tonight\?family=sour$/)
    await expect(heading(page, 'sours you can pour · 3')).toBeVisible()
    for (const drink of ['Daiquiri', 'Gimlet', 'Whiskey Sour']) {
      await expect(pour(page).getByRole('link', { name: new RegExp(`^${drink}`) })).toBeVisible()
    }
    await expect(pour(page).getByRole('link', { name: /^Gin Tonic/ })).toHaveCount(0)
    // The near section has answered for the family too (it held the whole-bar
    // 6 until then), so both tag-filtered queries are on record below.
    await expect(heading(page, 'sours one bottle away · 0')).toBeVisible()

    // §2: missing_ingredients composes with tag_id; ADR-002 filter parity —
    // the family narrows both sections natively, one tag-filtered query each.
    const sourQueries = bar.calls('GET', /^\/cocktails$/).filter((c) => c.query.get('filter[tag_id]') === '101')
    expect(sourQueries.some((c) => c.query.get('filter[on_shelf]') === 'true')).toBe(true)
    expect(sourQueries.some((c) => c.query.get('filter[missing_ingredients]') === '1')).toBe(true)

    await pour(page).getByRole('link', { name: /^Daiquiri/ }).click()
    await expect(page).toHaveURL(/\/drinks\/daiquiri-1$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toBeVisible()
    const ratio = page.getByRole('group', { name: '2 RUM, ¾ LIME, ¾ SYRUP' })
    await expect(ratio).toBeVisible()
    // "Every recipe detail view leads with it": above the ingredient rows.
    const ratioBox = await ratio.boundingBox()
    const ingredientsBox = await page.locator('.recipe-ingredients').boundingBox()
    expect(ratioBox && ingredientsBox && ratioBox.y + ratioBox.height <= ingredientsBox.y).toBe(true)
  })

  test('near-miss cards name the one bottle they wait on', async ({ page }) => {
    await page.goto('/tonight')
    await expect(heading(page, 'One bottle away · 6')).toBeVisible()
    for (const [drink, bottle] of [
      ['Negroni', 'Campari'],
      ['Martini', 'Dry vermouth'],
      ['Mojito', 'Mint'],
    ] as const) {
      await expect(near(page).getByRole('link', { name: new RegExp(`^${drink}`) })).toContainText(
        `One bottle away: ${bottle}`,
      )
    }
  })
})

test.describe('family bar (§6 filter mechanics, §7)', () => {
  test('is single-select and lives in the URL', async ({ page }) => {
    await page.goto('/tonight')
    const families = page.getByRole('group', { name: 'Drink family' })
    const segment = (name: string) => families.getByRole('button', { name, exact: true })
    await expect(segment('ALL')).toHaveAttribute('aria-pressed', 'true')

    await segment('SOUR').click()
    await expect(page).toHaveURL(/\/tonight\?family=sour$/)
    await segment('HIGHBALL').click()
    await expect(page).toHaveURL(/\/tonight\?family=highball$/)
    await expect(segment('HIGHBALL')).toHaveAttribute('aria-pressed', 'true')
    await expect(segment('SOUR')).toHaveAttribute('aria-pressed', 'false')
    await expect(segment('ALL')).toHaveAttribute('aria-pressed', 'false')
    await expect(heading(page, 'highballs you can pour · 1')).toBeVisible()
    await expect(heading(page, 'highballs one bottle away · 1')).toBeVisible()

    await segment('ALL').click()
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(segment('ALL')).toHaveAttribute('aria-pressed', 'true')
    await expect(heading(page, 'You can pour · 5')).toBeVisible()
  })

  test('a family in the URL selects its segment on load', async ({ page }) => {
    await page.goto('/tonight?family=highball')
    const families = page.getByRole('group', { name: 'Drink family' })
    await expect(families.getByRole('button', { name: 'HIGHBALL', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(heading(page, 'highballs you can pour · 1')).toBeVisible()
  })
})

test.describe('journey 3: shopping (§6, §5)', () => {
  test.use({
    world: tonightWorld((w) => {
      w.list = [I.campari, I.scotch]
    }),
  })

  test('list rows say what each bottle unlocks', async ({ page }) => {
    await page.goto('/tonight')
    await expect(heading(page, 'To buy · 2')).toBeVisible()
    await expect(listItem(page, 'Campari')).toContainText('Unlocks 1')
    await expect(listItem(page, 'Scotch whisky')).toContainText('Unlocks 2')
  })

  test('check-off shelves the bottle first, then clears the list, and every count follows', async ({
    page,
    bar,
    isMobile,
  }) => {
    await page.goto('/tonight')
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 2 to buy')
    // The standing line lives in the desktop nav rail, which the phone layout
    // does not render (src/index.css: .nav-rail shows from 900px).
    if (!isMobile) await expect(page.locator('.rail-standing')).toHaveText('12 bottles · 5 pourable')

    await listItem(page, 'Campari').click()
    await expect(page.getByText('Moved to the shelf.')).toBeVisible()

    // §5: batch-store first; batch-delete from the list only after it.
    expect(bar.calls('POST').map((c) => [c.path, c.body])).toEqual([
      ['/users/1/ingredients/batch-store', { ingredients: [I.campari] }],
      ['/users/1/shopping-list/batch-delete', { ingredients: [{ id: I.campari }] }],
    ])
    expect(bar.model.shelf.has(I.campari)).toBe(true)
    expect(bar.model.list.has(I.campari)).toBe(false)

    // Journey 3: "refreshes all counts". The Negroni now pours.
    await expect(status(page)).toHaveText('You can pour 6 · 5 one bottle away · 1 to buy')
    await expect(heading(page, 'You can pour · 6')).toBeVisible()
    await expect(heading(page, 'One bottle away · 5')).toBeVisible()
    await expect(heading(page, 'To buy · 1')).toBeVisible()
    await expect(listItem(page, 'Campari')).toHaveCount(0)
    await expect(near(page).getByRole('link', { name: /^Negroni/ })).toHaveCount(0)
    // A count, not visibility: the phone pour stack is capped.
    await expect(pour(page).getByRole('link', { name: /^Negroni/ })).toHaveCount(1)
    if (!isMobile) await expect(page.locator('.rail-standing')).toHaveText('13 bottles · 6 pourable')
  })

  test('a failed shelf write leaves the bottle on the list and never deletes it', async ({ page, bar }) => {
    bar.fail(/^\/users\/1\/ingredients\/batch-store$/, { method: 'POST', status: 500 })
    await page.goto('/tonight')
    await expect(heading(page, 'To buy · 2')).toBeVisible()

    await listItem(page, 'Campari').click()
    await expect(page.getByText('That didn’t move — the bottle is still on the list.')).toBeVisible()
    // Never the reverse order: no delete without a shelf write behind it.
    expect(bar.calls('POST', /shopping-list\/batch-delete$/)).toEqual([])
    expect(bar.model.list.has(I.campari)).toBe(true)
    expect(bar.model.shelf.has(I.campari)).toBe(false)
    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 2 to buy')
  })

  test('undo puts a checked-off bottle back on the list and off the shelf', async ({ page, bar }) => {
    await page.goto('/tonight')
    await listItem(page, 'Campari').click()
    await expect(status(page)).toHaveText('You can pour 6 · 5 one bottle away · 1 to buy')

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 2 to buy')
    expect(bar.model.shelf.has(I.campari)).toBe(false)
    expect(bar.model.list.has(I.campari)).toBe(true)
  })

  test('drop takes the bottle off the list without shelving it', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(heading(page, 'To buy · 2')).toBeVisible()

    await rail(page).getByRole('button', { name: 'Remove Campari from the list' }).click()
    await expect(listItem(page, 'Campari')).toHaveCount(0)
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 1 to buy')
    expect(bar.calls('POST').map((c) => [c.path, c.body])).toEqual([
      ['/users/1/shopping-list/batch-delete', { ingredients: [{ id: I.campari }] }],
    ])
    expect(bar.model.shelf.has(I.campari)).toBe(false)
  })
})

test.describe('journey 3: counts refresh across the list (§6)', () => {
  test.use({
    world: tonightWorld((w) => {
      w.list = [I.cointreau, I.tequila]
    }),
  })

  test('checking one bottle off updates what the others unlock', async ({ page }) => {
    await page.goto('/tonight')
    // Neither opens a drink alone; the Margarita needs both.
    await expect(listItem(page, 'Cointreau')).toContainText('In 1 drink')
    await expect(listItem(page, 'Cointreau')).not.toContainText('Unlocks')

    await listItem(page, 'Tequila').click()
    await expect(listItem(page, 'Tequila')).toHaveCount(0)
    await expect(listItem(page, 'Cointreau')).toContainText('Unlocks 1')
    await expect(status(page)).toHaveText('You can pour 5 · 7 one bottle away · 1 to buy')
  })
})

test.describe('hierarchy-aware brands on the list (§9)', () => {
  test.use({
    world: tonightWorld((w) => {
      w.list = [I.londonDryGin]
    }),
  })

  test('a zero-unlock brand says what it builds toward through its parent', async ({ page }) => {
    await page.goto('/tonight')
    // London dry gin opens nothing new (Gin is shelved); its parent is in four drinks.
    await expect(listItem(page, 'London dry gin')).toContainText('In 4 drinks as Gin')
    await expect(listItem(page, 'London dry gin')).not.toContainText('Unlocks')
  })
})

test.describe('free-form add (§9, ADR-008)', () => {
  test('the list search lists any bottle, and a second tap takes it off', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 0 to buy')

    await rail(page).getByRole('searchbox', { name: 'Add to the list' }).fill('camp')
    const chip = rail(page).getByRole('button', { name: 'Campari', exact: true })
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    // ADR-004: type-ahead goes to Meilisearch with the scoped key. The fake
    // answers 403 to any other key, and the client then falls back to REST
    // filter[name] (src/api/search.ts) — so the chip came from Meilisearch
    // only if no fallback ran.
    expect(bar.requests.some((r) => r.service === 'search' && r.path === '/indexes/ingredients/search')).toBe(true)
    expect(bar.calls('GET', /^\/ingredients$/).filter((c) => c.query.has('filter[name]'))).toEqual([])

    await chip.click()
    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 1 to buy')

    await chip.click()
    await expect(listItem(page, 'Campari')).toHaveCount(0)
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(bar.calls('POST').map((c) => [c.path, c.body])).toEqual([
      ['/users/1/shopping-list/batch-store', { ingredients: [{ id: I.campari }] }],
      ['/users/1/shopping-list/batch-delete', { ingredients: [{ id: I.campari }] }],
    ])
    expect(bar.model.shelf.has(I.campari)).toBe(false)
  })

  test('a search with no match says so', async ({ page }) => {
    await page.goto('/tonight')
    await rail(page).getByRole('searchbox', { name: 'Add to the list' }).fill('zzz')
    await expect(rail(page).getByText('Nothing by that name.')).toBeVisible()
  })
})

test.describe('Buy next (§9, ADR-008)', () => {
  test('names one bottle with its reason, and lists it only on a tap', async ({ page, bar }) => {
    await page.goto('/tonight')
    const buyNext = page.locator('.buy-next')
    await expect(buyNext.getByRole('heading', { name: 'Buy next', exact: true })).toBeVisible()
    await expect(buyNext).toContainText('Scotch whisky')
    await expect(buyNext).toContainText('opens 2 drinks tonight')
    // Each group excludes what a higher group already claimed.
    await expect(groupWith(page, 'Restock next')).toBeVisible()
    await expect(groupWith(page, 'Restock next')).not.toContainText('Scotch whisky')
    // App-derived suggestions never write the list by themselves.
    expect(bar.calls('POST')).toEqual([])

    await buyNext.getByRole('button', { name: 'List it' }).click()
    await expect(page.getByText('Scotch whisky — listed.')).toBeVisible()
    expect(bar.calls('POST').map((c) => [c.path, c.body])).toEqual([
      ['/users/1/shopping-list/batch-store', { ingredients: [{ id: I.scotch }] }],
    ])
    await expect(listItem(page, 'Scotch whisky')).toContainText('Unlocks 2')
    await expect(buyNext).not.toContainText('Scotch whisky')
  })

  test('Restock next lists a bottle only on a tap, with a receipt', async ({ page, bar }) => {
    await page.goto('/tonight')
    // Dark rum is in Restock next under either recommend endpoint (chrispezza/barback#22).
    const restock = groupWith(page, 'Restock next')
    const darkRum = restock.locator('.restock-row').filter({ hasText: 'Dark rum' })
    await expect(darkRum).toBeVisible()
    expect(bar.calls('POST')).toEqual([])

    await darkRum.getByRole('button', { name: 'List it' }).click()
    await expect(page.getByText('Dark rum — listed.')).toBeVisible()
    expect(bar.calls('POST').map((c) => [c.path, c.body])).toEqual([
      ['/users/1/shopping-list/batch-store', { ingredients: [{ id: I.darkRum }] }],
    ])
    await expect(listItem(page, 'Dark rum')).toBeVisible()
    // Listed, it leaves the group (here its only row, so the group goes too).
    await expect(darkRum).toHaveCount(0)
    expect(bar.model.shelf.has(I.darkRum)).toBe(false)
  })

  test.describe('with a favorited drink one bottle away', () => {
    test.use({
      world: tonightWorld((w) => {
        w.favorites = [C.negroni]
      }),
    })

    test('its bottle displaces the server pick', async ({ page }) => {
      await page.goto('/tonight')
      const buyNext = page.locator('.buy-next')
      await expect(buyNext).toContainText('Campari')
      await expect(buyNext).toContainText('completes 1 favorite')
      await expect(groupWith(page, 'Restock next')).toContainText('Scotch whisky')
    })
  })

  test.describe('with several favorites waiting on bottles', () => {
    test.use({
      world: tonightWorld((w) => {
        w.favorites = [C.negroni, C.robRoy, C.bobbyBurns]
      }),
    })

    test('the bottle completing the most favorites leads, and nothing appears twice', async ({ page }) => {
      await page.goto('/tonight')
      const buyNext = page.locator('.buy-next')
      await expect(buyNext).toContainText('Scotch whisky')
      await expect(buyNext).toContainText('completes 2 favorites')
      const forFavorites = groupWith(page, 'For your favorites')
      await expect(forFavorites).toContainText('Campari')
      await expect(forFavorites).not.toContainText('Scotch whisky')
      const restock = groupWith(page, 'Restock next')
      await expect(restock).toBeVisible()
      await expect(restock).not.toContainText('Scotch whisky')
      await expect(restock).not.toContainText('Campari')
    })

    test('For your favorites lists a bottle only on a tap, with a receipt', async ({ page, bar }) => {
      await page.goto('/tonight')
      const forFavorites = groupWith(page, 'For your favorites')
      const campari = forFavorites.locator('.restock-row').filter({ hasText: 'Campari' })
      await expect(campari).toBeVisible()
      expect(bar.calls('POST')).toEqual([])

      await campari.getByRole('button', { name: 'List it' }).click()
      await expect(page.getByText('Campari — listed.')).toBeVisible()
      expect(bar.calls('POST').map((c) => [c.path, c.body])).toEqual([
        ['/users/1/shopping-list/batch-store', { ingredients: [{ id: I.campari }] }],
      ])
      await expect(listItem(page, 'Campari')).toBeVisible()
      expect(bar.model.shelf.has(I.campari)).toBe(false)
    })
  })
})

test.describe('standing orders (§9, ADR-008)', () => {
  test.use({
    world: tonightWorld((w) => {
      w.shelf = w.shelf.filter((id) => id !== I.tonic)
    }),
  })

  test('an out-of-stock staple queues itself once, with a toast and a Staple note', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(page.getByText('Staples out — queued: Tonic.')).toBeVisible()
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    const stapleWrites = () =>
      bar
        .calls('POST', /shopping-list\/batch-store$/)
        .filter((c) => JSON.stringify(c.body) === JSON.stringify({ ingredients: [{ id: I.tonic }] }))
    expect(stapleWrites()).toHaveLength(1)

    // Dropped, it stays dropped for the visit: later list refreshes do not re-queue it.
    await rail(page).getByRole('button', { name: 'Remove Tonic from the list' }).click()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    await rail(page).getByRole('searchbox', { name: 'Add to the list' }).fill('camp')
    await rail(page).getByRole('button', { name: 'Campari', exact: true }).click()
    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(listItem(page, 'Tonic')).toHaveCount(0)
    expect(stapleWrites()).toHaveLength(1)
  })
})

test.describe('printable list (§9)', () => {
  test.use({
    world: tonightWorld((w) => {
      w.list = [I.campari]
    }),
  })

  test('the print button prints, and print media keeps only the list', async ({ page, isMobile }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __prints: number }
      w.__prints = 0
      window.print = () => {
        w.__prints += 1
      }
    })
    await page.goto('/tonight')
    await rail(page).getByRole('button', { name: 'Print the list' }).click()
    expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1)

    // Everything around the list. Both navs are named "Main", so each is
    // located by its class: the rail renders from 900px, the tab bar below it.
    const screenOnly = [
      page.locator(isMobile ? '.tab-bar' : '.nav-rail'),
      status(page),
      page.getByRole('group', { name: 'Drink family' }),
      pour(page),
      near(page),
      page.locator('.buy-next'),
      // In the printed rail; Restock next renders under either recommend endpoint (#22).
      groupWith(page, 'Restock next'),
      rail(page).getByRole('searchbox', { name: 'Add to the list' }),
      rail(page).getByRole('button', { name: 'Remove Campari from the list' }),
      rail(page).getByRole('button', { name: 'Print the list' }),
    ]
    // On screen first, so no locator below passes for matching nothing.
    for (const shown of screenOnly) await expect(shown).toBeVisible()

    await page.emulateMedia({ media: 'print' })
    await expect(listItem(page, 'Campari')).toBeVisible()
    for (const hidden of [...screenOnly, page.locator('.nav-rail'), page.locator('.tab-bar')]) {
      await expect(hidden).toBeHidden()
    }
  })
})

test.describe('one-column order (§9)', () => {
  test('on a phone the buy list sits above the near-miss stack', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the one-column grid order applies below 900px')
    await page.goto('/tonight')
    await expect(heading(page, 'To buy · 0')).toBeVisible()
    const [p, b, n] = await Promise.all([pour(page), rail(page), near(page)].map((l) => l.boundingBox()))
    expect(p && b && n && p.y < b.y && b.y < n.y).toBe(true)
  })

  test('on a desktop the buy list is a rail beside both sections', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the two-column grid applies from 900px')
    await page.goto('/tonight')
    await expect(heading(page, 'To buy · 0')).toBeVisible()
    const [p, b, n] = await Promise.all([pour(page), rail(page), near(page)].map((l) => l.boundingBox()))
    expect(p && b && n && b.x >= p.x + p.width && n.y > p.y && n.x === p.x).toBe(true)
  })
})

test.describe('directive empty states (§5)', () => {
  test.describe('with a bare shelf', () => {
    test.use({ world: bareWorld() })

    test('says what to add, from the recommendations', async ({ page }) => {
      await page.goto('/tonight')
      await expect(page.getByRole('heading', { name: 'The shelf is bare', exact: true })).toBeVisible()
      // Staples own their group, so the first non-staple recommendations lead.
      await expect(pour(page)).toContainText('Start with Gin, Sweet vermouth, White rum — ranked by how many recipes call for them.')
      await pour(page).getByRole('button', { name: 'Stock the shelf' }).click()
      await expect(page).toHaveURL(/\/shelf$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Shelf' })).toBeVisible()
    })
  })

  test.describe('with nothing pouring but bottles one away', () => {
    // The staples alone: nothing pours, several drinks wait on one spirit.
    test.use({
      world: tonightWorld((w) => {
        w.shelf = [I.clubSoda, I.tonic, I.simpleSyrup, I.limeJuice, I.lemonJuice, I.angostura]
      }),
    })

    test('points at the near misses', async ({ page }) => {
      await page.goto('/tonight')
      await expect(heading(page, 'You can pour · 0')).toBeVisible()
      await expect(pour(page)).toContainText('Nothing pours yet — the bottles below are one purchase away.')
      await expect(page.getByRole('heading', { name: 'The shelf is bare' })).toHaveCount(0)
    })
  })
})
