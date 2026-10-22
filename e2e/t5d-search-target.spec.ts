import AxeBuilder from '@axe-core/playwright'
import type { Locator } from '@playwright/test'
import { expect, test } from './support/test'

// "Every interactive target is at least 44px" (the design system's Visual
// foundations, Spacing & layout). The search field's frame is 44px tall, but
// the input inside it was the frame less its two 1px borders, 42px, so the
// target a tap lands on was under the floor; and the 44px Clear inside that
// same 42px pushed the frame to 46px the moment a first character was typed,
// moving everything below it by 2px. The input and Clear each make the floor
// now, and the frame stays the 44px it was, empty or not. Measured on every
// screen with a search field, at both widths.

const SCREENS = [
  { name: 'the Shelf', path: '/shelf', field: 'Add a bottle', typed: 'cam' },
  { name: 'Tonight', path: '/tonight', field: 'Add to the list', typed: 'cam' },
  { name: 'the Index', path: '/drinks', field: 'Find a drink', typed: 'neg' },
] as const

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error(`${locator.toString()} has no box`)
  return b
}

for (const screen of SCREENS) {
  test(`the search field on ${screen.name} is a 44px target in a 44px frame, empty or not`, async ({ page }) => {
    await page.goto(screen.path)
    const input = page.getByRole('searchbox', { name: screen.field })
    const frame = page.locator('.bb-search', { has: input })
    await expect(input).toBeVisible()

    let outer = await box(frame)
    let target = await box(input)
    expect(outer.height, 'the frame, empty').toBeCloseTo(44, 1)
    expect(target.height, 'the input').toBeGreaterThanOrEqual(44)
    expect(target.y, 'the input inside its frame').toBeGreaterThanOrEqual(outer.y - 0.01)
    expect(target.y + target.height, 'the input inside its frame').toBeLessThanOrEqual(outer.y + outer.height + 0.01)

    await input.fill(screen.typed)
    const clear = frame.getByRole('button', { name: 'Clear search' })
    await expect(clear).toBeVisible()
    outer = await box(frame)
    target = await box(input)
    const clearBox = await box(clear)
    expect(outer.height, 'the frame, with Clear in it').toBeCloseTo(44, 1)
    expect(target.height, 'the input, with Clear beside it').toBeGreaterThanOrEqual(44)
    expect([clearBox.width, clearBox.height], 'Clear').toEqual([44, 44])
    expect(clearBox.y, 'Clear inside the frame').toBeGreaterThanOrEqual(outer.y - 0.01)
    expect(clearBox.y + clearBox.height, 'Clear inside the frame').toBeLessThanOrEqual(outer.y + outer.height + 0.01)

    const results = await new AxeBuilder({ page })
      .include('.bb-search')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
}
