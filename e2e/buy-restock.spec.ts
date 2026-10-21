import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Restock next, and Buy next when no favourite is waiting, follow the user's
// own shelf (chrispezza/barback#22; ADR-008 Decision, "the server's recommend
// endpoint"; frontend-spec §2 Tonight "Restock suggestions", §5 "Empty states
// are directive", §9 "Purchasing intelligence").
//
// Upstream ranks with one query and two shelves (IngredientService.php:227-281
// at v5.15.3): the ten bottles named by the most recipes among those NOT held.
// /bars/{id}/ingredients/recommend passes the bar shelf (ShelfController.php:
// 358-368), which Barback never writes, so it names the same ten bottles
// whatever the user owns. /users/{id}/ingredients/recommend passes the user's
// shelf (ShelfController.php:206-222; routes/api.php:188), the shelf every
// Barback screen reads and writes.
//
// The ranking compares ingredient ids only. It does not see the hierarchy the
// matcher credits (CocktailService.php:281-288; frontend-spec §9
// "Hierarchy-aware brands"), so a parent the shelf covers through a held brand
// can still come back, and Tonight must not offer it.

/** The rail's group under this heading: "For your favorites" or "Restock next". */
const group = (page: Page, heading: string) =>
  page
    .locator('#buy .restock-section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })

/** A shopping-list row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  page.locator('#buy .shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })

/**
 * A well-stocked bar: the shelf holds every bottle an empty bar shelf ranks in
 * its top ten (the default shelf plus Scotch whisky and Dark rum), and Islay
 * Scotch beside the Laphroaig 10, so the first bottle the user's ranking names
 * is one the shelf does not cover at all.
 */
function stocked(): WorldSeed {
  const w = defaultWorld()
  w.shelf = [...w.shelf, I.scotch, I.darkRum, I.islayScotch]
  return w
}

test.describe('a shelf holding every bottle the bar-wide ranking names', () => {
  test.use({ world: stocked() })

  test('Buy next is the first bottle the user’s shelf ranking names, and Restock next follows it', async ({
    page,
    bar,
  }) => {
    await page.goto('/tonight')
    const buyNext = page.locator('#buy .buy-next')
    // Rye whiskey is the Manhattan's one gap: Sweet vermouth and Angostura are held.
    await expect(buyNext.locator('.buy-next-name')).toHaveText('Rye whiskey')
    await expect(buyNext.locator('.buy-next-reason')).toHaveText('opens 1 drink tonight')
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText([
      'Tequila',
      'Vodka',
      'Cointreau',
      'Campari',
    ])
    // Ranked against the user's shelf, asked only once the user is known.
    const asked = bar.calls('GET', /\/ingredients\/recommend$/).map((c) => c.path)
    expect(asked.length).toBeGreaterThan(0)
    expect(new Set(asked)).toEqual(new Set(['/users/1/ingredients/recommend']))
    // App-derived suggestions never write the list by themselves (ADR-008).
    expect(bar.calls('POST')).toEqual([])
  })

  test('shelving the pick, bought and checked off, moves Buy next to the next bottle ranked', async ({
    page,
    bar,
  }) => {
    await page.goto('/tonight')
    const buyNext = page.locator('#buy .buy-next')
    await expect(buyNext.locator('.buy-next-name')).toHaveText('Rye whiskey')

    await buyNext.getByRole('button', { name: 'List it' }).click()
    await expect(listItem(page, 'Rye whiskey')).toBeVisible()
    await listItem(page, 'Rye whiskey').click()
    await expect(listItem(page, 'Rye whiskey')).toHaveCount(0)
    await expect.poll(() => bar.model.shelf.has(I.rye)).toBe(true)

    // Tequila is the Margarita's last bottle but one: Cointreau is still missing.
    await expect(buyNext.locator('.buy-next-name')).toHaveText('Tequila')
    await expect(buyNext.locator('.buy-next-reason')).toHaveText('ranked highest for your shelf')
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText([
      'Vodka',
      'Cointreau',
      'Campari',
      'Coffee liqueur',
    ])
    await expect(page.locator('#buy')).not.toContainText('Rye whiskey')
  })
})

test('in the default bar, Restock next looks past the bottles on the shelf', async ({ page }) => {
  // The bar-wide top ten holds only two bottles this shelf lacks: Scotch
  // whisky and Dark rum. Islay Scotch, which the user's ranking names next,
  // is covered by the Laphroaig 10 (its direct parent) and is never offered.
  await page.goto('/tonight')
  const buyNext = page.locator('#buy .buy-next')
  await expect(buyNext.locator('.buy-next-name')).toHaveText('Scotch whisky')
  await expect(buyNext.locator('.buy-next-reason')).toHaveText('opens 2 drinks tonight')
  await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText([
    'Dark rum',
    'Rye whiskey',
    'Tequila',
    'Vodka',
  ])
})

test.describe('with London dry gin on the shelf in place of Gin', () => {
  test.use({
    world: { ...defaultWorld(), shelf: [...defaultWorld().shelf.filter((id) => id !== I.gin), I.londonDryGin] },
  })

  test('Buy next and Restock next never offer Gin, which the brand already covers', async ({ page }) => {
    // Every recipe names Gin with is_specified false, so London dry gin, a
    // direct child, pours them all. Both rankings still put Gin first: it is
    // not held by id.
    await page.goto('/tonight')
    const buyNext = page.locator('#buy .buy-next')
    await expect(buyNext.locator('.buy-next-name')).toHaveText('Scotch whisky')
    await expect(group(page, 'Restock next').locator('.restock-name')).toHaveText([
      'Dark rum',
      'Rye whiskey',
      'Tequila',
      'Vodka',
    ])
  })
})
