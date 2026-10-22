import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './support/test'

// Two of Tonight's controls against the design system's floor ("Visual
// foundations"), on both projects.
//
// - Target size. "Every interactive target is at least 44px" (Spacing &
//   layout; WCAG 2.5.8). The status line's three counts ("You can pour 5 · 7
//   one bottle away · 0 to buy") are each a link to their section, set in the
//   line's own display type, so the glyphs alone are a target about 12 × 29
//   px. What a tap reaches is measured as the browser hit-tests it
//   (elementFromPoint), not as the glyph box: the line keeps its layout and
//   type, and each count still has a 44 × 44 area that is its own. Focused from
//   the keyboard, a count still wears the system's ring ("Focus": 2px solid
//   brass, 2px offset, never restyled per component).
// - Contrast. "Every text pair in use passes AA", and "brass never carries
//   small body copy on a card" (Accessibility: brass-500 on the card surface
//   #1E4438 is ≈ 4.5:1). Buy next's one action is on that card (ADR-008: "the
//   one decision-ready card"); no WCAG 2.2 A or AA rule axe checks is broken on
//   Tonight with it showing (WCAG 1.4.3).

/** The system's minimum interactive target (`--tap-min`). */
const TAP_MIN = 44

/** The default bar's whole-bar counts, as e2e/harness.spec.ts reads them. */
const STATUS = 'You can pour 5 · 7 one bottle away · 0 to buy'

const status = (page: Page) => page.locator('.bar-status')
const buyNext = (page: Page) => page.locator('#buy .buy-next')

/** Where a tap on a link lands on it, as the browser hit-tests the page. */
interface HitArea {
  left: number
  top: number
  width: number
  height: number
  /** Whether a tap just inside each corner of that box lands on the link too. */
  corners: boolean
}

/**
 * The link's hit area: from the middle of its glyphs, outward along each axis,
 * the run of points where `elementFromPoint` answers the link (or something
 * inside it), each edge found to a hundredth of a pixel; then the four corners
 * of the box those runs span, so the area is a box and not a cross.
 */
async function hitArea(link: Locator): Promise<HitArea> {
  await link.scrollIntoViewIfNeeded()
  return link.evaluate((a) => {
    const lands = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)
      return el !== null && a.contains(el)
    }
    /** Step out from `from` (which lands) a pixel at a time, then close in on the edge. */
    const edge = (from: number, dir: 1 | -1, at: (v: number) => boolean) => {
      let inside = from
      let outside = from + dir
      while (at(outside) && Math.abs(outside - from) < 200) {
        inside = outside
        outside += dir
      }
      for (let i = 0; i < 20; i++) {
        const mid = (inside + outside) / 2
        if (at(mid)) inside = mid
        else outside = mid
      }
      return (inside + outside) / 2
    }
    const box = a.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const left = edge(cx, -1, (x) => lands(x, cy))
    const right = edge(cx, 1, (x) => lands(x, cy))
    const top = edge(cy, -1, (y) => lands(cx, y))
    const bottom = edge(cy, 1, (y) => lands(cx, y))
    const round = (v: number) => Math.round(v * 100) / 100
    const corners = [
      { x: left + 0.5, y: top + 0.5 },
      { x: right - 0.5, y: top + 0.5 },
      { x: left + 0.5, y: bottom - 0.5 },
      { x: right - 0.5, y: bottom - 0.5 },
    ].every(({ x, y }) => lands(x, y))
    return { left, top, width: round(right - left), height: round(bottom - top), corners }
  })
}

/** Tap (phone) or click (desktop) the page at one point. */
async function tapAt(page: Page, touch: boolean, x: number, y: number) {
  if (touch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

/** No WCAG 2.2 A or AA rule axe checks is broken on the page as it stands. */
async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} (${n.failureSummary ?? ''})`).join(', ')}`,
    ),
  ).toEqual([])
}

test.describe('Tonight’s status line', () => {
  test('gives each count a 44 × 44 target of its own, and a tap anywhere in it goes to the section', async ({
    page,
  }, testInfo) => {
    const touch = testInfo.project.use.hasTouch === true
    await page.goto('/tonight')
    await expect(status(page)).toHaveText(STATUS)

    for (const [hash, count] of [
      ['#near', '7'],
      ['#buy', '0'],
      ['#pour', '5'],
    ] as const) {
      await page.evaluate(() => window.scrollTo(0, 0))
      const link = status(page).getByRole('link', { name: count, exact: true })
      await expect(link).toHaveAttribute('href', hash)
      const area = await hitArea(link)
      const size = `${area.width} × ${area.height}`
      expect.soft(area.width, `the ${count} link's hit area is ${size}`).toBeGreaterThanOrEqual(TAP_MIN)
      expect.soft(area.height, `the ${count} link's hit area is ${size}`).toBeGreaterThanOrEqual(TAP_MIN)
      expect.soft(area.corners, `the ${count} link's hit area is a box`).toBe(true)

      // Its far corner, clear of the glyphs, is the link's as much as they are.
      await tapAt(page, touch, area.left + 1, area.top + 1)
      await expect(page).toHaveURL(new RegExp(`/tonight${hash}$`))
      await expect(page.locator(hash)).toBeFocused()
    }
  })

  test('keeps the system’s focus ring on each count', async ({ page }) => {
    await page.goto('/tonight')
    await expect(status(page)).toHaveText(STATUS)

    for (const count of ['5', '7', '0']) {
      const link = status(page).getByRole('link', { name: count, exact: true })
      for (let i = 0; i < 40 && !(await link.evaluate((el) => el === document.activeElement)); i++) {
        await page.keyboard.press('Tab')
      }
      await expect(link).toBeFocused()
      await expect(link).toHaveCSS('outline-style', 'solid')
      await expect(link).toHaveCSS('outline-width', '2px')
      await expect(link).toHaveCSS('outline-color', 'rgb(198, 161, 91)')
      await expect(link).toHaveCSS('outline-offset', '2px')
    }
  })
})

test.describe('Tonight’s Buy next card', () => {
  test('carries its action in text that passes AA on the card', async ({ page }) => {
    await page.goto('/tonight')
    await expect(status(page)).toHaveText(STATUS)
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Scotch whisky')
    await expect(buyNext(page).getByRole('button', { name: 'List it' })).toBeEnabled()

    await expectNoAxeViolations(page)
  })
})
