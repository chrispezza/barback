import type { Locator, Page } from '@playwright/test'
import { C, I, type CocktailSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Recipe (/drinks/:slug) against docs/spec/frontend-spec.md §1, §2, §5–§7 and
// §9, driven through the fake Bar Assistant (ADR-011). Only conformant
// behaviour is asserted here: where the screen diverges from the spec the case
// is left out and tracked as an issue instead, never encoded as correct.
//
// Default world (test/fixtures/world.ts): Daiquiri, Gimlet and Old Fashioned
// pour; Penicillin calls Islay Scotch while the shelf holds Laphroaig 10, and
// lacks honey syrup; Espresso Martini lacks all three of its bottles.

const main = (page: Page) => page.getByRole('main')
const ingredientList = (page: Page) => main(page).locator('ul.recipe-ingredients')
const line = (page: Page, name: string) =>
  ingredientList(page).getByRole('listitem').filter({ hasText: name })
const lineName = (row: Locator) => row.locator('.bb-row__name')
const addToList = (page: Page, name: string) =>
  page.getByRole('button', { name: `Add ${name} to the list`, exact: true })
const addMissing = (page: Page) => page.getByRole('button', { name: 'Add missing to the list' })
const favorite = (page: Page) => main(page).getByRole('button', { name: /favorite/i })
/** The ratio device by its whole accessible name. A bare `name` string is a
 *  case-insensitive substring match, which would let a third part (a dash)
 *  ride along unseen, so the name is matched exactly. */
const ratioDevice = (page: Page, name: string) => main(page).getByRole('group', { name, exact: true })
const back = (page: Page) => page.getByRole('button', { name: '← Back' })
const similarHeading = (page: Page) => page.getByRole('heading', { level: 2, name: 'In the same vein' })
const similarSection = (page: Page) => main(page).locator('section', { has: similarHeading(page) })
// The recipe's own gap line — similar-drink cards print one of their own.
const missingLine = (page: Page) => main(page).locator('p.missing-line')

async function openRecipe(page: Page, slug: string, name: string): Promise<void> {
  await page.goto(`/drinks/${slug}`)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

type ShowEntry = { ingredient: { id: number } } & Record<string, unknown>
type ShowBody = { data: { ingredients: ShowEntry[] } }

/** The show response's line for one ingredient, found by id rather than position. */
function entryFor(body: ShowBody, ingredientId: number): ShowEntry {
  const entry = body.data.ingredients.find((e) => e.ingredient.id === ingredientId)
  if (!entry) throw new Error(`the show response has no line for ingredient ${ingredientId}`)
  return entry
}

async function top(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('element has no layout box')
  return box.y
}

// tokens/colors.css: --cream-100 (neutral content), --sage-600 ("you don't have
// it"), --cream-400 (an optional line).
const CREAM_100 = 'rgb(241, 232, 214)'
const SAGE_600 = 'rgb(156, 175, 164)'
const CREAM_400 = 'rgb(185, 174, 151)'

/** Absence is sage and struck through; presence is cream and is not (Visual
 *  foundations: "absence pairs sage with a strikethrough"; state is never
 *  colour alone, so both are checked). */
async function expectStocked(row: Locator): Promise<void> {
  await expect(lineName(row)).toHaveCSS('color', CREAM_100)
  await expect(lineName(row)).toHaveCSS('text-decoration-line', 'none')
}

async function expectGap(row: Locator): Promise<void> {
  await expect(lineName(row)).toHaveCSS('color', SAGE_600)
  await expect(lineName(row)).toHaveCSS('text-decoration-line', 'line-through')
}

/** Focused, with the whole ring: Visual foundations "2px solid brass, 2px offset" (--focus-ring). */
async function expectRing(control: Locator): Promise<void> {
  await expect(control).toBeFocused()
  await expect(control).toHaveCSS('outline-style', 'solid')
  await expect(control).toHaveCSS('outline-width', '2px')
  await expect(control).toHaveCSS('outline-color', 'rgb(198, 161, 91)')
  await expect(control).toHaveCSS('outline-offset', '2px')
}

test.describe('the ratio device leads the recipe (§1, §3, §7)', () => {
  test('a curated template leads: Daiquiri reads 2 : ¾ : ¾ RUM · LIME · SYRUP', async ({ page, bar }) => {
    await openRecipe(page, 'daiquiri-1', 'Daiquiri')
    await expect(page).toHaveTitle('Daiquiri · Barback')

    const device = ratioDevice(page, '2 RUM, ¾ LIME, ¾ SYRUP')
    await expect(device).toBeVisible()
    await expect(device.locator('.bb-ratio__num')).toHaveText(['2', '¾', '¾'])
    await expect(device.locator('.bb-ratio__label')).toHaveText(['RUM', 'LIME', 'SYRUP'])

    // Leads: below the drink's name, above the measures and the method.
    const method = main(page).getByText('Shake with ice and fine-strain into a chilled coupe.')
    expect(await top(device)).toBeGreaterThan(await top(page.getByRole('heading', { level: 1 })))
    expect(await top(device)).toBeLessThan(await top(ingredientList(page)))
    expect(await top(device)).toBeLessThan(await top(method))

    // Measures in ounces as fraction glyphs, never decimals (content fundamentals).
    await expect(line(page, 'White rum')).toContainText('2 oz')
    await expect(line(page, 'Lime juice')).toContainText('¾ oz')
    await expect(line(page, 'Simple syrup')).toContainText('¾ oz')
    await expect(main(page).getByText('Garnish: Lime wheel')).toBeVisible()

    // §2: the recipe is the show endpoint, addressed by the slug in the URL.
    expect(bar.calls('GET', /^\/cocktails\/daiquiri-1$/).length).toBeGreaterThan(0)
  })

  test('a curated template keeps dashes as authored: Old Fashioned', async ({ page }) => {
    await openRecipe(page, 'old-fashioned-1', 'Old Fashioned')
    await expect(ratioDevice(page, '2 WHISKEY, ¼ SYRUP, 2 d BITTERS')).toBeVisible()
    await expect(line(page, 'Bourbon whiskey')).toContainText('2 oz')
    await expect(line(page, 'Simple syrup')).toContainText('¼ oz')
    // A dash is not unit-converted (2 dash, not 0.02 oz).
    await expect(line(page, 'Angostura aromatic bitters')).toContainText('2 dash')
  })

  test('an uncurated drink leads with the skeleton read off its recipe', async ({ page }) => {
    await openRecipe(page, 'penicillin-1', 'Penicillin')
    const device = ratioDevice(page, '2 Islay Scotch, ¾ Lemon juice, ¾ Honey syrup')
    await expect(device).toBeVisible()
    await expect(device.locator('.bb-ratio__num')).toHaveText(['2', '¾', '¾'])
    // Ingredient-named labels still speak in the caps utility voice.
    await expect(device.locator('.bb-ratio__label').first()).toHaveCSS('text-transform', 'uppercase')
    expect(await top(device)).toBeLessThan(await top(ingredientList(page)))

    // Dashes are seasoning, not structure: Rob Roy's skeleton is its two measured parts.
    await openRecipe(page, 'rob-roy-1', 'Rob Roy')
    const robRoy = ratioDevice(page, '2 Scotch whisky, 1 Sweet vermouth')
    await expect(robRoy).toBeVisible()
    await expect(robRoy.locator('.bb-ratio__num')).toHaveText(['2', '1'])
    await expect(robRoy.locator('.bb-ratio__label')).toHaveText(['Scotch whisky', 'Sweet vermouth'])
  })

  test('a drink with fewer than two measured parts renders whole, without a device', async ({ page, bar }) => {
    const dram: CocktailSeed = {
      id: 94,
      name: 'Islay Dram',
      lines: [{ ingredientId: I.islayScotch, amount: 45, units: 'ml' }],
      instructions: 'Pour neat; a drop of water opens it.',
    }
    const bittersAndSoda: CocktailSeed = {
      id: 95,
      name: 'Bitters and Soda',
      lines: [
        { ingredientId: I.angostura, amount: 4, units: 'dash' },
        { ingredientId: I.clubSoda, amount: 120, units: 'ml' },
      ],
      instructions: 'Build over ice and stir once.',
    }
    bar.model.world.cocktails.push(dram, bittersAndSoda)

    await openRecipe(page, 'islay-dram-1', 'Islay Dram')
    await expect(main(page).getByRole('group')).toHaveCount(0)
    await expect(line(page, 'Islay Scotch')).toContainText('1½ oz')
    await expect(main(page).getByText('Pour neat; a drop of water opens it.')).toBeVisible()

    await openRecipe(page, 'bitters-and-soda-1', 'Bitters and Soda')
    await expect(main(page).getByRole('group')).toHaveCount(0)
    await expect(line(page, 'Angostura aromatic bitters')).toContainText('4 dash')
    await expect(line(page, 'Club soda')).toContainText('4 oz')
    await expect(main(page).getByText('Build over ice and stir once.')).toBeVisible()
  })
})

test.describe('stock colouring from the show endpoint (§2, §9)', () => {
  test("Penicillin's Islay Scotch line reads stocked through Laphroaig 10 on the shelf", async ({ page }) => {
    const shown = page.waitForResponse((r) => r.url().endsWith('/bar/api/cocktails/penicillin-1'))
    await openRecipe(page, 'penicillin-1', 'Penicillin')
    // The exact flag is false; the variant flag carries it (isStocked ORs the four).
    const body = (await (await shown).json()) as ShowBody
    expect(entryFor(body, I.islayScotch)).toMatchObject({ in_shelf: false, in_shelf_as_variant: true })

    await expectStocked(line(page, 'Islay Scotch'))
    await expectStocked(line(page, 'Lemon juice'))
    await expectGap(line(page, 'Honey syrup'))
    await expect(addToList(page, 'Islay Scotch')).toHaveCount(0)
    await expect(addToList(page, 'Lemon juice')).toHaveCount(0)
    await expect(addToList(page, 'Honey syrup')).toBeVisible()

    await expect(missingLine(page)).toHaveText('One bottle away: Honey syrup')
    await expect(missingLine(page).locator('em')).toHaveText('Honey syrup')
    await expect(addMissing(page)).toBeVisible()
  })

  test('a substitute on the shelf stocks the line it stands in for', async ({ page, bar }) => {
    // Mojito takes tonic for club soda; the shelf keeps the tonic only.
    bar.model.shelf.delete(I.clubSoda)
    const shown = page.waitForResponse((r) => r.url().endsWith('/bar/api/cocktails/mojito-1'))
    await openRecipe(page, 'mojito-1', 'Mojito')
    const body = (await (await shown).json()) as ShowBody
    expect(entryFor(body, I.clubSoda)).toMatchObject({ in_shelf: false, in_shelf_as_substitute: true })

    await expectStocked(line(page, 'Club soda'))
    await expect(addToList(page, 'Club soda')).toHaveCount(0)
    await expectGap(line(page, 'Mint'))
    await expect(line(page, 'Mint')).toContainText('6 leaves')
    await expect(missingLine(page)).toHaveText('One bottle away: Mint')
  })

  test('an optional line is never a gap', async ({ page }) => {
    // Whiskey Sour pours; its egg white is optional and not on the shelf.
    await openRecipe(page, 'whiskey-sour-1', 'Whiskey Sour')
    const egg = line(page, 'Egg white')
    await expect(egg).toContainText('optional')
    // An optional line reads cream-400 with the word, never sage or struck through.
    await expect(lineName(egg)).toHaveCSS('color', CREAM_400)
    await expect(lineName(egg)).toHaveCSS('text-decoration-line', 'none')
    await expect(addToList(page, 'Egg white')).toHaveCount(0)
    await expect(missingLine(page)).toHaveCount(0)
    await expect(addMissing(page)).toHaveCount(0)
    await expect(main(page).getByText('Already on the list.')).toHaveCount(0)
  })
})

test.describe('the gap goes to the list (§6 journey 3, §9)', () => {
  test('+ List queues one bottle and the line reads Listed', async ({ page, bar }) => {
    await openRecipe(page, 'penicillin-1', 'Penicillin')
    await addToList(page, 'Honey syrup').click()

    const honey = line(page, 'Honey syrup')
    await expect(honey.getByText('Listed', { exact: true })).toBeVisible()
    await expect(addToList(page, 'Honey syrup')).toHaveCount(0)
    await expect(addMissing(page)).toHaveCount(0)
    await expect(main(page).getByText('Already on the list.')).toBeVisible()
    // Listed is not stocked: the bottle is still the gap until it is shelved.
    await expect(missingLine(page)).toHaveText('One bottle away: Honey syrup')
    await expectGap(honey)

    const writes = bar.calls('POST', /^\/users\/1\/shopping-list\/batch-store$/)
    expect(writes.map((w) => w.body)).toEqual([{ ingredients: [{ id: I.honeySyrup }] }])
    expect(bar.model.list.has(I.honeySyrup)).toBe(true)
  })

  test('Missing N names every gap; Add missing lists only what is not listed yet', async ({ page, bar }) => {
    await openRecipe(page, 'espresso-martini-1', 'Espresso Martini')
    const device = ratioDevice(page, '1⅔ Vodka, ⅔ Coffee liqueur, 1 Espresso')
    await expect(device).toBeVisible()
    await expect(device.locator('.bb-ratio__num')).toHaveText(['1⅔', '⅔', '1'])
    await expect(missingLine(page)).toHaveText('Missing 3: Vodka, Coffee liqueur, Espresso')

    await addToList(page, 'Vodka').click()
    await expect(line(page, 'Vodka').getByText('Listed', { exact: true })).toBeVisible()
    await expect(main(page).getByText('Already on the list.')).toHaveCount(0)

    await addMissing(page).click()
    for (const name of ['Vodka', 'Coffee liqueur', 'Espresso']) {
      await expect(line(page, name).getByText('Listed', { exact: true })).toBeVisible()
    }
    await expect(addMissing(page)).toHaveCount(0)
    await expect(main(page).getByText('Already on the list.')).toBeVisible()

    const writes = bar.calls('POST', /^\/users\/1\/shopping-list\/batch-store$/)
    expect(writes.map((w) => w.body)).toEqual([
      { ingredients: [{ id: I.vodka }] },
      { ingredients: [{ id: I.coffeeLiqueur }, { id: I.espresso }] },
    ])
  })

  test('a bottle already on the list reads Listed on arrival', async ({ page, bar }) => {
    bar.model.list.set(I.honeySyrup, 1)
    await openRecipe(page, 'penicillin-1', 'Penicillin')
    await expect(line(page, 'Honey syrup').getByText('Listed', { exact: true })).toBeVisible()
    await expect(addToList(page, 'Honey syrup')).toHaveCount(0)
    await expect(addMissing(page)).toHaveCount(0)
    await expect(main(page).getByText('Already on the list.')).toBeVisible()
    expect(bar.calls('POST', /shopping-list/)).toEqual([])
  })

  test('a list write that fails says so and leaves the line as it was', async ({ page, bar }) => {
    await openRecipe(page, 'penicillin-1', 'Penicillin')
    bar.fail(/^\/users\/1\/shopping-list\/batch-store$/, { method: 'POST', status: 500 })
    await addToList(page, 'Honey syrup').click()

    await expect(page.getByRole('status')).toHaveText('The list didn’t take that change.')
    await expect(addToList(page, 'Honey syrup')).toBeEnabled()
    await expect(line(page, 'Honey syrup').getByText('Listed', { exact: true })).toHaveCount(0)
    await expect(addMissing(page)).toBeVisible()
    expect(bar.model.list.size).toBe(0)
  })
})

test.describe('favourite (§2, §5, §9)', () => {
  test('the favourite flips before the server answers, and the server agrees', async ({ page, bar }) => {
    await openRecipe(page, 'daiquiri-1', 'Daiquiri')
    await expect(favorite(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(favorite(page)).toHaveText('Favorite')

    bar.slowDown(3000)
    const answered = page.waitForResponse((r) => r.url().endsWith('/bar/api/cocktails/1/toggle-favorite'))
    await favorite(page).click()
    // Optimistic: the flip lands while the server is still holding the write.
    await expect(favorite(page)).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
    await expect(favorite(page)).toHaveText('✓ Favorited')
    expect(bar.model.favorites.has(C.daiquiri)).toBe(false)

    await answered
    bar.slowDown(0)
    expect(bar.calls('POST', /toggle-favorite$/).map((c) => c.path)).toEqual(['/cocktails/1/toggle-favorite'])
    expect(bar.model.favorites.has(C.daiquiri)).toBe(true)
    await expect(favorite(page)).toHaveAttribute('aria-pressed', 'true')

    // And back again. The screen ignores a click while the first write is still
    // pending (DrinkDetail's isPending guard), so wait until the page itself has
    // the whole answer, not just until Playwright saw it leave the fake.
    await expect
      .poll(() =>
        page.evaluate(
          () => performance.getEntriesByType('resource').filter((e) => e.name.endsWith('/toggle-favorite')).length,
        ),
      )
      .toBe(1)
    await favorite(page).click()
    await expect(favorite(page)).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => bar.model.favorites.has(C.daiquiri)).toBe(false)
  })

  test('a favourite the server refuses rolls back and says so', async ({ page, bar }) => {
    bar.model.favorites.add(C.daiquiri)
    await openRecipe(page, 'daiquiri-1', 'Daiquiri')
    await expect(favorite(page)).toHaveAttribute('aria-pressed', 'true')

    bar.fail(/^\/cocktails\/\d+\/toggle-favorite$/, { method: 'POST', status: 500 })
    await favorite(page).click()
    await expect(page.getByRole('status')).toHaveText('The favorite didn’t take.')
    await expect(favorite(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(favorite(page)).toHaveText('✓ Favorited')
    expect(bar.model.favorites.has(C.daiquiri)).toBe(true)
  })

  test('a favourite made on the recipe shows on the index it came from', async ({ page }) => {
    await page.goto('/drinks')
    await page.getByRole('link', { name: /^Daiquiri/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toBeVisible()
    await favorite(page).click()
    await expect(favorite(page)).toHaveText('✓ Favorited')

    await back(page).click()
    await expect(page).toHaveURL(/\/drinks$/)
    const card = page.getByRole('link', { name: /Daiquiri/ })
    await expect(card.getByRole('img', { name: 'Favorited' })).toBeVisible()
  })
})

test.describe('in the same vein (§2, §9)', () => {
  test('similar drinks link to their recipes, and Back returns', async ({ page, bar }) => {
    await openRecipe(page, 'gimlet-1', 'Gimlet')
    // Upstream emits garnish as '' when there is none; no empty garnish line.
    await expect(main(page).getByText(/^Garnish:/)).toHaveCount(0)

    await expect(similarHeading(page)).toBeVisible()
    const cards = similarSection(page).getByRole('link')
    await expect(cards).toHaveCount(3)
    for (const [name, slug] of [
      ['Negroni', 'negroni-1'],
      ['Gin Tonic', 'gin-tonic-1'],
      ['Martini', 'martini-1'],
    ] as const) {
      await expect(similarSection(page).getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute(
        'href',
        `/drinks/${slug}`,
      )
    }
    // §2: similar drinks are asked for by the cocktail's id.
    expect(bar.calls('GET', /^\/cocktails\/4\/similar$/)).toHaveLength(1)

    await similarSection(page).getByRole('link', { name: /^Negroni/ }).click()
    await expect(page).toHaveURL(/\/drinks\/negroni-1$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Negroni' })).toBeVisible()
    await expect(page).toHaveTitle('Negroni · Barback')
    await expect(ratioDevice(page, '1 GIN, 1 CAMPARI, 1 VERMOUTH')).toBeVisible()

    await back(page).click()
    await expect(page).toHaveURL(/\/drinks\/gimlet-1$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Gimlet' })).toBeVisible()
    await expect(page).toHaveTitle('Gimlet · Barback')
  })

  test('at most four similar drinks are shown', async ({ page, bar }) => {
    const gin = (id: number, name: string): CocktailSeed => ({
      id,
      name,
      lines: [
        { ingredientId: I.gin, amount: 60, units: 'ml' },
        { ingredientId: I.lemonJuice, amount: 30, units: 'ml' },
        { ingredientId: I.clubSoda, amount: 60, units: 'ml' },
      ],
      instructions: 'Build over ice and top with soda.',
    })
    bar.model.world.cocktails.push(gin(91, 'Gin Rickey'), gin(92, 'Gin Fizz'), gin(93, 'Tom Collins'))

    const similar = page.waitForResponse((r) => r.url().endsWith('/bar/api/cocktails/14/similar'))
    await openRecipe(page, 'martini-1', 'Martini')
    const body = (await (await similar).json()) as { data: unknown[] }
    expect(body.data).toHaveLength(5) // upstream's default limit
    await expect(similarSection(page).getByRole('link')).toHaveCount(4)
  })

  test('a drink with nothing similar has no section', async ({ page }) => {
    const similar = page.waitForResponse((r) => r.url().endsWith('/bar/api/cocktails/8/similar'))
    await openRecipe(page, 'penicillin-1', 'Penicillin')
    const body = (await (await similar).json()) as { data: unknown[] }
    expect(body.data).toEqual([])
    await expect(similarHeading(page)).toHaveCount(0)
  })
})

test.describe('the way back (§9)', () => {
  test('Back returns to the screen the recipe was opened from (§6 journey 2)', async ({ page }) => {
    await page.goto('/drinks?family=sour')
    await expect(page.getByRole('button', { name: 'SOUR' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('link', { name: /^Penicillin/ }).click()
    await expect(page).toHaveURL(/\/drinks\/penicillin-1$/)
    await expect(ratioDevice(page, '2 Islay Scotch, ¾ Lemon juice, ¾ Honey syrup')).toBeVisible()
    // "drinks with stock coloring": the parent-called line reads stocked, the gap does not.
    await expectStocked(line(page, 'Islay Scotch'))
    await expectGap(line(page, 'Honey syrup'))

    await back(page).click()
    await expect(page).toHaveURL(/\/drinks\?family=sour$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'SOUR' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('opened as the first page of a session, Back falls back to the index', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'empties the tab history through the Chromium DevTools protocol')
    await openRecipe(page, 'daiquiri-1', 'Daiquiri')
    // A standalone launch or a shared link: nothing behind the recipe in this tab.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Page.resetNavigationHistory')
    expect(await page.evaluate(() => window.history.length)).toBe(1)

    await back(page).click()
    await expect(page).toHaveURL(/\/drinks$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
  })
})

test.describe('quiet loading and error voices (§9, ADR-007)', () => {
  test('while the recipe is fetched the screen says so quietly', async ({ page, bar }) => {
    await page.goto('/drinks')
    const card = page.getByRole('link', { name: /^Daiquiri/ })
    await expect(card).toBeVisible()
    bar.slowDown(2000)
    await card.click()

    await expect(main(page).getByText('Fetching the recipe…')).toBeVisible()
    await expect(main(page)).toHaveAttribute('aria-busy', 'true')
    await expect(back(page)).toBeVisible()
    await expect(main(page).getByText('No drink by that name — the index has the rest.')).toHaveCount(0)

    await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toBeVisible({ timeout: 10_000 })
    await expect(main(page)).not.toHaveAttribute('aria-busy', 'true')
    await expect(main(page).getByText('Fetching the recipe…')).toHaveCount(0)
  })

  for (const [what, failure] of [
    ['answers with a server error', { status: 500 }],
    ['drops the connection', { abort: true }],
  ] as const) {
    test(`when the bar ${what}, the error line offers Retry and Retry recovers`, async ({ page, bar }) => {
      // The query client retries once before it gives up (src/app.tsx, retry: 1),
      // so both attempts fail and the third, from Retry, is answered.
      bar.fail(/^\/cocktails\/daiquiri-1$/, { method: 'GET', times: 2, ...failure })
      await page.goto('/drinks/daiquiri-1')

      const alert = main(page).getByRole('alert')
      await expect(alert).toContainText('The bar didn’t answer — try again.')
      await expect(back(page)).toBeVisible()
      await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toHaveCount(0)

      await alert.getByRole('button', { name: 'Retry' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toBeVisible()
      await expect(ratioDevice(page, '2 RUM, ¾ LIME, ¾ SYRUP')).toBeVisible()
      await expect(main(page).getByRole('alert')).toHaveCount(0)
      expect(bar.calls('GET', /^\/cocktails\/daiquiri-1$/)).toHaveLength(3)
    })
  }
})

test.describe('journeys through the recipe (§6)', () => {
  test('Tonight → a drink that pours → its recipe, led by its ratio device (journey 1)', async ({ page }) => {
    await page.goto('/tonight')
    await page.getByRole('link', { name: /^Daiquiri/ }).click()
    await expect(page).toHaveURL(/\/drinks\/daiquiri-1$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toBeVisible()
    const device = ratioDevice(page, '2 RUM, ¾ LIME, ¾ SYRUP')
    await expect(device).toBeVisible()
    expect(await top(device)).toBeLessThan(await top(ingredientList(page)))
    await expect(missingLine(page)).toHaveCount(0)

    await back(page).click()
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
  })

  test("Tonight → a near miss → its recipe → + List → the bottle is on Tonight's list", async ({ page, bar }) => {
    await page.goto('/tonight')
    await page.getByRole('link', { name: /^Negroni/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Negroni' })).toBeVisible()
    await expect(missingLine(page)).toHaveText('One bottle away: Campari')
    await expectGap(line(page, 'Campari'))

    await addToList(page, 'Campari').click()
    await expect(line(page, 'Campari').getByText('Listed', { exact: true })).toBeVisible()
    expect(bar.model.list.has(I.campari)).toBe(true)

    await back(page).click()
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(page.getByRole('button', { name: 'Remove Campari from the list' })).toBeVisible()
  })
})

test.describe('keyboard (§7)', () => {
  // §7: "all interactive elements keyboard-operable, focus-visible 2px brass
  // outline". Each control is reached by Tab or Shift+Tab, shows the whole ring,
  // and is operated by a key, never a click. Where focus lands after a route
  // change or after the activated button is replaced is Track 5 (ADR-003), so
  // each walk starts from a control focused by the test, not from wherever
  // focus was left.

  test('Favorite and + List are reached by Tab and operated by Space and Enter', async ({ page, bar }) => {
    await openRecipe(page, 'penicillin-1', 'Penicillin')
    await back(page).focus()

    await page.keyboard.press('Tab')
    await expectRing(favorite(page))
    await page.keyboard.press('Space')
    await expect(favorite(page)).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('Tab')
    await expectRing(addToList(page, 'Honey syrup'))
    await page.keyboard.press('Enter')
    await expect(line(page, 'Honey syrup').getByText('Listed', { exact: true })).toBeVisible()
    expect(bar.model.list.has(I.honeySyrup)).toBe(true)
  })

  test('Add missing is reached past every + List and operated by Space', async ({ page, bar }) => {
    await openRecipe(page, 'espresso-martini-1', 'Espresso Martini')
    await back(page).focus()

    await page.keyboard.press('Tab')
    await expect(favorite(page)).toBeFocused()
    for (const name of ['Vodka', 'Coffee liqueur', 'Espresso']) {
      await page.keyboard.press('Tab')
      await expectRing(addToList(page, name))
    }
    await page.keyboard.press('Tab')
    await expectRing(addMissing(page))
    await page.keyboard.press('Space')

    for (const name of ['Vodka', 'Coffee liqueur', 'Espresso']) {
      await expect(line(page, name).getByText('Listed', { exact: true })).toBeVisible()
    }
    expect(bar.calls('POST', /^\/users\/1\/shopping-list\/batch-store$/).map((w) => w.body)).toEqual([
      { ingredients: [{ id: I.vodka }, { id: I.coffeeLiqueur }, { id: I.espresso }] },
    ])
  })

  test('a similar drink is opened by Enter, and Back by Shift+Tab and Enter returns', async ({ page }) => {
    await openRecipe(page, 'gimlet-1', 'Gimlet')
    const first = similarSection(page).getByRole('link').first()
    await expect(first).toBeVisible()
    const href = await first.getAttribute('href')
    expect(href).toMatch(/^\/drinks\/[a-z0-9-]+$/)
    // The card's heading, less the ◆ a favourited card carries.
    const name = (await first.locator('h3').innerText()).replace('◆', '').trim()
    expect(name).not.toBe('Gimlet')

    // Gimlet pours, so nothing stands between Favorite and the first card.
    await favorite(page).focus()
    await page.keyboard.press('Tab')
    await expectRing(first)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible()

    // Back sits before Favorite: one Shift+Tab reaches it.
    await favorite(page).focus()
    await page.keyboard.press('Shift+Tab')
    await expectRing(back(page))
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/drinks\/gimlet-1$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Gimlet' })).toBeVisible()
  })

  test('Retry on the error line is reached by Tab and operated by Enter', async ({ page, bar }) => {
    // Both attempts fail (src/app.tsx, retry: 1); the third, from Retry, is answered.
    bar.fail(/^\/cocktails\/daiquiri-1$/, { method: 'GET', times: 2, status: 500 })
    await page.goto('/drinks/daiquiri-1')
    const retry = main(page).getByRole('alert').getByRole('button', { name: 'Retry' })
    await expect(retry).toBeVisible()

    await back(page).focus()
    await page.keyboard.press('Tab')
    await expectRing(retry)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toBeVisible()
    await expect(main(page).getByRole('alert')).toHaveCount(0)
  })
})
