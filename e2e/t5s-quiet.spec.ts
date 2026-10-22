import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { C, defaultWorld } from '../test/fixtures/world'
import { expect, test } from './support/test'

// The quiet lines and the small targets of the Shelf, the Index, the classics
// and the desktop rail, as the design system words and sizes them.
//
// - "The Back Bar Design System/readme.md", Content fundamentals: "Directive,
//   never apologetic. Empty states name the next action." A search that finds
//   nothing says what to do next, in the house voice.
// - Content fundamentals: "Ingredients are italic Caslon. The serif italic is
//   a semantic marker for ingredient names and editorial asides only — never
//   for emphasis in UI labels, and never for numbers." Visual foundations:
//   "Instrument Sans carries the interface: body copy, labels, counts". The
//   Shelf's count line and the rail's standing are counts
//   (chrispezza/barback#66, its Shelf and rail parts).
// - Visual foundations: "every interactive target is at least 44px". The
//   rail's brand link is the way home from every screen.
// - Iconography: the check ✓ marks the selected state "always alongside a
//   fill and a weight change"; Visual foundations: "State is never colour
//   alone". A toggle that shows ✓ is filled; the WAI-ARIA toggle button
//   carries its state in aria-pressed and keeps one name in both states.
// - ADR-003 Consequences: focus management "handled deliberately"; a toggle
//   pressed from the keyboard keeps the focus.
// - ADR-007 Consequences, "No stock answer is ever served stale": the rail's
//   standing says nothing while a read it is drawn from is in error
//   (chrispezza/barback#103). Its error voice clears once the reads answer:
//   after a screen's Retry has the bar answering again, the standing is
//   stated again on that screen, not on the next navigation
//   (chrispezza/barback#145).

const ERROR = 'The bar didn’t answer — try again.'
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const BRASS = 'rgb(198, 161, 91)'
const TAP_MIN = 44

/** What the Index's search says when nothing is named so. */
const INDEX_NOTHING = 'Nothing by that name — try fewer letters, or clear the search and browse by family.'
/** What the Shelf's "Add a bottle" picker says when nothing is named so. */
const SHELF_NOTHING = 'Nothing by that name — try fewer letters, or the kind of bottle rather than its brand.'

const STANDING = '11 bottles · 5 pourable'

const main = (page: Page) => page.getByRole('main')
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' })
/** The rail's standing line ("11 bottles · 5 pourable"); desktop only. */
const standing = (page: Page) => nav(page).getByText(/ bottles? · \d+ pourable$/)
const countLine = (page: Page) => page.locator('.shelf-count')
const favorites = (page: Page) => main(page).getByRole('button', { name: 'Favorites', exact: true })

/** Client-side navigation through the visible main nav (rail or tab bar). */
async function goTo(page: Page, label: string, heading: string) {
  await nav(page).getByRole('link', { name: new RegExp(`^${label}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

/** The face and style a line is set in, as the browser computes them. */
function faceOf(target: Locator) {
  return target.evaluate((el) => {
    const s = getComputedStyle(el)
    return { family: s.fontFamily.split(',')[0]?.trim().replace(/"/g, ''), style: s.fontStyle }
  })
}

const INTERFACE_FACE = { family: 'Instrument Sans', style: 'normal' }

/**
 * Drop every API request while armed, and keep the URLs it dropped.
 * Playwright asks the route registered last first, so this one is asked
 * before the fake, and passes every request on to it once lifted.
 */
async function outage(page: Page) {
  let down = true
  const dropped: URL[] = []
  await page.route(
    (url) => url.pathname.startsWith('/bar/api/'),
    (route) => {
      if (!down) return route.fallback()
      dropped.push(new URL(route.request().url()))
      return route.abort('connectionrefused')
    },
  )
  return {
    lift: () => {
      down = false
    },
    dropped: (matches: (url: URL) => boolean) => dropped.filter(matches).length,
  }
}

/** The rail's whole-bar can-pour count: GET /cocktails?filter[on_shelf]=true&per_page=1, no family. */
const isWholeBarCanPour = (url: URL) =>
  url.pathname === '/bar/api/cocktails' &&
  url.searchParams.get('filter[on_shelf]') === 'true' &&
  url.searchParams.get('per_page') === '1' &&
  !url.searchParams.has('filter[tag_id]')

test.describe('a search that finds nothing names the next action (Content fundamentals)', () => {
  test('the Index’s search says to try fewer letters, or to clear it and browse by family', async ({ page }) => {
    await page.goto('/drinks')
    await expect(main(page).getByRole('heading', { level: 2, name: 'The index · 15', exact: true })).toBeVisible()

    await page.getByRole('searchbox', { name: 'Find a drink' }).fill('zzz')

    await expect(main(page).getByRole('heading', { level: 2, name: 'Matches · 0', exact: true })).toBeVisible()
    await expect(main(page).getByText(INDEX_NOTHING, { exact: true })).toBeVisible()
  })

  test('the Shelf’s picker says to try fewer letters, or the kind of bottle', async ({ page }) => {
    await page.goto('/shelf')
    await expect(countLine(page)).toHaveText('11 bottles on the shelf.')

    await page.getByRole('searchbox', { name: 'Add a bottle' }).fill('zzz')

    await expect(main(page).locator('.chip-row').getByText(SHELF_NOTHING, { exact: true })).toBeVisible()
  })
})

test.describe('counts are set in the interface face, never italic Caslon (chrispezza/barback#66)', () => {
  test('the Shelf’s count line', async ({ page }) => {
    await page.goto('/shelf')
    await expect(countLine(page)).toHaveText('11 bottles on the shelf.')

    expect(await faceOf(countLine(page))).toEqual(INTERFACE_FACE)
  })

  test('the rail’s standing line', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the nav rail exists only at 900px and wider')
    await page.goto('/shelf')
    await expect(standing(page)).toHaveText(STANDING)

    expect(await faceOf(standing(page))).toEqual(INTERFACE_FACE)
  })
})

test.describe('the rail’s targets are at least 44px (Visual foundations)', () => {
  test.skip(({ isMobile }) => isMobile, 'the nav rail exists only at 900px and wider')

  test('the brand link home, and every other link and button in the rail', async ({ page }) => {
    await page.goto('/shelf')
    await expect(standing(page)).toHaveText(STANDING)

    const brand = nav(page).getByRole('link', { name: 'Barback', exact: true })
    const box = await brand.boundingBox()
    expect(box?.height, 'the brand link’s height').toBeGreaterThanOrEqual(TAP_MIN)
    expect(box?.width, 'the brand link’s width').toBeGreaterThanOrEqual(TAP_MIN)

    const targets = nav(page).locator('a, button')
    await expect(targets).toHaveCount(6)
    const sizes = await targets.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { name: el.textContent?.trim() ?? '', short: r.height < 44 || r.width < 44 }
      }),
    )
    expect(sizes.filter((s) => s.short).map((s) => s.name), 'rail targets under 44px').toEqual([])
  })
})

test.describe('the Index’s Favorites toggle shows its ✓ only with a fill (Iconography; state is never colour alone)', () => {
  // One favourite, so the pressed toggle lists a card rather than the empty
  // state, whose fleuron axe reports on every screen (the design system's
  // EmptyState, chrispezza/barback#168).
  test.use({ world: { ...defaultWorld(), favorites: [C.daiquiri] } })

  test('one name in both states, aria-pressed for the state, and the filled variant when pressed', async ({
    page,
  }) => {
    await page.goto('/drinks')
    await expect(main(page).getByRole('heading', { level: 2, name: 'The index · 15', exact: true })).toBeVisible()

    const toggle = favorites(page)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(toggle).not.toContainText('✓')

    await toggle.focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/drinks\?fav=1$/)
    await expect(main(page).getByRole('heading', { level: 2, name: 'Favorites · 1', exact: true })).toBeVisible()
    // The same control, under the same name, now pressed: the ✓ rides a brass fill.
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toContainText('✓')
    await expect.poll(() => toggle.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(BRASS)
    await expect(toggle).toBeFocused()
    expect((await new AxeBuilder({ page }).include('main').withTags(WCAG).analyze()).violations).toEqual([])

    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/drinks$/)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(toggle).not.toContainText('✓')
    await expect(toggle).toBeFocused()
  })
})

test.describe('the rail’s standing comes back with a screen’s Retry (chrispezza/barback#145)', () => {
  test.skip(({ isMobile }) => isMobile, 'the nav rail exists only at 900px and wider')

  const screens = [
    { label: 'Shelf', heading: 'Shelf', path: '/shelf' },
    { label: 'Drinks', heading: 'Drinks', path: '/drinks' },
    { label: 'Classics', heading: 'The classics', path: '/first-pours' },
  ]

  for (const screen of screens) {
    test(`on ${screen.heading}, once the bar answers its Retry`, async ({ page }) => {
      await page.goto(screen.path)
      await expect(standing(page)).toHaveText(STANDING)

      await goTo(page, 'Tonight', 'Tonight')
      const { lift, dropped } = await outage(page)
      await goTo(page, screen.label, screen.heading)

      // The screen says its reads failed; the rail's whole-bar count, asked
      // again as the rail came back, failed with its one retry, and the
      // standing says nothing.
      const alert = main(page).getByRole('alert')
      await expect(alert).toHaveCount(1)
      await expect(alert).toContainText(ERROR)
      await expect.poll(() => dropped(isWholeBarCanPour), { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
      await expect(standing(page)).toHaveCount(0)

      lift()
      await alert.getByRole('button', { name: 'Retry' }).click()

      await expect(main(page).getByRole('alert')).toHaveCount(0)
      await expect(standing(page)).toHaveText(STANDING)
    })
  }
})
