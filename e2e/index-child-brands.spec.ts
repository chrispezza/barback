import type { Locator, Page } from '@playwright/test'
import { I, defaultWorld } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Child brands on the Index and in the Recipe's "In the same vein"
// (chrispezza/barback#20; frontend-spec §2 Index / Recipe, §6 "Filter
// mechanics", §7 DrinkCard, §9 "Hierarchy-aware brands"). GET /cocktails and
// /cocktails/{id}/similar load no descendants upstream, so a line calling the
// direct parent of a brand on the shelf arrives with in_shelf false and no
// variant flag. The server's matcher credits the brand
// (CocktailService.php:281-288 at v5.15.3), so the card colours it as held and
// names only the bottles really missing.

function card(page: Page, name: string, within?: Locator) {
  return (within ?? page).locator('a.bb-drink', {
    has: page.getByRole('heading', { level: 3, name, exact: true }),
  })
}

test('the Index names only the real gap of a drink whose parent-called line a brand covers', async ({ page }) => {
  // Penicillin calls Islay Scotch; the default shelf holds Laphroaig 10 and
  // Lemon juice, not Honey syrup.
  await page.goto('/drinks')
  await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
  const penicillin = card(page, 'Penicillin')
  await expect(penicillin).toHaveAttribute('data-match', 'near')
  await expect(penicillin.locator('.bb-drink__have').filter({ hasText: 'Islay Scotch' })).toHaveCount(1)
  await expect(penicillin.locator('.bb-drink__missing-line')).toHaveText('One bottle away: Honey syrup')
})

test.describe('with London dry gin on the shelf in place of Gin', () => {
  test.use({
    world: { ...defaultWorld(), shelf: [...defaultWorld().shelf.filter((id) => id !== I.gin), I.londonDryGin] },
  })

  test('In the same vein paints every Gin drink with the brand counted', async ({ page }) => {
    // The Martini's similar drinks are the Gimlet, the Negroni and the Gin
    // Tonic, each calling Gin, the direct parent of London dry gin.
    await page.goto('/drinks/martini-1')
    await expect(page.getByRole('heading', { level: 1, name: 'Martini' })).toBeVisible()
    const similar = page.locator('.similar-section')
    await expect(similar.getByRole('heading', { name: 'In the same vein' })).toBeVisible()

    for (const name of ['Gimlet', 'Gin Tonic']) {
      const pours = card(page, name, similar)
      await expect(pours).toHaveAttribute('data-match', 'full')
      await expect(pours.locator('.bb-drink__missing-line')).toHaveCount(0)
    }
    const negroni = card(page, 'Negroni', similar)
    await expect(negroni).toHaveAttribute('data-match', 'near')
    await expect(negroni.locator('.bb-drink__missing-line')).toHaveText('One bottle away: Campari')
  })
})
