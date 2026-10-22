import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './support/test'

// The recipe carries its own way back: "Standalone PWA has no browser chrome —
// the screen carries its own way back" (src/screens/DrinkDetail.tsx;
// frontend-spec §9 "back affordance"; ADR-007, the installed app). That way
// back stays in the app. It steps back only onto a screen of the app's own; a
// recipe opened from outside — a launch, a shared link, a link followed in a
// tab that has been somewhere else first — has no screen of the app behind it,
// and its way back is the index (ADR-003 Consequences: "SPA routing/focus
// management must be handled deliberately").
//
// The defect: Back read `history.length > 1` as "a screen of the app is behind
// me". A tab that has been anywhere before has a length over one, so on a
// recipe opened into it Back stepped out of the app: onto the page before, or,
// in a fresh Playwright tab, onto about:blank.
//
// The design system's Iconography: affordances are words, and the only marks
// are ◆ ✓ ·, so the button reads "Back", with no arrow before it.
//
// Each project drives the recipe as its width does: a click on desktop, a tap
// by touch on the phone.

const main = (page: Page) => page.getByRole('main')
const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true })
const back = (page: Page) => main(page).getByRole('button', { name: 'Back', exact: true })
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' })
// The rail's links carry a role hint after the label ("Shelf", "what you have").
const navLink = (page: Page, label: string) => mainNav(page).getByRole('link', { name: new RegExp(`^${label}`) })
const card = (page: Page, name: string) => main(page).getByRole('link', { name: new RegExp(`^${name}`) })
const historyLength = (page: Page) => page.evaluate(() => window.history.length)

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/** A page of another site, answered here so nothing leaves the browser. */
const ELSEWHERE = 'http://elsewhere.test/'

/** One tap on a touch screen, one click with a mouse. */
async function tap(target: Locator, hasTouch: boolean): Promise<void> {
  if (hasTouch) await target.tap()
  else await target.click()
}

async function openRecipe(page: Page): Promise<void> {
  await page.goto('/drinks/daiquiri-1')
  await expect(h1(page, 'Daiquiri')).toBeVisible()
}

async function expectIndex(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/drinks$/)
  await expect(h1(page, 'Drinks')).toBeVisible()
}

test.describe('opened from outside, the recipe’s Back stays in the app (§9, ADR-003, ADR-007)', () => {
  test('in a tab that has been somewhere first, Back goes to the index', async ({ page, hasTouch }) => {
    // A fresh tab opens on about:blank, so the recipe is its second entry: the
    // tab has a page behind the recipe, and none of it is the app's.
    await openRecipe(page)
    expect(await historyLength(page)).toBe(2)

    await tap(back(page), hasTouch)
    await expectIndex(page)
  })

  test('followed from another site’s page, Back goes to the index, not to that page', async ({
    page,
    hasTouch,
  }) => {
    await page.route(ELSEWHERE, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Elsewhere</title>' }),
    )
    await page.goto(ELSEWHERE)
    await openRecipe(page)

    await tap(back(page), hasTouch)
    await expectIndex(page)
  })

  test('left by the nav and returned to by the browser’s Back, Back still goes to the index', async ({
    page,
    hasTouch,
  }) => {
    await openRecipe(page)
    await tap(navLink(page, 'Shelf'), hasTouch)
    await expect(h1(page, 'Shelf')).toBeVisible()
    // The app has been used since the recipe opened, but what is behind the
    // recipe has not changed: still nothing of the app's.
    await page.goBack()
    await expect(page).toHaveURL(/\/drinks\/daiquiri-1$/)
    await expect(h1(page, 'Daiquiri')).toBeVisible()

    await tap(back(page), hasTouch)
    await expectIndex(page)
  })

  test('reloaded, Back still goes to the index', async ({ page, hasTouch }) => {
    await openRecipe(page)
    await page.reload()
    await expect(h1(page, 'Daiquiri')).toBeVisible()

    await tap(back(page), hasTouch)
    await expectIndex(page)
  })

  test('by keyboard, Enter on Back goes to the index and focus lands on its heading', async ({ page }) => {
    await openRecipe(page)
    await back(page).focus()
    await page.keyboard.press('Enter')

    await expectIndex(page)
    await expect(h1(page, 'Drinks')).toBeFocused()
  })
})

// Guards for what already held: reached from a screen of the app, Back steps
// back to that screen, spending the entry the tap made rather than adding one.
test.describe('reached from a screen of the app, the recipe’s Back steps back to it (§9)', () => {
  test('from Tonight, Back returns to Tonight and adds no entry', async ({ page, hasTouch }) => {
    await page.goto('/tonight')
    await expect(h1(page, 'Tonight')).toBeVisible()
    await tap(card(page, 'Daiquiri'), hasTouch)
    await expect(h1(page, 'Daiquiri')).toBeVisible()
    const length = await historyLength(page)

    await tap(back(page), hasTouch)
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(h1(page, 'Tonight')).toBeVisible()
    expect(await historyLength(page)).toBe(length)
  })

  test('reloaded, Back still returns to the screen the recipe was reached from', async ({ page, hasTouch }) => {
    await page.goto('/tonight')
    await expect(h1(page, 'Tonight')).toBeVisible()
    await tap(card(page, 'Daiquiri'), hasTouch)
    await expect(h1(page, 'Daiquiri')).toBeVisible()
    await page.reload()
    await expect(h1(page, 'Daiquiri')).toBeVisible()

    await tap(back(page), hasTouch)
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(h1(page, 'Tonight')).toBeVisible()
  })
})

test.describe('the way back is a word (design system Iconography)', () => {
  test('the button reads Back, with no glyph, at the 44px floor', async ({ page }) => {
    await openRecipe(page)
    await expect(back(page)).toHaveText('Back')
    await expect(back(page)).toHaveAccessibleName('Back')

    const box = await back(page).boundingBox()
    expect(box?.height).toBeGreaterThanOrEqual(44)
    expect(box?.width).toBeGreaterThanOrEqual(44)
  })

  test('opened from outside, the recipe passes the automated accessibility checks', async ({ page }) => {
    await openRecipe(page)
    await expect(back(page)).toBeVisible()
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([])
  })
})
