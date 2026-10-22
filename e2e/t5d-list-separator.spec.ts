import type { Page } from '@playwright/test'
import { I, defaultWorld } from '../test/fixtures/world'
import { expect, test } from './support/test'

// The DS list row's detail line on screen: "Unlocks N", a "·" set 4px from
// each side, then the detail, on one baseline. The design system's
// ShoppingListItem now parts the count from the detail for assistive tech
// inside the component (chrispezza/barback#91; src/components/
// ShoppingListItem.test.tsx), and the line must look as it did: this pins the
// 4px either side of the "·" and the shared line, so it holds before the
// change and after it.

// The default bar with the Whiskey Sour's egg white on the shelf (as
// e2e/tonight.spec.ts) and Scotch whisky on the list: it opens the Rob Roy
// (spirit-forward) and the Bobby Burns (no family), so its row reads
// "Unlocks 2 · 1 spirit-forward drink".
const world = defaultWorld()
world.shelf.push(I.eggWhite)
world.list = [I.scotch]
test.use({ world })

const rowLine = (page: Page) =>
  page.locator('#buy .shopping-row-line').getByRole('button', { name: /^Scotch whisky/ }).locator('.bb-shop__meta')

test('the "·" sits 4px from the count and 4px from the detail, on one line with both', async ({ page }) => {
  await page.goto('/tonight')
  await expect(rowLine(page)).toHaveText('Unlocks 2· 1 spirit-forward drink')
  await page.evaluate(() => document.fonts.ready)
  const geometry = await rowLine(page).evaluate((meta) => {
    /** An element's boxes as laid out, one per run of text and per line. */
    const rects = (selector: string) => {
      const found = [...(meta.querySelector(selector)?.getClientRects() ?? [])]
      if (found.length === 0) throw new Error(`no ${selector}`)
      return found
    }
    // "Unlocks " and the count are two runs; the "·" follows the last.
    const unlocks = rects('.bb-shop__unlocks').at(-1)!
    const separator = rects('.bb-shop__sep')[0]!
    // The detail's first run: where the line goes on after the "·".
    const detail = rects(':scope > span:last-child')[0]!
    return {
      before: separator.left - unlocks.right,
      after: detail.left - separator.right,
      tops: [unlocks.top, separator.top, detail.top],
    }
  })
  expect(geometry.before).toBeCloseTo(4, 2)
  expect(geometry.after).toBeCloseTo(4, 2)
  expect(new Set(geometry.tops).size, `tops: ${JSON.stringify(geometry.tops)}`).toBe(1)
  await expect(page.getByRole('button', { name: /^Scotch whisky/ })).toHaveAccessibleName(
    'Scotch whisky Unlocks 2 1 spirit-forward drink',
  )
})
