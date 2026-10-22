import type { Locator, Page } from '@playwright/test'
import { expect, test } from './support/test'

// One tap on a main-nav link is one history entry, so Back — the browser's, or
// the system Back of the installed app (ADR-007), which has no browser chrome —
// returns to the screen the reader left in one press.
//
// ADR-003 Consequences: "SPA routing/focus management must be handled
// deliberately". The nav links (the desktop rail and the phone tab bar, both
// "Main") carry the family-aware hrefs of chrispezza/barback#27 and mark the
// current screen with aria-current (frontend-spec §6, nav-family.spec.ts); the
// brand mark in the rail links home (frontend-spec §9).
//
// The defect: one tap pushed two entries. From /drinks/gimlet-1, one tap on
// Shelf took history.length from 2 to 4, and Back stayed on /shelf.
//
// Each project drives the nav its width shows: the rail on desktop, the tab
// bar on the phone, tapped by touch there.

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' })
// The rail's links carry a role hint after the label ("Shelf", "what you have").
const navLink = (page: Page, label: string) => mainNav(page).getByRole('link', { name: new RegExp(`^${label}`) })
const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true })
const familyButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Drink family' }).getByRole('button', { name, exact: true })
const historyLength = (page: Page) => page.evaluate(() => window.history.length)

/** One tap on a touch screen, one click with a mouse. */
async function tap(target: Locator, hasTouch: boolean): Promise<void> {
  if (hasTouch) await target.tap()
  else await target.click()
}

async function openRecipe(page: Page): Promise<void> {
  await page.goto('/drinks/gimlet-1')
  await expect(h1(page, 'Gimlet')).toBeVisible()
}

test.describe('one tap on a nav link is one step back (ADR-003, ADR-007)', () => {
  test('from a recipe, Shelf adds one entry and Back returns to the recipe', async ({ page, hasTouch }) => {
    await openRecipe(page)
    const before = await historyLength(page)

    await tap(navLink(page, 'Shelf'), hasTouch)
    await expect(page).toHaveURL(/\/shelf$/)
    await expect(h1(page, 'Shelf')).toBeVisible()
    await expect(navLink(page, 'Shelf')).toHaveAttribute('aria-current', 'page')
    expect(await historyLength(page)).toBe(before + 1)

    await page.goBack()
    await expect(page).toHaveURL(/\/drinks\/gimlet-1$/)
    await expect(h1(page, 'Gimlet')).toBeVisible()
    await expect(navLink(page, 'Shelf')).not.toHaveAttribute('aria-current')
  })

  test('by keyboard, Enter on a nav link adds one entry and Back returns', async ({ page }) => {
    await openRecipe(page)
    const before = await historyLength(page)

    await navLink(page, 'Shelf').focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/shelf$/)
    await expect(h1(page, 'Shelf')).toBeVisible()
    expect(await historyLength(page)).toBe(before + 1)

    await page.goBack()
    await expect(page).toHaveURL(/\/drinks\/gimlet-1$/)
    await expect(h1(page, 'Gimlet')).toBeVisible()
  })

  test('a link that carries the family adds one entry, and Back brings the family back', async ({
    page,
    hasTouch,
  }) => {
    await page.goto('/tonight?family=sour')
    await expect(familyButton(page, 'SOUR')).toHaveAttribute('aria-pressed', 'true')
    await expect(navLink(page, 'Drinks')).toHaveAttribute('href', '/drinks?family=sour')
    const before = await historyLength(page)

    await tap(navLink(page, 'Drinks'), hasTouch)
    await expect(page).toHaveURL(/\/drinks\?family=sour$/)
    await expect(h1(page, 'Drinks')).toBeVisible()
    await expect(navLink(page, 'Drinks')).toHaveAttribute('aria-current', 'page')
    expect(await historyLength(page)).toBe(before + 1)

    await page.goBack()
    await expect(page).toHaveURL(/\/tonight\?family=sour$/)
    await expect(h1(page, 'Tonight')).toBeVisible()
    await expect(familyButton(page, 'SOUR')).toHaveAttribute('aria-pressed', 'true')
    await expect(navLink(page, 'Tonight')).toHaveAttribute('aria-current', 'page')
    await expect(navLink(page, 'Drinks')).not.toHaveAttribute('aria-current')
  })

  test('walking every screen by the nav, Back retraces each tap in one press', async ({ page, hasTouch }) => {
    await page.goto('/tonight')
    await expect(h1(page, 'Tonight')).toBeVisible()
    const before = await historyLength(page)

    await tap(navLink(page, 'Shelf'), hasTouch)
    await expect(h1(page, 'Shelf')).toBeVisible()
    await tap(navLink(page, 'Classics'), hasTouch)
    await expect(h1(page, 'The classics')).toBeVisible()
    await tap(navLink(page, 'Drinks'), hasTouch)
    await expect(h1(page, 'Drinks')).toBeVisible()
    expect(await historyLength(page)).toBe(before + 3)

    await page.goBack()
    await expect(page).toHaveURL(/\/first-pours$/)
    await expect(h1(page, 'The classics')).toBeVisible()
    await expect(navLink(page, 'Classics')).toHaveAttribute('aria-current', 'page')

    await page.goBack()
    await expect(page).toHaveURL(/\/shelf$/)
    await expect(h1(page, 'Shelf')).toBeVisible()
    await expect(navLink(page, 'Shelf')).toHaveAttribute('aria-current', 'page')

    await page.goBack()
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(h1(page, 'Tonight')).toBeVisible()
    await expect(navLink(page, 'Tonight')).toHaveAttribute('aria-current', 'page')
  })

  // A click with Ctrl or Cmd held is the browser's: it opens the screen in a
  // new tab, and this tab neither moves nor gains an entry for Back to spend.
  test('a modified click opens a new tab and leaves this one where it was', async ({ page, context }) => {
    // The new tab is not the page the fake bar answers for; it gets an empty
    // document at the door, so nothing it asks for leaves the browser. The
    // page's own routes come first and answer everything this tab asks for.
    await context.route('**/*', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>new tab</title>' }),
    )
    await page.goto('/tonight')
    await expect(h1(page, 'Tonight')).toBeVisible()
    const before = await historyLength(page)

    const opened = context.waitForEvent('page')
    await navLink(page, 'Shelf').click({ modifiers: ['ControlOrMeta'] })
    expect(await historyLength(page)).toBe(before)
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(navLink(page, 'Tonight')).toHaveAttribute('aria-current', 'page')

    const tab = await opened
    await expect(tab).toHaveURL(/\/shelf$/)
    await tab.close()
  })

  test('after a recipe reached through the nav, the recipe’s Back and then Back retrace the way in', async ({
    page,
    hasTouch,
  }) => {
    await page.goto('/tonight')
    await expect(h1(page, 'Tonight')).toBeVisible()

    await tap(navLink(page, 'Drinks'), hasTouch)
    await expect(h1(page, 'Drinks')).toBeVisible()
    await tap(page.getByRole('main').getByRole('link', { name: /^Daiquiri/ }), hasTouch)
    await expect(h1(page, 'Daiquiri')).toBeVisible()

    // The recipe carries its own way back (frontend-spec §9; DrinkDetail goBack).
    await tap(page.getByRole('main').getByRole('button', { name: '← Back' }), hasTouch)
    await expect(page).toHaveURL(/\/drinks$/)
    await expect(h1(page, 'Drinks')).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(h1(page, 'Tonight')).toBeVisible()
  })
})

test.describe('the brand mark is one step back too (frontend-spec §9)', () => {
  // The brand mark lives in the rail, which shows from 900px: a desktop, or a
  // touch tablet held landscape. Both projects open the rail at that width, so
  // the phone project taps it by touch.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
  })

  test('from a recipe, the brand mark adds one entry and Back returns to the recipe', async ({
    page,
    hasTouch,
  }) => {
    await openRecipe(page)
    const brand = mainNav(page).getByRole('link', { name: 'Barback', exact: true })
    await expect(brand).toHaveAttribute('href', '/tonight')
    const before = await historyLength(page)

    await tap(brand, hasTouch)
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(h1(page, 'Tonight')).toBeVisible()
    expect(await historyLength(page)).toBe(before + 1)

    await page.goBack()
    await expect(page).toHaveURL(/\/drinks\/gimlet-1$/)
    await expect(h1(page, 'Gimlet')).toBeVisible()
  })
})
