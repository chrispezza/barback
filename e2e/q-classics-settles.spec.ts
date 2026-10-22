import type { Locator, Page, Request } from '@playwright/test'
import { C, I } from '../test/fixtures/world'
import { expect, test } from './support/test'

// What a Classics Choose button says while its favourite is out and once it is
// free again (frontend-spec §1, "favorite a classic"; §5, the optimistic flip
// rolled back on error). ADR-003 Validation: a toggle "reflects in UI in
// < 50 ms (optimistic), reconciles with API in the background". The Recipe
// screen's favourite already does (e2e/a-favourite-settles.spec.ts); the
// Classics roster is the same favourite, read through ['first-pours', barId].
//
// After toggle-favorite settles, useToggleFavorite reads the whole roster back:
// one GET /cocktails/{slug} per canonical slug, nineteen of them. The button is
// free again before that read lands, so it has to say what the bar answered
// without waiting for it (the answer is put on the roster as it comes:
// settleFavorite). While the favourite is out it says what the tap meant, and a
// refused favourite says what it was before the tap, again without waiting.
//
// And the un-choose receipt names the drink's listed bottles flatly ("Numbers
// are stated flatly", Content fundamentals): one listed bottle is "Its bottle".

const TOGGLE = /^\/cocktails\/\d+\/toggle-favorite$/

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One roster entry: the drink card and its Choose button. */
function entry(page: Page, name: string): Locator {
  return page.locator('.first-pour-item').filter({
    has: page.getByRole('heading', { level: 3, name: new RegExp(`^(Favorited )?${escape(name)}$`) }),
  })
}

function chooseButton(page: Page, name: string): Locator {
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
  await expect(entry(page, 'Margarita')).toBeVisible()
  await listed
}

const apiPath = (req: Request): string => new URL(req.url()).pathname.replace(/^\/bar\/api/, '')

const isFavouriteWrite = (req: Request): boolean => req.method() === 'POST' && TOGGLE.test(apiPath(req))

/** A roster read: GET /cocktails/{slug}-{barId}. Nothing else on this screen reads one cocktail. */
const isRosterRead = (req: Request): boolean =>
  req.method() === 'GET' && /^\/cocktails\/[^/]+$/.test(apiPath(req))

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

test.describe('a Choose says what the bar answered without waiting for the roster (ADR-003; §1, §5)', () => {
  test('a drink with nothing to queue reads Chosen once its button is free, before the roster is read back', async ({
    page,
    bar,
  }) => {
    await openRoster(page)
    const button = chooseButton(page, 'Daiquiri')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    // Hold the roster's read-back: the nineteen reads that follow the favourite.
    const roster = await hold(page, isRosterRead)

    // Daiquiri pours: nothing is missing, so the favourite is the whole change.
    await button.click()
    await expect(toast(page)).toHaveText('Daiquiri — favorited.')
    await roster.arrived
    await expect(button).toBeEnabled()
    // Free, and the roster read is still out: the button says what the bar answered.
    await expect(button).toHaveText('✓ Chosen', { timeout: 1000 })
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(bar.model.favorites.has(C.daiquiri)).toBe(true)

    roster.release()
    await expect(button).toHaveText('✓ Chosen')
    await expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  test('a drink reads Chosen while its favourite is out', async ({ page, bar }) => {
    await openRoster(page)
    const button = chooseButton(page, 'Daiquiri')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    const favourite = await hold(page, isFavouriteWrite)

    await button.click()
    await favourite.arrived
    // Optimistic: the tap's own way first, while the bar holds the write. The
    // button stays held until the favourite answers.
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })
    await expect(button).toHaveText('✓ Chosen')
    await expect(button).toBeDisabled()
    // Nothing is claimed before the bar answers.
    await expect(toast(page)).toHaveCount(0)

    favourite.release()
    await expect(toast(page)).toHaveText('Daiquiri — favorited.')
    await expect(button).toBeEnabled()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(bar.model.favorites.has(C.daiquiri)).toBe(true)
  })

  test('an un-choose reads Choose once its button is free, before the roster is read back', async ({ page, bar }) => {
    bar.model.favorites.add(C.daiquiri)
    await openRoster(page)
    const button = chooseButton(page, 'Daiquiri')
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    const roster = await hold(page, isRosterRead)

    await button.click()
    await expect(toast(page)).toHaveText('Daiquiri — removed from favorites.')
    await roster.arrived
    await expect(button).toBeEnabled()
    await expect(button).toHaveText('Choose', { timeout: 1000 })
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(bar.model.favorites.has(C.daiquiri)).toBe(false)
    roster.release()
  })

  test('a refused favourite reads Choose again as soon as it is refused, before the roster is read back', async ({
    page,
    bar,
  }) => {
    await openRoster(page)
    const button = chooseButton(page, 'Daiquiri')
    const favourite = await hold(page, isFavouriteWrite)
    bar.fail(TOGGLE, { method: 'POST', status: 500 })

    await button.click()
    await favourite.arrived
    const roster = await hold(page, isRosterRead)
    favourite.release()
    await expect(toast(page)).toHaveText('The favorite didn’t take.')
    await roster.arrived
    await expect(button).toBeEnabled()
    // The rollback, not the read-back: the roster read is still out.
    await expect(button).toHaveText('Choose', { timeout: 1000 })
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(bar.model.favorites.has(C.daiquiri)).toBe(false)
    roster.release()
  })
})

test.describe('the un-choose receipt counts its listed bottles flatly (Content fundamentals)', () => {
  test('one of the drink’s bottles on the list is “Its bottle”', async ({ page, bar }) => {
    bar.model.favorites.add(C.margarita)
    bar.model.list.set(I.tequila, 1)
    await openRoster(page)
    const button = chooseButton(page, 'Margarita')
    await expect(button).toHaveAttribute('aria-pressed', 'true')

    await button.click()
    await expect(toast(page)).toHaveText('Margarita — removed from favorites. Its bottle stays on the list.')
    expect([...bar.model.list.entries()]).toEqual([[I.tequila, 1]])
  })

  test('two of the drink’s bottles on the list are “Its bottles”', async ({ page, bar }) => {
    bar.model.favorites.add(C.margarita)
    bar.model.list.set(I.tequila, 1)
    bar.model.list.set(I.cointreau, 1)
    await openRoster(page)
    const button = chooseButton(page, 'Margarita')
    await expect(button).toHaveAttribute('aria-pressed', 'true')

    await button.click()
    await expect(toast(page)).toHaveText('Margarita — removed from favorites. Its bottles stay on the list.')
    expect([...bar.model.list.keys()].sort((a, b) => a - b)).toEqual([I.tequila, I.cointreau].sort((a, b) => a - b))
  })
})
