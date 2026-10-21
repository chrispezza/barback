import type { Locator, Page } from '@playwright/test'
import { I, bareWorld, defaultWorld } from '../test/fixtures/world'
import { expect, test } from './support/test'

// One match state per drink, whichever screen paints it (frontend-spec §7
// DrinkCard; chrispezza/barback#39). The Index reads GET /cocktails, Classics
// reads each drink by slug and "In the same vein" reads /similar; each must
// paint the same drink the same way. Tonight's sections are the server's own
// sets (§2) and paint full and near by section.
//
// Only data-match is asserted on a card here. What the missing line says on
// an index-shaped card a child brand covers is chrispezza/barback#20.

function card(page: Page, name: string, within?: Locator) {
  return (within ?? page).locator('a.bb-drink', {
    has: page.getByRole('heading', { level: 3, name, exact: true }),
  })
}

test.describe('a drink missing four bottles or more', () => {
  test.use({ world: bareWorld() })

  test('reads none on the Index, on Classics and in the same vein', async ({ page }) => {
    // Mojito has five required lines; the bare shelf holds none of them.
    await page.goto('/drinks')
    await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
    await expect(card(page, 'Mojito')).toHaveAttribute('data-match', 'none')

    await page.goto('/first-pours')
    await expect(page.getByRole('heading', { level: 1, name: 'The classics' })).toBeVisible()
    await expect(card(page, 'Mojito')).toHaveAttribute('data-match', 'none')

    // The Daiquiri's similar drinks are the Mojito alone in the fixture world.
    await page.goto('/drinks/daiquiri-1')
    await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toBeVisible()
    const similar = page.locator('.similar-section')
    await expect(similar.getByRole('heading', { name: 'In the same vein' })).toBeVisible()
    await expect(card(page, 'Mojito', similar)).toHaveAttribute('data-match', 'none')
  })
})

test.describe('a drink the server says pours', () => {
  // Laphroaig 10 is a child of the Islay Scotch the Penicillin calls; the
  // upstream matcher credits it (CocktailService.php:255-311), so in_shelf is
  // true, while the index shape carries no variant flag for that line.
  test.use({ world: { ...defaultWorld(), shelf: [I.laphroaig10, I.lemonJuice, I.honeySyrup] } })

  test('reads full in Tonight’s pour section and on the Index', async ({ page }) => {
    await page.goto('/tonight')
    const pour = page.locator('#pour')
    await expect(pour.getByRole('heading', { name: /You can pour/ })).toBeVisible()
    await expect(card(page, 'Penicillin', pour)).toHaveAttribute('data-match', 'full')

    await page.goto('/drinks')
    await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
    await expect(card(page, 'Penicillin')).toHaveAttribute('data-match', 'full')
  })
})
