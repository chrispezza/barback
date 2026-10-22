import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// What a listed bottle unlocks after the shelf changes on the Shelf screen
// (frontend-spec §4: "can-make and near-miss are server-derived from shelf
// state, so they must refetch after any shelf change"; §6 journey 3,
// "refreshes all counts"). A list row's "Unlocks N" is GET
// /ingredients/{id}/extra, which upstream computes against the user's shelf
// (IngredientController::extra, app/Http/Controllers/IngredientController.php
// 199-226 at v5.15.3: the cocktails the shelf makes with the bottle, less those
// it makes without). So every shelf toggle — the chip, the ledger's Remove and
// its Undo — changes the answer, exactly as a check-off does, and Tonight has
// to say the new one when it is next shown.
//
// Campari, listed, opens the Negroni (gin, Campari, sweet vermouth) only while
// gin and sweet vermouth are on the shelf; without gin it opens nothing, and
// its row says how many recipes call it instead ("In 1 drink").

/** The default bar with the egg white on the shelf, as e2e/tonight.spec.ts builds it, and Campari listed. */
function campariListed(change?: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  w.shelf.push(I.eggWhite)
  w.list = [I.campari]
  change?.(w)
  return w
}

/** The main navigation the viewport shows: the rail on desktop, the tab bar on the phone. */
const navLink = (page: Page, label: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) })

const rail = (page: Page) => page.locator('#buy')
/** A shopping-list row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
/** The row's one detail line: "Unlocks N", or what the bottle builds toward. */
const meta = (page: Page, name: string) => listItem(page, name).locator('.bb-shop__meta')

const search = (page: Page) => page.getByRole('searchbox', { name: 'Add a bottle' })
const chip = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const count = (page: Page) => page.locator('.shelf-count')
const removeButton = (page: Page, name: string) =>
  page.getByRole('button', { name: `Remove ${name} from the shelf`, exact: true })
/** The removal's toast (destructive, so the design system gives it role alert). */
const removalToast = (page: Page) =>
  page.locator('.toast-host').filter({ hasText: 'Bottle removed from the shelf.' })
const undoButton = (page: Page) => removalToast(page).getByRole('button', { name: 'Undo' })

const campariExtra = new RegExp(`^/ingredients/${I.campari}/extra$`)

test.describe('a list row after the shelf changes (§4, §6 journey 3)', () => {
  test.describe('with gin on the shelf', () => {
    test.use({ world: campariListed() })

    test('a bottle removed on the Shelf takes its unlock off the row on Tonight', async ({ page, bar }) => {
      await page.goto('/tonight')
      await expect(meta(page, 'Campari')).toHaveText('Unlocks 1·\u200A1 spirit-forward drink')
      const extraReads = bar.calls('GET', campariExtra).length

      await navLink(page, 'Shelf').click()
      await expect(count(page)).toHaveText('12 bottles on the shelf.')
      await removeButton(page, 'Gin').click()
      await expect(removalToast(page)).toBeVisible()
      await expect.poll(() => bar.model.shelf.has(I.gin)).toBe(false)
      await expect(count(page)).toHaveText('11 bottles on the shelf.')

      await navLink(page, 'Tonight').click()
      // Without gin the Negroni waits on two bottles: Campari opens nothing.
      await expect(meta(page, 'Campari')).toHaveText('In 1 drink')
      await expect(listItem(page, 'Campari')).not.toContainText('Unlocks')
      expect(bar.calls('GET', campariExtra).length).toBeGreaterThan(extraReads)
    })
  })

  test.describe('with gin on the shelf, read on Tonight only after it is gone', () => {
    test.use({ world: campariListed() })

    test('the removal’s Undo puts the unlock back on the row', async ({ page, bar }) => {
      // Tonight has not been shown, so its first read of the row already follows the removal.
      await page.goto('/shelf')
      await expect(count(page)).toHaveText('12 bottles on the shelf.')
      await removeButton(page, 'Gin').click()
      await expect(undoButton(page)).toBeVisible()
      await expect.poll(() => bar.model.shelf.has(I.gin)).toBe(false)

      await navLink(page, 'Tonight').click()
      await expect(meta(page, 'Campari')).toHaveText('In 1 drink')
      const extraReads = bar.calls('GET', campariExtra).length

      // The Undo outlives the Shelf screen; it is tapped on Tonight.
      await undoButton(page).click()
      await expect.poll(() => bar.model.shelf.has(I.gin)).toBe(true)
      await expect(meta(page, 'Campari')).toHaveText('Unlocks 1·\u200A1 spirit-forward drink')
      expect(bar.calls('GET', campariExtra).length).toBeGreaterThan(extraReads)
    })
  })

  test.describe('with gin off the shelf', () => {
    test.use({
      world: campariListed((w) => {
        w.shelf = w.shelf.filter((id) => id !== I.gin)
      }),
    })

    test('a bottle added by its chip on the Shelf puts its unlock on the row on Tonight', async ({ page, bar }) => {
      await page.goto('/tonight')
      await expect(meta(page, 'Campari')).toHaveText('In 1 drink')
      await expect(listItem(page, 'Campari')).not.toContainText('Unlocks')
      const extraReads = bar.calls('GET', campariExtra).length

      await navLink(page, 'Shelf').click()
      await expect(count(page)).toHaveText('11 bottles on the shelf.')
      await search(page).fill('Gin')
      await expect(chip(page, 'Gin')).toHaveAttribute('aria-pressed', 'false')
      await chip(page, 'Gin').click()
      await expect(chip(page, 'Gin')).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(() => bar.model.shelf.has(I.gin)).toBe(true)

      await navLink(page, 'Tonight').click()
      await expect(meta(page, 'Campari')).toHaveText('Unlocks 1·\u200A1 spirit-forward drink')
      expect(bar.calls('GET', campariExtra).length).toBeGreaterThan(extraReads)
    })
  })
})
