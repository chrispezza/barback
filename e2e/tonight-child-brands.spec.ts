import type { Locator, Page } from '@playwright/test'
import { C, I, defaultWorld } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Child brands on Tonight (chrispezza/barback#20; frontend-spec §2 Tonight, §7
// DrinkCard, §9 "Hierarchy-aware brands"; ADR-008 favourites gaps). GET
// /cocktails loads no descendants upstream, so a line calling the direct parent
// of a brand on the shelf arrives with in_shelf false and no variant flag. The
// server's matcher credits the brand (CocktailService.php:281-288 at v5.15.3),
// so the cards and the favourites gaps must too.

function card(page: Page, name: string, within: Locator) {
  return within.locator('a.bb-drink', {
    has: page.getByRole('heading', { level: 3, name, exact: true }),
  })
}

test.describe('a drink the server pours through a held brand', () => {
  // Penicillin calls Islay Scotch, Lemon juice and Honey syrup; the shelf holds
  // Laphroaig 10, a child of Islay Scotch, and nothing else pours.
  test.use({ world: { ...defaultWorld(), shelf: [I.laphroaig10, I.lemonJuice, I.honeySyrup] } })

  test('reads Can pour in the pour section, with no bottle missing', async ({ page }) => {
    await page.goto('/tonight')
    const pour = page.locator('#pour')
    await expect(pour.getByRole('heading', { name: /You can pour/ })).toBeVisible()
    const penicillin = card(page, 'Penicillin', pour)
    await expect(penicillin).toHaveAttribute('data-match', 'full')
    await expect(penicillin.locator('.bb-drink__pour')).toMatchAriaSnapshot('- paragraph: Can pour')
    // Upstream's index shape alone would add "One bottle away: Islay Scotch".
    await expect(penicillin.locator('.bb-drink__missing-line')).toHaveCount(0)
    await expect(penicillin.locator('.bb-drink__have').filter({ hasText: 'Islay Scotch' })).toHaveCount(1)
  })
})

test.describe('a favourite one bottle away through a held brand', () => {
  // The default shelf holds Laphroaig 10 and Lemon juice: Honey syrup is the
  // Penicillin's one real gap.
  test.use({ world: { ...defaultWorld(), favorites: [C.penicillin] } })

  test('Buy next names the real gap, never the parent of a bottle on the shelf', async ({ page, bar }) => {
    await page.goto('/tonight')
    const rail = page.locator('#buy')
    const buyNext = rail.locator('.buy-next')
    await expect(buyNext.getByRole('heading', { name: 'Buy next', exact: true })).toBeVisible()
    await expect(buyNext.locator('.buy-next-name')).toHaveText('Honey syrup')
    await expect(buyNext.locator('.buy-next-reason')).toHaveText('completes 1 favorite')
    // Nor does any group below it offer Islay Scotch, the parent of Laphroaig 10.
    await expect(rail).not.toContainText('Islay Scotch')
    // App-derived suggestions never write the list by themselves (ADR-008).
    expect(bar.calls('POST')).toEqual([])
  })
})
