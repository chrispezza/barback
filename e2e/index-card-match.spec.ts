import type { Page } from '@playwright/test'
import { expect, test } from './support/test'

// Index cards (frontend-spec §6 "Filter mechanics": on the Index, stock state
// appears only as per-drink colouring; §7 DrinkCard). The Index paints each
// card with src/data/match.ts over the index-shaped GET /cocktails resources.
// Drinks with a line only a child brand or a substitute covers are left out:
// the index shape carries no in_shelf_as_* flags, a known bug
// (chrispezza/barback#20) with its own failing-first PR.
//
// Text is matched on what a reader sees or hears, never on a card's whole
// textContent: the decorative ✓ is aria-hidden, and how the run separates a
// name from its "optional" mark is the DS's presentation, not match state.

function card(page: Page, name: string) {
  return page.locator('a.bb-drink', {
    has: page.getByRole('heading', { level: 3, name, exact: true }),
  })
}

test('the Index paints each card with its match state and missing line', async ({ page }) => {
  await page.goto('/drinks')
  await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()

  const daiquiri = card(page, 'Daiquiri')
  await expect(daiquiri).toHaveAttribute('data-match', 'full')
  await expect(daiquiri.locator('.bb-drink__pour')).toMatchAriaSnapshot('- paragraph: Can pour')

  // The egg white is optional: marked as such, never a missing bottle.
  const sour = card(page, 'Whiskey Sour')
  await expect(sour).toHaveAttribute('data-match', 'full')
  const optional = sour.locator('.bb-drink__optional')
  await expect(optional).toHaveCount(1)
  await expect(optional).toContainText('Egg white')
  await expect(optional.locator('.bb-drink__opt')).toHaveText('optional')
  await expect(sour.locator('.bb-drink__missing-line')).toHaveCount(0)

  const negroni = card(page, 'Negroni')
  await expect(negroni).toHaveAttribute('data-match', 'near')
  await expect(negroni.locator('.bb-drink__missing-line')).toHaveText('One bottle away: Campari')

  const margarita = card(page, 'Margarita')
  await expect(margarita).toHaveAttribute('data-match', 'partial')
  await expect(margarita.locator('.bb-drink__missing-line')).toHaveText(
    'Missing 2: Tequila, Cointreau',
  )

  const espresso = card(page, 'Espresso Martini')
  await expect(espresso).toHaveAttribute('data-match', 'partial')
  await expect(espresso.locator('.bb-drink__missing-line')).toHaveText(
    'Missing 3: Vodka, Coffee liqueur, Espresso',
  )
})
