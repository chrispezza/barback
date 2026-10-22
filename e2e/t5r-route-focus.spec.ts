import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './support/test'

// Focus and the tab title after a client-side route change to a recipe the
// client has not read yet (/drinks/:slug; frontend-spec §1 "Recipe", §7).
//
// ADR-003 Consequences: "SPA routing/focus management must be handled
// deliberately for accessibility". After a client-side navigation the browser
// announces nothing, so the app names the screen in the tab and moves focus to
// its heading (src/app.tsx RouteEffects). A recipe the client has not read has
// no heading until the bar answers: the card that was tapped is gone, and
// focus must still land on the drink's name once it renders, never on <body>.
// It lands once, for the route change alone: a reader who has moved on, or a
// later render, keeps focus where it is.
//
// chrispezza/barback#108: while the recipe is fetched, or the read failed, the
// tab names the screen ("Recipe", frontend-spec §1), not the screen or drink
// left behind.
//
// bar.slowDown holds every API answer from the moment it is called, so the
// screen being left has already been read and the recipe has not.

const SLOW = 1500

const main = (page: Page) => page.getByRole('main')
const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true })
const fetching = (page: Page) => main(page).getByText('Fetching the recipe…', { exact: true })
const card = (scope: Locator, name: string) => scope.getByRole('link', { name: new RegExp(`^${name}`) })
const similarSection = (page: Page) =>
  main(page).locator('section', { has: page.getByRole('heading', { level: 2, name: 'In the same vein' }) })
const errorLine = (page: Page) => main(page).getByRole('alert')
const back = (page: Page) => main(page).getByRole('button', { name: '← Back' })

/** The focused element as markup, or "BODY" when nothing has focus. */
const focused = (page: Page) =>
  page.evaluate(() =>
    document.activeElement === document.body ? 'BODY' : (document.activeElement?.outerHTML ?? 'NONE'),
  )

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function openIndex(page: Page): Promise<Locator> {
  await page.goto('/drinks')
  await expect(h1(page, 'Drinks')).toBeVisible()
  const daiquiri = card(main(page), 'Daiquiri')
  await expect(daiquiri).toBeVisible()
  return daiquiri
}

test.describe('focus lands on the recipe’s heading once it is read (ADR-003, §7)', () => {
  test('from an Index card, opened by Enter', async ({ page, bar }) => {
    const daiquiri = await openIndex(page)
    bar.slowDown(SLOW)
    await daiquiri.focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/drinks\/daiquiri-1$/)
    await expect(fetching(page)).toBeVisible()
    await expect(h1(page, 'Daiquiri')).toBeFocused()
  })

  test('from a Tonight card', async ({ page, bar }) => {
    await page.goto('/tonight')
    const daiquiri = card(page.locator('#pour'), 'Daiquiri')
    await expect(daiquiri).toBeVisible()
    bar.slowDown(SLOW)
    await daiquiri.click()

    await expect(page).toHaveURL(/\/drinks\/daiquiri-1$/)
    await expect(fetching(page)).toBeVisible()
    await expect(h1(page, 'Daiquiri')).toBeFocused()
  })

  test('from an “In the same vein” card', async ({ page, bar }) => {
    await page.goto('/drinks/gimlet-1')
    const negroni = card(similarSection(page), 'Negroni')
    await expect(negroni).toBeVisible()
    bar.slowDown(SLOW)
    await negroni.click()

    await expect(page).toHaveURL(/\/drinks\/negroni-1$/)
    await expect(fetching(page)).toBeVisible()
    await expect(h1(page, 'Negroni')).toBeFocused()
  })

  test('once landed, a later render does not take focus back', async ({ page, bar }) => {
    const daiquiri = await openIndex(page)
    bar.slowDown(SLOW)
    await daiquiri.click()
    await expect(h1(page, 'Daiquiri')).toBeFocused()

    // The reader moves on while the similar drinks are still being read.
    await expect(similarSection(page)).toHaveCount(0)
    await page.keyboard.press('Tab')
    const moved = await focused(page)
    expect(moved).not.toBe('BODY')
    await expect(h1(page, 'Daiquiri')).not.toBeFocused()

    await expect(similarSection(page)).toBeVisible()
    expect(await focused(page)).toBe(moved)
    await expect(h1(page, 'Daiquiri')).not.toBeFocused()
  })

  test('a reader who moves on while it is read keeps their place', async ({ page, bar }) => {
    const daiquiri = await openIndex(page)
    bar.slowDown(SLOW)
    await daiquiri.click()
    await expect(fetching(page)).toBeVisible()

    // The reader goes to Back before the recipe arrives (a Tab from <body>
    // lands on the rail first on desktop and nowhere on the phone, so focus is
    // put there directly; it moves exactly as a Tab would).
    await back(page).focus()
    await expect(back(page)).toBeFocused()

    await expect(h1(page, 'Daiquiri')).toBeVisible()
    await expect(back(page)).toBeFocused()
    await expect(h1(page, 'Daiquiri')).not.toBeFocused()
  })

  // Guards for what already held: a screen whose heading is there at the route
  // change takes focus at once, as before.
  test('a recipe already read takes focus at once, and so does the screen Back returns to', async ({ page }) => {
    const daiquiri = await openIndex(page)
    await daiquiri.click()
    await expect(h1(page, 'Daiquiri')).toBeVisible()

    await page.goBack()
    await expect(h1(page, 'Drinks')).toBeFocused()

    await card(main(page), 'Daiquiri').click()
    await expect(h1(page, 'Daiquiri')).toBeFocused()
  })

  test('a cold deep link moves no focus: the page load is not a route change', async ({ page, bar }) => {
    bar.slowDown(SLOW)
    await page.goto('/drinks/daiquiri-1')
    await expect(fetching(page)).toBeVisible()
    await expect(h1(page, 'Daiquiri')).toBeVisible()
    expect(await focused(page)).toBe('BODY')
  })

  test('fetching and landed, the recipe passes the automated accessibility checks', async ({ page, bar }) => {
    const daiquiri = await openIndex(page)
    bar.slowDown(SLOW)
    await daiquiri.click()
    await expect(fetching(page)).toBeVisible()
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([])

    await expect(h1(page, 'Daiquiri')).toBeFocused()
    await expect(similarSection(page)).toBeVisible()
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([])
  })
})

test.describe('the tab names the screen while the recipe is read (#108)', () => {
  test('fetching after an Index card, the tab says Recipe, then the drink', async ({ page, bar }) => {
    const daiquiri = await openIndex(page)
    await expect(page).toHaveTitle('Drinks · Barback')
    bar.slowDown(SLOW)
    await daiquiri.click()

    await expect(fetching(page)).toBeVisible()
    await expect(page).toHaveTitle('Recipe · Barback')
    await expect(h1(page, 'Daiquiri')).toBeVisible()
    await expect(page).toHaveTitle('Daiquiri · Barback')
  })

  test('fetching after a similar drink, the tab drops the drink left behind', async ({ page, bar }) => {
    await page.goto('/drinks/gimlet-1')
    const negroni = card(similarSection(page), 'Negroni')
    await expect(negroni).toBeVisible()
    await expect(page).toHaveTitle('Gimlet · Barback')
    bar.slowDown(SLOW)
    await negroni.click()

    await expect(fetching(page)).toBeVisible()
    await expect(page).toHaveTitle('Recipe · Barback')
    await expect(h1(page, 'Negroni')).toBeVisible()
    await expect(page).toHaveTitle('Negroni · Barback')
  })

  test('a cold deep link names the screen while the bar is read', async ({ page, bar }) => {
    bar.slowDown(SLOW)
    await page.goto('/drinks/daiquiri-1')

    await expect(fetching(page)).toBeVisible()
    await expect(page).toHaveTitle('Recipe · Barback')
    await expect(h1(page, 'Daiquiri')).toBeVisible()
    await expect(page).toHaveTitle('Daiquiri · Barback')
  })

  test('when the read fails, the error line stands under Recipe, not the screen left behind', async ({
    page,
    bar,
  }) => {
    const daiquiri = await openIndex(page)
    // The read and the app's one retry (src/api/queries.ts useCocktail).
    bar.fail(/^\/cocktails\/daiquiri-1$/, { method: 'GET', times: 2 })
    await daiquiri.click()

    await expect(errorLine(page)).toContainText('The bar didn’t answer — try again.')
    await expect(page).toHaveTitle('Recipe · Barback')
    expect(bar.calls('GET', /^\/cocktails\/daiquiri-1$/)).toHaveLength(2)
  })

  test('when a recipe already read fails to read again, the tab names the screen, not the drink', async ({
    page,
    bar,
  }) => {
    const daiquiri = await openIndex(page)
    await daiquiri.click()
    await expect(h1(page, 'Daiquiri')).toBeVisible()
    await expect(page).toHaveTitle('Daiquiri · Barback')
    await page.goBack()
    await expect(h1(page, 'Drinks')).toBeVisible()

    // The recipe is cached; its read on the way back in, and the retry, fail.
    bar.fail(/^\/cocktails\/daiquiri-1$/, { method: 'GET', times: 2 })
    await card(main(page), 'Daiquiri').click()

    await expect(errorLine(page)).toContainText('The bar didn’t answer — try again.')
    await expect(h1(page, 'Daiquiri')).toHaveCount(0)
    await expect(page).toHaveTitle('Recipe · Barback')
  })

  test('when the read fails after a similar drink, the tab drops that drink’s name', async ({ page, bar }) => {
    await page.goto('/drinks/gimlet-1')
    const negroni = card(similarSection(page), 'Negroni')
    await expect(negroni).toBeVisible()
    bar.fail(/^\/cocktails\/negroni-1$/, { method: 'GET', times: 2 })
    await negroni.click()

    await expect(errorLine(page)).toContainText('The bar didn’t answer — try again.')
    await expect(page).toHaveTitle('Recipe · Barback')
  })
})
