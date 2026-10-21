import type { Page } from '@playwright/test'
import { C, I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// What Buy next says a favourite bottle completes (ADR-008 Decision: "within
// favorites, bottles completing more favorited drinks rank first"; ADR-008
// Validation: the reason "completes N favorites"; frontend-spec §9 "Purchasing
// intelligence"). A bottle completes a favourite only when it is the one
// bottle that favourite still misses; a favourite two bottles away is
// completed by neither. Pins the rail Tonight renders from src/data/buy-next.ts.

/** The default bar with Sweet vermouth used up, and these favourites. */
function vermouthOut(favorites: number[]): WorldSeed {
  const w = defaultWorld()
  w.shelf = w.shelf.filter((id) => id !== I.sweetVermouth)
  w.favorites = favorites
  return w
}

const forFavorites = (page: Page) =>
  page
    .locator('#buy .restock-section')
    .filter({ has: page.getByRole('heading', { name: 'For your favorites', exact: true }) })

test.describe('two favourites each two bottles away, missing the same two', () => {
  // Rob Roy and Bobby Burns each miss Scotch whisky and Sweet vermouth.
  test.use({ world: vermouthOut([C.robRoy, C.bobbyBurns]) })

  test('Buy next and the favourites group say what needs each bottle, never that it completes one', async ({
    page,
    bar,
  }) => {
    await page.goto('/tonight')
    const buyNext = page.locator('#buy .buy-next')
    await expect(buyNext.locator('.buy-next-name')).toHaveText('Scotch whisky')
    await expect(buyNext.locator('.buy-next-reason')).toHaveText('in 2 favorites')
    const rows = forFavorites(page).locator('.restock-row')
    await expect(rows).toHaveCount(1)
    await expect(rows.locator('.restock-name')).toHaveText('Sweet vermouth')
    await expect(rows.locator('.restock-unlocks')).toHaveText('in 2 favorites')
    await expect(page.locator('#buy')).not.toContainText('completes')
    // App-derived suggestions never write the list by themselves (ADR-008).
    expect(bar.calls('POST')).toEqual([])
  })
})

test.describe('one favourite a bottle away, three others two bottles away', () => {
  // Manhattan, Rob Roy and Negroni each miss Sweet vermouth and one bottle
  // more; Martini misses only Dry vermouth.
  test.use({ world: vermouthOut([C.manhattan, C.robRoy, C.negroni, C.martini]) })

  test('Buy next is the bottle that completes a favourite, ahead of the one most favourites need', async ({
    page,
  }) => {
    await page.goto('/tonight')
    const buyNext = page.locator('#buy .buy-next')
    await expect(buyNext.locator('.buy-next-name')).toHaveText('Dry vermouth')
    await expect(buyNext.locator('.buy-next-reason')).toHaveText('completes 1 favorite')
    const rows = forFavorites(page).locator('.restock-row')
    await expect(rows.locator('.restock-name')).toHaveText([
      'Sweet vermouth',
      'Campari',
      'Rye whiskey',
      'Scotch whisky',
    ])
    await expect(rows.locator('.restock-unlocks')).toHaveText([
      'in 3 favorites',
      'in 1 favorite',
      'in 1 favorite',
      'in 1 favorite',
    ])
  })
})
