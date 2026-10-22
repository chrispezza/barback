import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { I, defaultWorld } from '../test/fixtures/world'
import { expect, test } from './support/test'

// The family bar from the keyboard, on both screens it spans (frontend-spec §7,
// FamilyBar: "segmented, single-select, caps utility voice; arrow-key
// navigation"; §6: the family lives in the URL; chrispezza/barback#138).
// ADR-003 asks for focus handled deliberately, by the design system's keyboard
// rules: "Chips, steppers and the filter bar are fully keyboard operable."
//
// The bar is one Tab stop, at the pressed family: Tab reaches it once and the
// next Tab leaves it. ArrowLeft and ArrowRight move the focus along it,
// wrapping at the ends; Home and End jump to them. Moving selects nothing,
// since every selection navigates: Enter or Space selects the focused family,
// which then holds the Tab stop. Once the focus has left the bar, coming back
// lands on the pressed family again, not on the last one the arrows visited.
// The buttons keep role="group" and aria-pressed (e2e/index.spec.ts,
// e2e/tonight.spec.ts and e2e/nav-family.spec.ts query them so).

/** The default bar with the Whiskey Sour's egg white on the shelf, as e2e/tonight.spec.ts. */
const world = defaultWorld()
world.shelf.push(I.eggWhite)
test.use({ world })

const familyBar = (page: Page) => page.getByRole('group', { name: 'Drink family' })
const segment = (page: Page, name: string) => familyBar(page).getByRole('button', { name, exact: true })

/** Where the focus is, relative to the family bar: a segment's label, or before or after the bar. */
function focusIs(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement
    const bar = document.querySelector('[role="group"][aria-label="Drink family"]')
    if (!el || el === document.body || !bar) return 'nowhere'
    if (bar.contains(el)) return el.textContent ?? ''
    return bar.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after the bar' : 'before the bar'
  })
}

/**
 * Press Tab from the top of the page until the focus has passed the family
 * bar, and return the segments it stopped on in between, in order.
 */
async function tabThroughTheBar(page: Page): Promise<string[]> {
  const stops: string[] = []
  for (let presses = 0; presses < 80; presses += 1) {
    await page.keyboard.press('Tab')
    const where = await focusIs(page)
    if (where === 'after the bar') return stops
    if (where !== 'before the bar' && where !== 'nowhere') stops.push(where)
  }
  throw new Error(`Tab never passed the family bar; it stopped on ${JSON.stringify(stops)}`)
}

const SCREENS = [
  { name: 'Tonight', path: '/tonight', ready: 'You can pour · 5' },
  { name: 'the Index', path: '/drinks', ready: 'The index · 15' },
] as const

for (const screen of SCREENS) {
  test.describe(`the family bar on ${screen.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(screen.path)
      await expect(page.getByRole('heading', { name: screen.ready, exact: true })).toBeVisible()
      await expect(segment(page, 'ALL')).toHaveAttribute('aria-pressed', 'true')
    })

    test('is one Tab stop, at the pressed family', async ({ page }) => {
      expect(await tabThroughTheBar(page)).toEqual(['ALL'])
      // Back into the bar lands on the same one stop, and once more leaves it:
      // for what comes before it, or, where nothing does (the Index on a
      // phone, whose nav follows the screen), for the browser's own controls.
      await page.keyboard.press('Shift+Tab')
      await expect(segment(page, 'ALL')).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      expect(['before the bar', 'nowhere']).toContain(await focusIs(page))
    })

    test('moves the focus with the arrow keys, and selects with Enter or Space', async ({ page }) => {
      const path = new RegExp(`${screen.path}$`)
      await tabThroughTheBar(page)
      await page.keyboard.press('Shift+Tab')
      await expect(segment(page, 'ALL')).toBeFocused()

      // ArrowRight moves the focus and selects nothing.
      await page.keyboard.press('ArrowRight')
      await expect(segment(page, 'SOUR')).toBeFocused()
      await expect(segment(page, 'ALL')).toHaveAttribute('aria-pressed', 'true')
      await expect(segment(page, 'SOUR')).toHaveAttribute('aria-pressed', 'false')
      await expect(page).toHaveURL(path)

      // Enter selects the family under the focus, which keeps it.
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`${screen.path}\\?family=sour$`))
      await expect(segment(page, 'SOUR')).toHaveAttribute('aria-pressed', 'true')
      await expect(segment(page, 'ALL')).toHaveAttribute('aria-pressed', 'false')
      await expect(segment(page, 'SOUR')).toBeFocused()

      // So does Space.
      await page.keyboard.press('ArrowRight')
      await expect(segment(page, 'SPIRIT-FORWARD')).toBeFocused()
      await expect(page).toHaveURL(new RegExp(`${screen.path}\\?family=sour$`))
      await page.keyboard.press('Space')
      await expect(page).toHaveURL(new RegExp(`${screen.path}\\?family=spirit-forward$`))
      await expect(segment(page, 'SPIRIT-FORWARD')).toHaveAttribute('aria-pressed', 'true')
      await expect(segment(page, 'SPIRIT-FORWARD')).toBeFocused()

      // End and Home jump to the ends; the arrows wrap past them. The bar
      // pans in its wrapper on a phone, so the focused end is brought into view.
      await page.keyboard.press('End')
      await expect(segment(page, 'DESSERT')).toBeFocused()
      await expect(segment(page, 'DESSERT')).toBeInViewport()
      await page.keyboard.press('ArrowRight')
      await expect(segment(page, 'ALL')).toBeFocused()
      await expect(segment(page, 'ALL')).toBeInViewport()
      await page.keyboard.press('ArrowLeft')
      await expect(segment(page, 'DESSERT')).toBeFocused()
      await page.keyboard.press('Home')
      await expect(segment(page, 'ALL')).toBeFocused()
      await expect(page).toHaveURL(new RegExp(`${screen.path}\\?family=spirit-forward$`))

      // Tab leaves the bar from wherever the focus is in it, and coming back
      // lands on the pressed family.
      await page.keyboard.press('Tab')
      expect(await focusIs(page)).toBe('after the bar')
      await page.keyboard.press('Shift+Tab')
      await expect(segment(page, 'SPIRIT-FORWARD')).toBeFocused()
    })

    test('passes the accessibility checks with the focus on it', async ({ page }) => {
      await tabThroughTheBar(page)
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('ArrowRight')
      await expect(segment(page, 'SOUR')).toBeFocused()
      const results = await new AxeBuilder({ page })
        .include('[role="group"][aria-label="Drink family"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(results.violations).toEqual([])
    })
  })
}
