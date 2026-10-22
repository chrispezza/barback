import type { Page } from '@playwright/test'
import { C } from '../test/fixtures/world'
import { expect, test } from './support/test'

// A favourite tapped on the Recipe screen (frontend-spec §2 Index / Recipe,
// "Favorite: POST /cocktails/{id}/toggle-favorite"; §5, the optimistic flip
// rolled back on error). ADR-003 Validation: the toggle "reflects in UI in
// < 50 ms (optimistic), reconciles with API in the background". Upstream does
// not set the favourite to what the tap meant, it toggles what it holds, and
// answers which way it went: `{ data: { id, is_favorited } }`
// (CocktailController::toggleFavorite, app/Http/Controllers/
// CocktailController.php 221-228 at v5.15.3). So a drink favourited or taken
// off on another device since the recipe was read goes the other way from the
// tap, and the button has to settle to that answer, not stay on the tap.
//
// The cards "In the same vein" are GET /cocktails/{id}/similar
// (CocktailController::similar, CocktailController.php 352-371), cocktail
// resources that carry the user's is_favorited (CocktailResource.php 135), so
// a favourite made on one recipe changes what another recipe's cards say.

const main = (page: Page) => page.getByRole('main')
const favorite = (page: Page) => main(page).getByRole('button', { name: /favorite/i })
const back = (page: Page) => page.getByRole('button', { name: '← Back' })
const similarHeading = (page: Page) => page.getByRole('heading', { level: 2, name: 'In the same vein' })
const similarSection = (page: Page) => main(page).locator('section', { has: similarHeading(page) })
/** A similar-drink card; a favourited card's name starts with its mark, so no anchor. */
const similarCard = (page: Page, name: string) => similarSection(page).getByRole('link', { name: new RegExp(name) })
const favouriteMark = (page: Page, name: string) => similarCard(page, name).getByRole('img', { name: 'Favorited' })

const toggleAnswered = (page: Page, id: number) =>
  page.waitForResponse((r) => r.url().endsWith(`/bar/api/cocktails/${id}/toggle-favorite`))

async function openRecipe(page: Page, slug: string, name: string): Promise<void> {
  await page.goto(`/drinks/${slug}`)
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

test.describe('the favourite settles to the bar’s answer (ADR-003; §2, §5)', () => {
  for (const { what, favouritedWhenRead } of [
    { what: 'favourited on another device', favouritedWhenRead: false },
    { what: 'taken off favourites on another device', favouritedWhenRead: true },
  ] as const) {
    test(`a drink ${what} since the recipe was read settles to what the bar answers`, async ({ page, bar }) => {
      if (favouritedWhenRead) bar.model.favorites.add(C.daiquiri)
      await openRecipe(page, 'daiquiri-1', 'Daiquiri')
      await expect(favorite(page)).toHaveAttribute('aria-pressed', String(favouritedWhenRead))

      // Behind the page's back: the bar now holds the other answer.
      if (favouritedWhenRead) bar.model.favorites.delete(C.daiquiri)
      else bar.model.favorites.add(C.daiquiri)

      bar.slowDown(2000)
      const answered = toggleAnswered(page, C.daiquiri)
      await favorite(page).click()
      // Optimistic: the tap's own way first, while the bar holds the write.
      await expect(favorite(page)).toHaveAttribute('aria-pressed', String(!favouritedWhenRead), { timeout: 1000 })

      const answer: unknown = await (await answered).json()
      bar.slowDown(0)
      // The bar toggled what it held, which is where the page started.
      expect(answer).toEqual({ data: { id: C.daiquiri, is_favorited: favouritedWhenRead } })
      expect(bar.model.favorites.has(C.daiquiri)).toBe(favouritedWhenRead)

      // The button says what the bar answered, not what the tap meant.
      await expect(favorite(page)).toHaveAttribute('aria-pressed', String(favouritedWhenRead))
      await expect(favorite(page)).toHaveText(favouritedWhenRead ? '✓ Favorited' : 'Favorite')
    })
  }

  test('a favourite made on one recipe shows on the card another recipe lists in the same vein', async ({
    page,
    bar,
  }) => {
    // Gimlet's similar drinks are Negroni, Gin Tonic and Martini (e2e/recipe.spec.ts).
    await openRecipe(page, 'gimlet-1', 'Gimlet')
    await expect(similarCard(page, 'Negroni')).toBeVisible()
    await expect(favouriteMark(page, 'Negroni')).toHaveCount(0)

    await similarCard(page, 'Negroni').click()
    await expect(page.getByRole('heading', { level: 1, name: 'Negroni' })).toBeVisible()
    const answered = toggleAnswered(page, C.negroni)
    await favorite(page).click()
    await answered
    await expect(favorite(page)).toHaveText('✓ Favorited')
    expect(bar.model.favorites.has(C.negroni)).toBe(true)

    await back(page).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Gimlet' })).toBeVisible()
    await expect(favouriteMark(page, 'Negroni')).toBeVisible()
  })
})
