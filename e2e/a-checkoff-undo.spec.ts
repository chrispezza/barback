import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// The Undo on "Moved to the shelf." (frontend-spec §5 check-off; §6 journey 3,
// "Check-off moves the bottle to the shelf and refreshes all counts"). §5 runs
// the check-off as two calls, shelf batch-store first and list batch-delete
// only on success, because "item vanishing entirely is data loss from the
// user's view". The Undo is the same two calls in reverse and is held to the
// same rule: the list write first, the shelf write only once the list has the
// bottle back. Upstream's shelf batch-delete does not touch the list
// (ShelfController::batchDelete, app/Http/Controllers/ShelfController.php
// 173-195 at v5.15.3), and its list batch-store does not touch the shelf
// (ShoppingListController::batchStore, ShoppingListController.php 54-93), so a
// refused second step leaves the bottle in both places, never in neither. A
// refused step says so in a toast. The Undo then reads back everything the
// check-off read back, the unlock lines included.

/**
 * The default bar with the Whiskey Sour's optional egg white on the shelf, as
 * e2e/tonight.spec.ts builds it, so the can-pour and one-bottle-away sets do
 * not overlap (chrispezza/barback#19). Pours 5; one bottle away 6.
 */
function tonightWorld(change?: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  w.shelf.push(I.eggWhite)
  change?.(w)
  return w
}

const status = (page: Page) => page.locator('.bar-status')
const rail = (page: Page) => page.locator('#buy')
/** A shopping-list row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
/** The check-off's receipt toast, which carries the Undo. */
const undoButton = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Moved to the shelf.' }).getByRole('button', { name: 'Undo' })

const shelfDeletes = /^\/users\/1\/ingredients\/batch-delete$/
const listStores = /^\/users\/1\/shopping-list\/batch-store$/

test.describe('the Undo on a check-off (§5)', () => {
  test.use({
    world: tonightWorld((w) => {
      w.list = [I.campari, I.scotch]
    }),
  })

  /** Check Campari off and wait until every count has followed it. */
  async function checkOffCampari(page: Page) {
    await page.goto('/tonight')
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 2 to buy')
    await listItem(page, 'Campari').click()
    await expect(status(page)).toHaveText('You can pour 6 · 5 one bottle away · 1 to buy')
  }

  test('puts the bottle back on the list before it takes it off the shelf', async ({ page, bar }) => {
    await checkOffCampari(page)
    await undoButton(page).click()

    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 2 to buy')
    expect(bar.calls('POST').map((c) => [c.path, c.body])).toEqual([
      ['/users/1/ingredients/batch-store', { ingredients: [I.campari] }],
      ['/users/1/shopping-list/batch-delete', { ingredients: [{ id: I.campari }] }],
      // The Undo: list first, then the shelf.
      ['/users/1/shopping-list/batch-store', { ingredients: [{ id: I.campari }] }],
      ['/users/1/ingredients/batch-delete', { ingredients: [I.campari] }],
    ])
    expect(bar.model.list.has(I.campari)).toBe(true)
    expect(bar.model.shelf.has(I.campari)).toBe(false)
  })

  test('a refused list write leaves the bottle on the shelf, and says the undo did not take', async ({
    page,
    bar,
  }) => {
    await checkOffCampari(page)
    bar.fail(listStores, { method: 'POST', status: 500 })
    await undoButton(page).click()

    // Once the Undo's list write has been answered, the bottle is somewhere.
    await expect.poll(() => bar.calls('POST', listStores).length).toBe(1)
    expect(bar.model.shelf.has(I.campari) || bar.model.list.has(I.campari)).toBe(true)

    await expect(page.getByRole('status')).toHaveText('The undo didn’t take — the bottle is still on the shelf.')
    expect(bar.model.shelf.has(I.campari)).toBe(true)
    expect(bar.model.list.has(I.campari)).toBe(false)
    // The shelf is never written once the list has refused.
    expect(bar.calls('POST', shelfDeletes)).toEqual([])
    await expect(listItem(page, 'Campari')).toHaveCount(0)
    await expect(status(page)).toHaveText('You can pour 6 · 5 one bottle away · 1 to buy')
  })

  test('a refused shelf write leaves the bottle in both places, and says so', async ({ page, bar }) => {
    await checkOffCampari(page)
    bar.fail(shelfDeletes, { method: 'POST', status: 500 })
    await undoButton(page).click()

    await expect(page.getByRole('status')).toHaveText(
      'The undo didn’t take — the bottle is on the list and still on the shelf.',
    )
    expect(bar.model.list.has(I.campari)).toBe(true)
    expect(bar.model.shelf.has(I.campari)).toBe(true)
    // Both places, and the screen says so: listed again, and the Negroni still pours.
    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(status(page)).toHaveText('You can pour 6 · 5 one bottle away · 2 to buy')
  })
})

test.describe('the unlock lines after an Undo (§6 journey 3)', () => {
  test.describe('on the list', () => {
    test.use({
      world: tonightWorld((w) => {
        w.list = [I.cointreau, I.tequila]
      }),
    })

    test('a row that a check-off opened says what it unlocks again once the check-off is undone', async ({
      page,
    }) => {
      await page.goto('/tonight')
      // Neither opens a drink alone; the Margarita needs both.
      await expect(listItem(page, 'Cointreau')).toContainText('In 1 drink')
      await expect(listItem(page, 'Cointreau')).not.toContainText('Unlocks')

      await listItem(page, 'Tequila').click()
      await expect(listItem(page, 'Tequila')).toHaveCount(0)
      await expect(listItem(page, 'Cointreau')).toContainText('Unlocks 1')

      await undoButton(page).click()
      await expect(listItem(page, 'Tequila')).toBeVisible()
      await expect(status(page)).toHaveText('You can pour 5 · 6 one bottle away · 2 to buy')
      // Tequila is off the shelf again, so the Margarita waits on both once more.
      await expect(listItem(page, 'Cointreau')).toContainText('In 1 drink')
      await expect(listItem(page, 'Cointreau')).not.toContainText('Unlocks')
    })
  })

  test.describe('on Buy next', () => {
    // Sweet vermouth bought but not yet checked off: Scotch whisky leads the
    // ranking once the listed vermouth is set aside, and opens nothing without it.
    test.use({
      world: tonightWorld((w) => {
        w.shelf = w.shelf.filter((id) => id !== I.sweetVermouth)
        w.list = [I.sweetVermouth]
      }),
    })

    test('the pick’s reason follows the shelf the Undo restored', async ({ page }) => {
      await page.goto('/tonight')
      const buyNext = rail(page).locator('.buy-next')
      await expect(buyNext.locator('.buy-next-name')).toHaveText('Scotch whisky')
      await expect(buyNext.locator('.buy-next-reason')).toHaveText('ranked highest for your shelf')

      // With the vermouth shelved, Scotch whisky opens the Rob Roy and the Bobby Burns.
      await listItem(page, 'Sweet vermouth').click()
      await expect(listItem(page, 'Sweet vermouth')).toHaveCount(0)
      await expect(buyNext.locator('.buy-next-reason')).toHaveText('opens 2 drinks tonight')

      await undoButton(page).click()
      await expect(listItem(page, 'Sweet vermouth')).toBeVisible()
      await expect(buyNext.locator('.buy-next-name')).toHaveText('Scotch whisky')
      await expect(buyNext.locator('.buy-next-reason')).toHaveText('ranked highest for your shelf')
    })
  })
})
