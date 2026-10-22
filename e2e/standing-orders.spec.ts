import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Standing orders on Tonight (ADR-008 Decision and Validation; frontend-spec
// §9 "Purchasing intelligence"). An out-of-stock staple from src/data/staples.ts
// is queued without a tap, with a toast naming it and a Staple note on its
// list row; a staple already on the list is left alone. Pins the effect that
// writes the list, which calls staplesToQueue (src/data/buy-next.ts).

function tonicOut(listed: number[] = []): WorldSeed {
  const w = defaultWorld()
  w.shelf = w.shelf.filter((id) => id !== I.tonic)
  w.list = listed
  return w
}

/** A shopping-list row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  page.locator('#buy .shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })

test.describe('a staple off the shelf', () => {
  test.use({ world: tonicOut() })

  test('queues itself once, with a toast and a Staple note on its row', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(page.getByText('Staples out — queued: Tonic.')).toBeVisible()
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await page.waitForLoadState('networkidle')
    expect(bar.calls('POST').map((c) => [c.path, c.body])).toEqual([
      ['/users/1/shopping-list/batch-store', { ingredients: [{ id: I.tonic }] }],
    ])
    expect([...bar.model.list.keys()]).toEqual([I.tonic])
  })
})

test.describe('a staple off the shelf and already listed', () => {
  test.use({ world: tonicOut([I.tonic]) })

  test('is not queued again', async ({ page, bar }) => {
    await page.goto('/tonight')
    // The Staple note shows once the staples have resolved, so the effect has run.
    await expect(listItem(page, 'Tonic')).toContainText('Staple')
    await page.waitForLoadState('networkidle')
    expect(bar.calls('POST')).toEqual([])
    await expect(page.getByText(/Staples out/)).toHaveCount(0)
  })
})
