import type { Page } from '@playwright/test'
import type { RangedLineSeed } from '../test/fixtures/upstream'
import { I, type CocktailSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Recipe measures as authored (frontend-spec §1, §2 "Recipe detail"). Content
// fundamentals: "Fractions are typeset as fraction glyphs (¾, ⅓), never
// decimals." Upstream sends each line's `amount`, `amount_max` and `units` as
// the recipe was written, and `formatted.<unit>` converted
// (bar-assistant-reference app/Http/Resources/CocktailIngredientResource.php:52-54
// and 61; app/Http/Resources/AmountFormats.php:49-57). A volumetric line reads
// in ounces; a barspoon or a dash keeps the unit it was written in; a range
// keeps both of its bounds.

const main = (page: Page) => page.getByRole('main')
const ingredientList = (page: Page) => main(page).locator('ul.recipe-ingredients')
/** The measure printed under a line's ingredient name. */
const measureOf = (page: Page, name: string) =>
  ingredientList(page).getByRole('listitem').filter({ hasText: name }).locator('.bb-row__brand')

const vermouth: RangedLineSeed = { ingredientId: I.sweetVermouth, amount: 22.5, amountMax: 30, units: 'ml' }
const bitters: RangedLineSeed = { ingredientId: I.angostura, amount: 2, amountMax: 3, units: 'dash' }

const ryeCocktail: CocktailSeed = {
  id: 97,
  name: 'Rye Cocktail',
  lines: [
    { ingredientId: I.rye, amount: 60, units: 'ml' },
    vermouth,
    { ingredientId: I.simpleSyrup, amount: 0.5, units: 'barspoon' },
    bitters,
  ],
  instructions: 'Stir with ice and strain into a chilled coupe.',
}

type ShowEntry = {
  ingredient: { id: number }
  amount: number
  amount_max: number | null
  units: string
  formatted: { oz: { amount: number; amount_max: number | null } }
}
type ShowBody = { data: { ingredients: ShowEntry[] } }

function entryFor(body: ShowBody, ingredientId: number): ShowEntry {
  const entry = body.data.ingredients.find((e) => e.ingredient.id === ingredientId)
  if (!entry) throw new Error(`the show response has no line for ingredient ${ingredientId}`)
  return entry
}

test('every measure reads as authored, in fraction glyphs, with both bounds of a range', async ({ page, bar }) => {
  bar.model.world.cocktails.push(ryeCocktail)

  const shown = page.waitForResponse((r) => r.url().endsWith('/bar/api/cocktails/rye-cocktail-1'))
  await page.goto('/drinks/rye-cocktail-1')
  await expect(page.getByRole('heading', { level: 1, name: 'Rye Cocktail' })).toBeVisible()

  // The wire: the bounds as authored, and ounces converted in `formatted`.
  const body = (await (await shown).json()) as ShowBody
  expect(entryFor(body, I.simpleSyrup)).toMatchObject({ amount: 0.5, amount_max: null, units: 'barspoon' })
  expect(entryFor(body, I.angostura)).toMatchObject({ amount: 2, amount_max: 3, units: 'dash' })
  expect(entryFor(body, I.sweetVermouth)).toMatchObject({
    amount: 22.5,
    amount_max: 30,
    units: 'ml',
    formatted: { oz: { amount: 0.75, amount_max: 1 } },
  })

  // The page: ounces for the pours, the authored unit for the seasoning,
  // glyphs throughout, and a range keeps its upper bound. Soft, so a failure
  // names every line that reads wrong; the test still fails on any of them.
  await expect.soft(measureOf(page, 'Rye whiskey')).toHaveText('2 oz')
  await expect.soft(measureOf(page, 'Sweet vermouth')).toHaveText('¾–1 oz')
  await expect.soft(measureOf(page, 'Simple syrup')).toHaveText('½ barspoon')
  await expect.soft(measureOf(page, 'Angostura aromatic bitters')).toHaveText('2–3 dash')
  await expect.soft(ingredientList(page)).not.toContainText(/\d\.\d/)
})
