import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page, Request } from '@playwright/test'
import { FIRST_POUR_SLUGS } from '../src/data/first-pours'
import { slugify } from '../test/fixtures/upstream'
import { C, defaultWorld } from '../test/fixtures/world'
import { expect, test } from './support/test'

// The Classics Choose toggles as a keyboard and screen-reader user meets them.
//
// - ADR-003 Consequences: "SPA routing/focus management must be handled
//   deliberately for accessibility (the design system's focus-visible and
//   keyboard rules)". frontend-spec §7: "all interactive elements
//   keyboard-operable, focus-visible 2px brass outline". A Choose held while a
//   choice is out keeps the focus the keyboard gave it: Chromium blurs a
//   focused button that gains the disabled attribute, and the focus does not
//   come back when the attribute goes.
// - WAI-ARIA Authoring Practices, toggle button: the label does not change
//   when the state does; aria-pressed carries the state. Twelve buttons all
//   named "Choose" say nothing about which drink each one chooses.
// - The Back Bar Design System readme, Iconography: the check ✓ marks a
//   selected state "always alongside a fill and a weight change". Visual
//   foundations: "State is never colour alone", and every text pair passes AA.

const TOGGLE = /^\/cocktails\/\d+\/toggle-favorite$/

const world = defaultWorld()

/** The roster as this bar resolves it: roster order, slugs it lacks dropped. */
const ROSTER = FIRST_POUR_SLUGS.flatMap((slug) => {
  const c = world.cocktails.find((x) => slugify(x.name) === slug)
  return c ? [c.name] : []
})

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One roster entry: the drink card and its Choose toggle. */
function entry(page: Page, name: string): Locator {
  return page.locator('.first-pour-item').filter({
    has: page.getByRole('heading', { level: 3, name: new RegExp(`^(Favorited )?${escape(name)}$`) }),
  })
}

/** The entry's one button, found by where it sits rather than by its name. */
function toggleIn(page: Page, name: string): Locator {
  return entry(page, name).getByRole('button')
}

function toast(page: Page): Locator {
  return page.locator('.toast-host').getByRole('status')
}

/** Open the Classics and wait until both the roster and the list have been read. */
async function openRoster(page: Page): Promise<void> {
  const listed = page.waitForResponse(
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith('/shopping-list'),
  )
  await page.goto('/first-pours')
  await expect(page.getByRole('heading', { level: 2, name: `The roster · ${ROSTER.length}` })).toBeVisible()
  await listed
}

const isFavouriteWrite = (req: Request): boolean =>
  req.method() === 'POST' && TOGGLE.test(new URL(req.url()).pathname.replace(/^\/bar\/api/, ''))

/**
 * Hold the API calls `match` picks until released; the fake then answers them
 * as upstream would. Playwright runs the newest route first, so this sits in
 * front of the fake and falls back to it. `arrived` resolves once the first
 * held call has been sent by the page.
 */
async function hold(
  page: Page,
  match: (req: Request) => boolean,
): Promise<{ arrived: Promise<void>; release: () => void }> {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let arrive = () => {}
  const arrived = new Promise<void>((resolve) => {
    arrive = resolve
  })
  await page.route('**/bar/api/**', async (route) => {
    if (match(route.request())) {
      arrive()
      await gate
    }
    await route.fallback()
  })
  return { arrived, release }
}

/**
 * Let the page act on a request it has just sent. TanStack tells its observers
 * on a zero timeout and Preact renders after that, so two frames cover both.
 */
async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

/**
 * What holds the focus: its tag and the drink of the roster entry it sits in,
 * or its tag alone outside one. The card's ◆ (Favorited) mark is left out of
 * the drink's name.
 */
function focusIsOn(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (el === null) return 'nothing'
    const item = el.closest('.first-pour-item')
    if (item === null) return el.tagName
    const name = (item.querySelector('h3')?.textContent ?? '?').replace('◆', '').trim()
    return `${el.tagName} in ${name}`
  })
}

/**
 * The toggle's computed fill once it has settled. The pointer is moved off
 * first, so no hover colour stands in for it, and the poll waits out the
 * 150ms state transition (DS Motion) from whatever it showed before.
 */
async function expectFill(page: Page, button: Locator, expected: string, message: string): Promise<void> {
  await page.mouse.move(0, 0)
  await expect.poll(() => button.evaluate((el) => getComputedStyle(el).backgroundColor), { message }).toBe(expected)
}

const BRASS = 'rgb(198, 161, 91)'
const NO_FILL = 'rgba(0, 0, 0, 0)'
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

test.describe('a held Choose keeps the focus it was given (ADR-003; §7)', () => {
  test('Enter on a focused Choose leaves the focus on it while the choice is out, and after', async ({
    page,
    bar,
  }) => {
    await openRoster(page)
    // Reach Negroni's toggle the way a keyboard does: its card link, then Tab.
    await entry(page, 'Negroni').getByRole('link').focus()
    await page.keyboard.press('Tab')
    const button = toggleIn(page, 'Negroni')
    await expect(button).toBeFocused()
    const favourite = await hold(page, isFavouriteWrite)

    await page.keyboard.press('Enter')
    await favourite.arrived
    await settled(page)
    // Held while the favourite is out, and still where the keyboard left it.
    expect(await focusIsOn(page), 'the focus while the choice is out').toBe('BUTTON in Negroni')
    await expect(button).toBeDisabled()
    await expect(button).toBeFocused()
    // A second Enter lands on the held toggle and sends nothing.
    await page.keyboard.press('Enter')

    favourite.release()
    await expect(toast(page)).toHaveText('Negroni — favorited, 1 bottle queued.')
    await expect(button).toBeEnabled()
    expect(await focusIsOn(page), 'the focus once the choice has answered').toBe('BUTTON in Negroni')
    await expect(button).toBeFocused()
    // The ring is the keyboard's: focus-visible, 2px solid brass, 2px offset.
    expect(await button.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
    expect(bar.calls('POST', TOGGLE)).toHaveLength(1)
    expect(bar.calls('POST', /\/shopping-list\/batch-store$/)).toHaveLength(1)
    expect(bar.model.favorites.has(C.negroni)).toBe(true)

    // The same toggle takes it off again from the keyboard, focus still in place.
    await page.keyboard.press('Enter')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(toast(page)).toHaveText('Negroni — removed from favorites. Its bottle stays on the list.', {
      timeout: 10_000,
    })
    await expect(button).toBeEnabled()
    expect(await focusIsOn(page)).toBe('BUTTON in Negroni')
    expect(bar.model.favorites.has(C.negroni)).toBe(false)
  })
})

test.describe('one toggle per drink, named for it (WAI-ARIA toggle button; §7)', () => {
  test('every Choose names its drink, and the name holds while aria-pressed carries the state', async ({
    page,
    bar,
  }) => {
    bar.model.favorites.add(C.margarita)
    await openRoster(page)
    const main = page.getByRole('main')
    await expect(page.locator('.first-pour-item')).toHaveCount(ROSTER.length)
    for (const name of ROSTER) {
      await expect(toggleIn(page, name), `${name}: one toggle`).toHaveCount(1)
      await expect(toggleIn(page, name)).toHaveAccessibleName(`Choose ${name}`)
      await expect(main.getByRole('button', { name: `Choose ${name}`, exact: true })).toHaveCount(1)
    }

    const margarita = main.getByRole('button', { name: 'Choose Margarita', exact: true })
    const negroni = main.getByRole('button', { name: 'Choose Negroni', exact: true })
    await expect(margarita).toHaveAttribute('aria-pressed', 'true')
    await expect(negroni).toHaveAttribute('aria-pressed', 'false')

    await negroni.click()
    await expect(toast(page)).toHaveText('Negroni — favorited, 1 bottle queued.')
    // The same name finds the same toggle: the state moved, the label did not.
    await expect(negroni).toHaveAttribute('aria-pressed', 'true')
    await expect(negroni).toBeEnabled()

    await margarita.click()
    await expect(margarita).toHaveAttribute('aria-pressed', 'false')
    await expect(margarita).toBeEnabled()
    expect(bar.model.favorites.has(C.margarita)).toBe(false)
    expect(bar.model.favorites.has(C.negroni)).toBe(true)
    // No toggle is renamed by its state.
    await expect(main.getByRole('button', { name: /Chosen/ })).toHaveCount(0)
    for (const name of ROSTER) {
      await expect(toggleIn(page, name)).toHaveAccessibleName(`Choose ${name}`)
    }
  })
})

test.describe('the pressed state is a fill and a ✓, never a ✓ alone (DS Iconography; Visual foundations)', () => {
  test('a chosen drink’s toggle is filled and carries the ✓; one not chosen has neither', async ({ page, bar }) => {
    bar.model.favorites.add(C.margarita)
    await openRoster(page)
    const chosen = toggleIn(page, 'Margarita')
    const open = toggleIn(page, 'Negroni')

    await expect(chosen).toHaveAttribute('aria-pressed', 'true')
    await expectFill(page, chosen, BRASS, 'the pressed toggle’s fill')
    await expect(chosen).toHaveText('✓ Choose')
    await expect(open).toHaveAttribute('aria-pressed', 'false')
    await expectFill(page, open, NO_FILL, 'the unpressed toggle’s fill')
    await expect(open).toHaveText('Choose')

    // Every toggle on the roster: a ✓ only where pressed, and only on the fill.
    for (const name of ROSTER) {
      const button = toggleIn(page, name)
      const pressed = (await button.getAttribute('aria-pressed')) === 'true'
      const text = (await button.textContent()) ?? ''
      expect(text.includes('✓'), `${name}: ✓ only when pressed`).toBe(pressed)
      await expectFill(page, button, pressed ? BRASS : NO_FILL, `${name}: filled only when pressed`)
    }

    // A tap flips Negroni to the same pressed state.
    await open.click()
    await expect(toast(page)).toHaveText('Negroni — favorited, 1 bottle queued.')
    await expect(open).toHaveAttribute('aria-pressed', 'true')
    await expect(open).toHaveText('✓ Choose')
    await expectFill(page, open, BRASS, 'the toggle pressed by the tap')
  })

  test('every Choose is a 44px target (DS Spacing & layout)', async ({ page }) => {
    await openRoster(page)
    for (const name of ROSTER) {
      const box = await toggleIn(page, name).boundingBox()
      expect(box, `${name}: on screen`).not.toBeNull()
      expect(box?.height ?? 0, `${name}: height`).toBeGreaterThanOrEqual(44)
      expect(box?.width ?? 0, `${name}: width`).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('axe finds nothing on the roster (WCAG 2.2 AA)', () => {
  test('with one drink chosen, and with a choice out', async ({ page, bar }) => {
    bar.model.favorites.add(C.margarita)
    await openRoster(page)
    const scan = () => new AxeBuilder({ page }).include('main').withTags(WCAG).analyze()

    expect((await scan()).violations, 'at rest').toEqual([])

    const favourite = await hold(page, isFavouriteWrite)
    await toggleIn(page, 'Negroni').click()
    await favourite.arrived
    await settled(page)
    expect((await scan()).violations, 'while the choice is out').toEqual([])
    favourite.release()
    await expect(toast(page)).toHaveText('Negroni — favorited, 1 bottle queued.')
  })
})
