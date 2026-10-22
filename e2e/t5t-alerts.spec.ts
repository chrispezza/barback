import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { C, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// One failure, announced once; a Retry that says what it asks for; and focus
// that stays on the page once a Retry has answered (chrispezza/barback#71).
//
// WCAG 4.1.3 (status messages): an error line is announced as an alert. One
// read that several sections wait on, the bootstrap (/bars and /profile) or
// the shelf, is one failure, so it is one alert: the first section it stops
// says so with the alert, and every other section it stops shows the same
// error line without a second one. A failure that is a section's own is that
// section's alert, as before.
//
// Each section's Retry keeps its one visible word, RETRY, in the caps utility
// voice (the design system's "Iconography": affordances are words), and is
// named for what it asks again, so three of them on one screen are three
// different buttons to a screen reader.
//
// ADR-003 Consequences: "SPA routing/focus management must be handled
// deliberately for accessibility". A Retry that answers takes its error line
// away, and with it the focused button: focus moves to the heading of the
// part of the screen the line was in, never to <body>. Moved there from the
// keyboard, a Tonight section's heading wears the system's ring.

const ERROR = 'The bar didn’t answer — try again.'

const pour = (page: Page) => page.locator('#pour')
const near = (page: Page) => page.locator('#near')
const rail = (page: Page) => page.locator('#buy')
const main = (page: Page) => page.getByRole('main')

/** A section's error line, announced or not, and its Retry. */
const errorLine = (scope: Locator) => scope.locator('p', { hasText: ERROR })
const retryIn = (scope: Locator) => errorLine(scope).getByRole('button')

function world(change: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  change(w)
  return w
}

/** Both bootstrap reads drop, the first try and its one retry (src/app.tsx, retry: 1), then answer. */
function bootstrapDropsTwice(bar: FakeBar) {
  bar.fail(/^\/bars$/, { abort: true, times: 2 })
  bar.fail(/^\/profile$/, { abort: true, times: 2 })
}

/** The shelf read (GET /ingredients?filter[on_shelf]=true) fails, the first try and its one retry. */
function shelfFailsTwice(bar: FakeBar) {
  bar.fail(/^\/ingredients$/, { method: 'GET', status: 500, times: 2 })
}

/** No WCAG 2.2 A or AA rule axe checks is broken on the page as it stands. */
async function expectNoAxeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

/** What holds focus, as the DOM has it. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement
    return el === null || el === document.body ? 'body' : `${el.tagName.toLowerCase()} ${el.textContent ?? ''}`
  })

/**
 * The design system's focus ring ("Visual foundations", Focus): focus-visible
 * only, 2px solid brass, 2px offset, never restyled per component. A heading
 * focused from the keyboard wears it, not the browser's own.
 */
async function expectRing(target: Locator) {
  await expect(target).toBeFocused()
  await expect(target).toHaveCSS('outline-style', 'solid')
  await expect(target).toHaveCSS('outline-width', '2px')
  await expect(target).toHaveCSS('outline-color', 'rgb(198, 161, 91)')
  await expect(target).toHaveCSS('outline-offset', '2px')
}

/** At most this many Tab presses from where the screen left focus to any Retry. */
const TAB_BUDGET = 80

/**
 * Reach a Retry with Tab from where the screen left focus, as a keyboard user
 * would, and press it with Enter. Every Retry is in the tab order (frontend-spec
 * §7: "all interactive elements keyboard-operable"); one Tab cannot reach would
 * use up the budget and fail here.
 */
async function pressRetry(retry: Locator) {
  const page = retry.page()
  await expect(retry).toBeVisible()
  for (let i = 0; i < TAB_BUDGET && !(await retry.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab')
  }
  await expect(retry).toBeFocused()
  await page.keyboard.press('Enter')
}

test.describe('Tonight on a cold start with the API out of reach and no snapshot', () => {
  test('says so in each section, and announces the one failure once', async ({ page, bar }) => {
    bar.takeApiDown()
    await page.goto('/tonight')

    // Every section the bootstrap stops still says so, in the same voice.
    for (const section of [pour(page), near(page), rail(page)]) {
      await expect(errorLine(section)).toHaveCount(1)
      await expect(errorLine(section)).toBeVisible()
    }
    // One alert for the one failure: the first section's.
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(pour(page).getByRole('alert')).toContainText(ERROR)
    await expect(near(page).getByRole('alert')).toHaveCount(0)
    await expect(rail(page).getByRole('alert')).toHaveCount(0)
    await expectNoAxeViolations(page)
  })

  test('names what each Retry asks for, under the one word RETRY', async ({ page, bar }) => {
    bar.takeApiDown()
    await page.goto('/tonight')
    await expect(errorLine(rail(page))).toBeVisible()

    await expect(retryIn(pour(page))).toHaveAccessibleName('Retry the drinks you can pour')
    await expect(retryIn(near(page))).toHaveAccessibleName('Retry the drinks one bottle away')
    await expect(retryIn(rail(page))).toHaveAccessibleName('Retry the list')
    // The visible label is the word alone (caps utility voice; Label in Name).
    for (const section of [pour(page), near(page), rail(page)]) {
      await expect(retryIn(section)).toHaveText('Retry')
    }
  })

  test('a Retry that answers leaves focus on its section’s heading, not on the body', async ({ page, bar }) => {
    bootstrapDropsTwice(bar)
    await page.goto('/tonight')
    await expect(errorLine(pour(page))).toBeVisible()

    await pressRetry(retryIn(pour(page)))

    await expect(pour(page).locator('.card-list > li').first()).toBeVisible()
    await expect(errorLine(main(page))).toHaveCount(0)
    await expect.poll(() => focused(page)).toMatch(/^h2 You can pour/)
    await expectRing(pour(page).getByRole('heading', { level: 2, name: /^You can pour/ }))
  })
})

test.describe('Tonight with a shelf that cannot be read', () => {
  // A favourited Penicillin: once the shelf is read, Honey syrup is Buy next.
  test.use({ world: world((w) => (w.favorites = [C.penicillin])) })

  test('the pour section announces it; the rail says so without a second alert', async ({ page, bar }) => {
    shelfFailsTwice(bar)
    await page.goto('/tonight')

    await expect(errorLine(pour(page))).toBeVisible()
    await expect(errorLine(rail(page))).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(1)
    await expect(pour(page).getByRole('alert')).toContainText(ERROR)
    await expect(retryIn(pour(page))).toHaveAccessibleName('Retry the drinks you can pour')
    await expect(retryIn(rail(page))).toHaveAccessibleName('Retry the suggestions')
    await expect(retryIn(rail(page))).toHaveText('Retry')
    await expectNoAxeViolations(page)
  })

  test('the rail’s Retry, once it answers, leaves focus on To buy', async ({ page, bar }) => {
    shelfFailsTwice(bar)
    await page.goto('/tonight')
    await expect(errorLine(rail(page))).toBeVisible()

    await pressRetry(retryIn(rail(page)))

    await expect(rail(page).locator('.buy-next-name')).toHaveText('Honey syrup')
    await expect(errorLine(main(page))).toHaveCount(0)
    await expect.poll(() => focused(page)).toMatch(/^h2 To buy/)
    await expectRing(rail(page).getByRole('heading', { level: 2, name: /^To buy/ }))
  })
})

test.describe('another screen’s Retry, once it answers', () => {
  test('on the Shelf, leaves focus on the screen’s heading', async ({ page, bar }) => {
    bootstrapDropsTwice(bar)
    await page.goto('/shelf')
    await expect(errorLine(main(page))).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(1)

    await pressRetry(retryIn(main(page)))

    await expect(main(page).getByText('11 bottles on the shelf.')).toBeVisible()
    await expect(errorLine(main(page))).toHaveCount(0)
    await expect.poll(() => focused(page)).toBe('h1 Shelf')
    await expect(page.getByRole('heading', { level: 1, name: 'Shelf' })).toBeFocused()
  })

  test('on the Index, leaves focus on the section’s heading', async ({ page, bar }) => {
    bootstrapDropsTwice(bar)
    await page.goto('/drinks')
    await expect(errorLine(main(page))).toBeVisible()

    await pressRetry(retryIn(main(page)))

    await expect(main(page).locator('.card-list > li')).toHaveCount(15)
    await expect(errorLine(main(page))).toHaveCount(0)
    await expect.poll(() => focused(page)).toBe('h2 The index · 15')
    await expect(main(page).getByRole('heading', { level: 2, name: 'The index · 15' })).toBeFocused()
  })

  test('on a recipe with no heading yet, keeps focus in the screen', async ({ page, bar }) => {
    bar.fail(/^\/cocktails\/daiquiri-1$/, { method: 'GET', times: 2, status: 500 })
    await page.goto('/drinks/daiquiri-1')
    await expect(errorLine(main(page))).toBeVisible()

    await pressRetry(retryIn(main(page)))

    await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toBeVisible()
    await expect(errorLine(main(page))).toHaveCount(0)
    expect(await focused(page)).not.toBe('body')
    expect(await page.evaluate(() => document.activeElement?.closest('main') != null)).toBe(true)
  })
})
