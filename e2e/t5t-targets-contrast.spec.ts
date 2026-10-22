import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
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
//   type, and on one line each count has a 44 × 44 area that is its own.
//   Focused from the keyboard, a count still wears the system's ring ("Focus":
//   2px solid brass, 2px offset, never restyled per component).
// - Stacked counts. At a narrow width, longer counts wrap the line so one
//   count sits under another at the line's 28px pitch ("You can pour 24 · 38
//   one / bottle away · 3 to buy" at 320px, the WCAG 1.4.10 reflow width).
//   Two 44px areas cannot both fit there, so they share the strip between the
//   two counts; what is never shared is a count's own digits, which a tap
//   anywhere on reaches that count and no other.
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

/** Bottles off the default shelf, to list as many as a spec asks for. */
const OFF_SHELF = [I.campari, I.cointreau, I.dryVermouth, I.tequila, I.cognac, I.vodka, I.rye] as const

/**
 * The default bar (5 pour, 7 one bottle away, nothing listed) with drinks
 * added until `pour` pour and `near` are one bottle away, and the first `buy`
 * off-shelf bottles listed: the status line's counts at any length.
 */
function barCounting(pour: number, near: number, buy: number): WorldSeed {
  const world = defaultWorld()
  for (let n = 1; n <= pour - 5; n += 1) {
    world.cocktails.push({
      id: 2000 + n,
      name: `House daiquiri ${String(n).padStart(3, '0')}`,
      tagIds: [],
      lines: [
        { ingredientId: I.whiteRum, amount: 60, units: 'ml' },
        { ingredientId: I.limeJuice, amount: 22.5, units: 'ml' },
        { ingredientId: I.simpleSyrup, amount: 22.5, units: 'ml' },
      ],
      instructions: 'Shake with ice and strain.',
    })
  }
  for (let n = 1; n <= near - 7; n += 1) {
    world.cocktails.push({
      id: 3000 + n,
      name: `House spritz ${String(n).padStart(3, '0')}`,
      tagIds: [],
      lines: [
        { ingredientId: I.whiteRum, amount: 30, units: 'ml' },
        { ingredientId: I.campari, amount: 30, units: 'ml' },
        { ingredientId: I.clubSoda, amount: 90, units: 'ml' },
      ],
      instructions: 'Build over ice.',
    })
  }
  world.list = OFF_SHELF.slice(0, buy)
  return world
}

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

/**
 * Where a tap on a link's own digits lands when it does not land on the link:
 * every point of its glyph box on a 1px grid, as `elementFromPoint` answers
 * it, 2px in from the box's edge. The edge itself is not the digits': two
 * lines' glyph boxes overlap there (29px boxes at a 28.3px pitch), and the
 * browser hit-tests a line's text about a pixel up and left of the box it
 * reports, so the next line's text already answers 1.6px above this box's
 * foot. One entry per place a stray point lands, with how many of how many.
 */
async function strayPoints(link: Locator): Promise<string[]> {
  return link.evaluate((a) => {
    const INSET = 2
    let points = 0
    const strays = new Map<string, number>()
    for (const r of a.getClientRects()) {
      for (let y = r.top + INSET + 0.5; y < r.bottom - INSET; y += 1) {
        for (let x = r.left + INSET + 0.5; x < r.right - INSET; x += 1) {
          points += 1
          const el = document.elementFromPoint(x, y)
          if (el !== null && a.contains(el)) continue
          const onto = el?.closest('a')?.getAttribute('href') ?? el?.tagName.toLowerCase() ?? 'nothing'
          strays.set(onto, (strays.get(onto) ?? 0) + 1)
        }
      }
    }
    return [...strays].map(([onto, n]) => `${n} of ${points} points land on ${onto}`)
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

// Count sets that wrap the line with the last count under the first: two
// digits each at 320px, the reflow width, and a three-digit near count at
// 334px, the widest width at which those counts still stack.
for (const { pour, near, buy, width } of [
  { pour: 24, near: 38, buy: 3, width: 320 },
  { pour: 48, near: 104, buy: 7, width: 334 },
]) {
  test.describe(`Tonight’s status line, "${pour} · ${near} · ${buy}" at ${width}px`, () => {
    test.use({ world: barCounting(pour, near, buy) })

    test('keeps each count’s digits its own where one count sits under another', async ({ page }, testInfo) => {
      const touch = testInfo.project.use.hasTouch === true
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/tonight')
      await expect(status(page)).toHaveText(`You can pour ${pour} · ${near} one bottle away · ${buy} to buy`)
      await page.evaluate(() => window.scrollTo(0, 0))

      const counts = [
        ['#pour', String(pour)],
        ['#near', String(near)],
        ['#buy', String(buy)],
      ] as const
      const linkTo = (count: string) => status(page).getByRole('link', { name: count, exact: true })

      // The case this covers: the line has wrapped, and the last count's
      // 44px area would meet the first's, centre to centre closer than 44px
      // both ways.
      const first = await linkTo(String(pour)).boundingBox()
      const last = await linkTo(String(buy)).boundingBox()
      if (first === null || last === null) throw new Error('a count has no box')
      const across = Math.abs(last.x + last.width / 2 - (first.x + first.width / 2))
      const down = last.y - first.y
      expect(down, `the ${buy} is on the line under the ${pour}`).toBeGreaterThan(0)
      expect(down, `the ${buy} is on the line under the ${pour}`).toBeLessThan(TAP_MIN)
      expect(across, `the ${buy} sits under the ${pour}`).toBeLessThan(TAP_MIN)

      for (const [hash, count] of counts) {
        await expect(linkTo(count)).toHaveAttribute('href', hash)
        expect.soft(await strayPoints(linkTo(count)), `taps on the ${count}’s own digits`).toEqual([])
      }

      // A real tap 5px inside the bottom, then the top, of each count's
      // digits goes to its own section; one hash after another, so each tap
      // changes the URL.
      for (const edge of ['bottom', 'top'] as const) {
        for (const [hash, count] of counts) {
          await page.evaluate(() => window.scrollTo(0, 0))
          const box = await linkTo(count).boundingBox()
          if (box === null) throw new Error(`the ${count} has no box`)
          const y = edge === 'bottom' ? box.y + box.height - 5 : box.y + 5
          await tapAt(page, touch, box.x + box.width / 2, y)
          await expect(page, `a tap 5px inside the ${edge} of the ${count}`).toHaveURL(new RegExp(`/tonight${hash}$`))
          await expect(page.locator(hash)).toBeFocused()
        }
      }
    })
  })
}

test.describe('Tonight’s Buy next card', () => {
  test('carries its action in text that passes AA on the card', async ({ page }) => {
    await page.goto('/tonight')
    await expect(status(page)).toHaveText(STATUS)
    await expect(buyNext(page).locator('.buy-next-name')).toHaveText('Scotch whisky')
    await expect(buyNext(page).getByRole('button', { name: 'List it' })).toBeEnabled()

    await expectNoAxeViolations(page)
  })
})
