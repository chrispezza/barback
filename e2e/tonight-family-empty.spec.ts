import type { Page } from '@playwright/test'
import { I, T, bareWorld, defaultWorld } from '../test/fixtures/world'
import { expect, test } from './support/test'

// What Tonight's pour section says when nothing pours (frontend-spec §5
// "Empty states are directive": "Tonight with an empty shelf says what to
// add"; §6 Journeys 2, "Family-aware empty states"). Whether the shelf is bare
// is a fact about the shelf (GET /ingredients?filter[on_shelf]=true), never
// about the counts under a family: Tonight's axis is stock state and the
// family only refines it (§6 "One primary axis per screen"). A stocked shelf
// with nothing in the active family within reach is told what to do about the
// family, not to stock the shelf.
//
// In the default world no tiki or dessert drink pours or is one bottle away;
// the shelf holds eleven bottles.

const pour = (page: Page) => page.locator('#pour')
const near = (page: Page) => page.locator('#near')

/** The pour section's empty-state heading (EmptyState renders an h3, as the
 *  drink cards do). */
const emptyTitle = (page: Page) => pour(page).locator('.bb-empty').getByRole('heading', { level: 3 })

for (const { suffix, plural } of [
  { suffix: 'tiki', plural: 'tiki drinks' },
  { suffix: 'dessert', plural: 'dessert drinks' },
]) {
  test.describe(`a stocked shelf under ?family=${suffix}, with nothing in it within reach`, () => {
    test('names the family and points at it, never calling the shelf bare', async ({ page }) => {
      await page.goto(`/tonight?family=${suffix}`)
      // The scoped counts have landed: both sections read zero for the family.
      await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText(`${plural} you can pour · 0`)
      await expect(near(page).getByRole('heading', { level: 2 })).toHaveText(`${plural} one bottle away · 0`)
      // The whole-bar status line stays whole-bar: the shelf pours plenty.
      await expect(page.locator('.bar-status')).toHaveText('You can pour 5 · 7 one bottle away · 0 to buy')

      await expect(emptyTitle(page)).toHaveText(`No ${plural} pour yet`)
      await expect(pour(page).locator('.bb-empty__body')).toHaveText(
        'None is one bottle away either — browse them to see what they call for.',
      )
      await expect(page.getByRole('heading', { name: 'The shelf is bare' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Stock the shelf' })).toHaveCount(0)
      // Nor the line that points at near misses, when there are none below it.
      await expect(page.getByText('the bottles below are one purchase away')).toHaveCount(0)
    })

    test('Browse leads to the Index under the same family', async ({ page }) => {
      await page.goto(`/tonight?family=${suffix}`)
      await pour(page).getByRole('button', { name: `Browse ${plural}` }).click()
      await expect(page).toHaveURL(new RegExp(`/drinks\\?family=${suffix}$`))
      await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
    })

    test('Show all families clears the family and Tonight pours again', async ({ page }) => {
      await page.goto(`/tonight?family=${suffix}`)
      await pour(page).getByRole('button', { name: 'Show all families' }).click()
      await expect(page).toHaveURL(/\/tonight$/)
      await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText('You can pour · 5')
      await expect(pour(page).locator('.bb-empty')).toHaveCount(0)
    })
  })
}

test.describe('switching family while the new counts are on their way', () => {
  // The cocktail reads keep the previous family's answer on screen until the
  // new one lands (TanStack placeholderData). That answer is about the old
  // family: no empty state may be decided from it under the new name.
  test('never says the new family is out of reach before its counts land', async ({ page, bar }) => {
    await page.goto('/tonight?family=tiki')
    await expect(emptyTitle(page)).toHaveText('No tiki drinks pour yet')

    bar.slowDown(1500)
    await page.getByRole('group', { name: 'Drink family' }).getByRole('button', { name: 'SOUR', exact: true }).click()
    await expect(page).toHaveURL(/\/tonight\?family=sour$/)
    // The sour reads have been asked for and not yet answered.
    await expect
      .poll(() => bar.calls('GET', /^\/cocktails$/).filter((c) => c.query.get('filter[tag_id]') === String(T.sour)).length)
      .toBeGreaterThan(0)
    expect(await pour(page).locator('.bb-empty').allInnerTexts()).toEqual([])

    await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText(/^sours you can pour · [1-9]/)
    await expect(pour(page).locator('.bb-empty')).toHaveCount(0)
  })
})

test.describe('a stocked shelf from which nothing pours and nothing is one bottle away', () => {
  // Mint alone: every drink that calls for it is three or more bottles away.
  test.use({ world: { ...defaultWorld(), shelf: [I.mint] } })

  test('says nothing pours yet, not that the shelf is bare', async ({ page }) => {
    await page.goto('/tonight')
    await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText('You can pour · 0')
    await expect(near(page).getByRole('heading', { level: 2 })).toHaveText('One bottle away · 0')
    await expect(emptyTitle(page)).toHaveText('Nothing pours yet')
    await expect(page.getByRole('heading', { name: 'The shelf is bare' })).toHaveCount(0)
    await expect(page.getByText('the bottles below are one purchase away')).toHaveCount(0)
    // Still directive: the way to the shelf is offered.
    await expect(pour(page).getByRole('button', { name: 'Stock the shelf' })).toBeVisible()
  })
})

test.describe('a stocked shelf from which nothing pours but some drinks are one bottle away', () => {
  // Gin alone: the Gin Tonic and the Martini are each one bottle away.
  test.use({ world: { ...defaultWorld(), shelf: [I.gin] } })

  test('points at the near misses below', async ({ page }) => {
    await page.goto('/tonight')
    await expect(near(page).getByRole('heading', { level: 2 })).toHaveText('One bottle away · 2')
    await expect(pour(page).locator('.bb-empty__body')).toHaveText(
      'Nothing pours yet — the bottles below are one purchase away.',
    )
    await expect(page.getByRole('heading', { name: 'The shelf is bare' })).toHaveCount(0)
  })
})

test.describe('a bare shelf', () => {
  test.use({ world: bareWorld() })

  for (const path of ['/tonight', '/tonight?family=tiki']) {
    test(`says the shelf is bare at ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(emptyTitle(page)).toHaveText('The shelf is bare')
      await expect(pour(page).getByRole('button', { name: 'Stock the shelf' })).toBeVisible()
      await expect(pour(page).locator('.bb-empty')).toHaveCount(1)
    })
  }
})
