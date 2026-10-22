import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from './support/test'

// The Recipe screen (/drinks/:slug; frontend-spec §1, §9 "quiet loading/error
// voices") before it has a recipe to show. Three voices, each true:
//
// - The bar has no drink by that slug. Upstream answers GET /cocktails/{slug}
//   with firstOrFail (bar-assistant-reference
//   app/Http/Controllers/CocktailController.php:97-100), rendered as 404
//   "Resource not found." (app/Exceptions/Handler.php:64-67); the fake does the
//   same. A 404 is an answer, not a failure: asking again cannot change it, and
//   the screen says so directively and points at the index (Content
//   fundamentals: "Empty states name the next action").
// - The bar has not answered yet. On a cold deep link the recipe read waits on
//   GET /bars for the bar id; until then the screen is fetching, never missing.
// - The bar did not answer. A bootstrap read that failed is the error voice
//   with a Retry that asks for it again (ADR-007 Consequences: "screens that
//   need the API say so in the error voice"; chrispezza/barback#68).
// - The device is offline. TanStack's default networkMode ('online') does not
//   fail a read asked for while the browser reports itself offline: it pauses
//   it, and a paused read is neither loading nor in error. The bar cannot
//   answer, so the screen says so in the error voice, and the read goes out
//   again on reconnect.

const main = (page: Page) => page.getByRole('main')
const back = (page: Page) => page.getByRole('button', { name: '← Back' })
const notFoundLine = (page: Page) =>
  main(page).getByText('No drink by that name — the index has the rest.', { exact: true })
const toIndex = (page: Page) => main(page).getByRole('button', { name: 'Browse the index' })
const fetching = (page: Page) => main(page).getByText('Fetching the recipe…', { exact: true })
const daiquiri = (page: Page) => page.getByRole('heading', { level: 1, name: 'Daiquiri' })
const noSuchDrink = (page: Page) => page.getByRole('heading', { level: 1, name: 'No such drink', exact: true })

/**
 * The device's network as the page sees it. Offline, the browser reports
 * navigator.onLine false and fires "offline" (context.setOffline). Route
 * interception still answers while the context is offline, so this handler
 * drops every API request before it reaches the bar, as the network would.
 */
async function deviceNetwork(page: Page, context: BrowserContext) {
  let online = true
  await page.route('**/bar/api/**', (route) => (online ? route.fallback() : route.abort('internetdisconnected')))
  return {
    off: async () => {
      online = false
      await context.setOffline(true)
    },
    on: async () => {
      online = true
      await context.setOffline(false)
    },
  }
}

/** Neither the old nor the new not-found wording. */
async function expectNotCalledMissing(page: Page): Promise<void> {
  await expect(main(page).getByText('Not found.')).toHaveCount(0)
  await expect(notFoundLine(page)).toHaveCount(0)
}

test.describe('a slug the bar does not hold (§9)', () => {
  test('is asked for once, says so directively and leads to the index', async ({ page, bar }) => {
    const answered = page.waitForResponse((r) => r.url().endsWith('/bar/api/cocktails/no-such-drink-1'))
    await page.goto('/drinks/no-such-drink-1')

    // Upstream's own answer, as Handler.php renders it.
    const response = await answered
    expect(response.status()).toBe(404)
    expect(await response.json()).toEqual({ type: 'api_error', message: 'Resource not found.' })

    await expect(notFoundLine(page)).toBeVisible()
    await expect(back(page)).toBeVisible()
    await expect(main(page).getByRole('alert')).toHaveCount(0)
    await expect(main(page).getByText('The bar didn’t answer — try again.')).toHaveCount(0)
    await expect(fetching(page)).toHaveCount(0)
    await expect(main(page)).not.toHaveAttribute('aria-busy', 'true')
    // A 404 is not retried: the answer would be the same.
    expect(bar.calls('GET', /^\/cocktails\/no-such-drink-1$/)).toHaveLength(1)

    await toIndex(page).click()
    await expect(page).toHaveURL(/\/drinks$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
  })

  test('the way to the index is reached by Tab and operated by Enter (§7)', async ({ page }) => {
    await page.goto('/drinks/no-such-drink-1')
    await expect(notFoundLine(page)).toBeVisible()

    await back(page).focus()
    await page.keyboard.press('Tab')
    await expect(toIndex(page)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/drinks$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
  })

  // Every other screen has one level-1 heading and its name in the tab
  // (src/app.tsx setScreenTitle; RouteEffects looks for `main h1`).
  test('names the screen in the tab and in the outline', async ({ page }) => {
    await page.goto('/drinks/no-such-drink-1')
    await expect(notFoundLine(page)).toBeVisible()

    await expect(page).toHaveTitle('No such drink · Barback')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(noSuchDrink(page)).toHaveCount(1)
  })

  test('reached from a recipe, it does not keep that recipe’s name', async ({ page }) => {
    await page.goto('/drinks/daiquiri-1')
    await expect(daiquiri(page)).toBeVisible()
    await expect(page).toHaveTitle('Daiquiri · Barback')

    // A client-side route change, as a stale link inside the app would make.
    await page.evaluate(() => {
      window.history.pushState(null, '', '/drinks/no-such-drink-1')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(notFoundLine(page)).toBeVisible()
    await expect(page).toHaveTitle('No such drink · Barback')
    await expect(daiquiri(page)).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(noSuchDrink(page)).toHaveCount(1)
  })
})

test.describe('a cold deep link (§9, ADR-007)', () => {
  test('while the bar is still being read, the screen is fetching, not missing', async ({ page, bar }) => {
    // Hold GET /bars until released, then let the fake answer it as usual.
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/bar/api/bars', async (route) => {
      await held
      await route.fallback()
    })
    await page.goto('/drinks/daiquiri-1')

    await expect(fetching(page)).toBeVisible()
    await expect(main(page)).toHaveAttribute('aria-busy', 'true')
    await expect(back(page)).toBeVisible()
    await expectNotCalledMissing(page)
    await expect(main(page).getByRole('alert')).toHaveCount(0)
    expect(bar.calls('GET', /^\/cocktails\//)).toHaveLength(0)

    release()
    await expect(daiquiri(page)).toBeVisible()
    await expect(main(page)).not.toHaveAttribute('aria-busy', 'true')
    await expect(fetching(page)).toHaveCount(0)
  })

  test('when the bar read fails, the error line retries it and Retry recovers', async ({ page, bar }) => {
    // The query client retries once (src/app.tsx, retry: 1): both attempts
    // drop, and the third, from Retry, is answered.
    bar.fail(/^\/bars$/, { method: 'GET', abort: true, times: 2 })
    await page.goto('/drinks/daiquiri-1')

    const alert = main(page).getByRole('alert')
    await expect(alert).toHaveCount(1)
    await expect(alert).toContainText('The bar didn’t answer — try again.')
    await expect(back(page)).toBeVisible()
    await expectNotCalledMissing(page)
    await expect(fetching(page)).toHaveCount(0)
    await expect(main(page)).not.toHaveAttribute('aria-busy', 'true')
    expect(bar.calls('GET', /^\/bars$/)).toHaveLength(2)
    expect(bar.calls('GET', /^\/cocktails\//)).toHaveLength(0)

    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(daiquiri(page)).toBeVisible()
    await expect(main(page).getByRole('alert')).toHaveCount(0)
    expect(bar.calls('GET', /^\/bars$/)).toHaveLength(3)
    expect(bar.calls('GET', /^\/cocktails\/daiquiri-1$/)).toHaveLength(1)
  })

  test('with the API out of reach from the first request, the screen says so once', async ({ page, bar }) => {
    bar.takeApiDown()
    await page.goto('/drinks/daiquiri-1')

    const alert = main(page).getByRole('alert')
    await expect(alert).toHaveCount(1)
    await expect(alert).toContainText('The bar didn’t answer — try again.')
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
    await expectNotCalledMissing(page)
    await expect(fetching(page)).toHaveCount(0)
  })
})

test.describe('a device that goes offline (§9, ADR-007)', () => {
  test('a recipe opened offline says so in the error voice, then reads on reconnect', async ({
    page,
    context,
    bar,
  }) => {
    const network = await deviceNetwork(page, context)
    await page.goto('/drinks')
    const card = page.getByRole('link', { name: /^Daiquiri/ })
    await expect(card).toBeVisible()

    await network.off()
    await card.click()

    const alert = main(page).getByRole('alert')
    await expect(alert).toHaveCount(1)
    await expect(alert).toContainText('The bar didn’t answer — try again.')
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
    await expect(back(page)).toBeVisible()
    await expectNotCalledMissing(page)
    await expect(fetching(page)).toHaveCount(0)
    await expect(main(page)).not.toHaveAttribute('aria-busy', 'true')

    await network.on()
    await expect(daiquiri(page)).toBeVisible()
    await expect(main(page).getByRole('alert')).toHaveCount(0)
    expect(bar.calls('GET', /^\/cocktails\/daiquiri-1$/)).toHaveLength(1)
  })

  test('when the device goes offline while the bar is being read, the screen says so and reads on reconnect', async ({
    page,
    context,
  }) => {
    const network = await deviceNetwork(page, context)
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/bar/api/bars', async (route) => {
      await held
      await route.fallback()
    })
    await page.goto('/drinks/daiquiri-1')
    await expect(fetching(page)).toBeVisible()

    // The read that was out when the connection went drops; its retry waits
    // for the network.
    await network.off()
    release()

    const alert = main(page).getByRole('alert')
    await expect(alert).toHaveCount(1)
    await expect(alert).toContainText('The bar didn’t answer — try again.')
    await expect(back(page)).toBeVisible()
    await expectNotCalledMissing(page)
    await expect(fetching(page)).toHaveCount(0)
    await expect(main(page)).not.toHaveAttribute('aria-busy', 'true')

    await network.on()
    await expect(daiquiri(page)).toBeVisible()
    await expect(main(page).getByRole('alert')).toHaveCount(0)
  })
})
