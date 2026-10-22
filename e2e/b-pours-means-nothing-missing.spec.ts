import type { Locator, Page } from '@playwright/test'
import { C, I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// A drink the server pours names no missing bottle (frontend-spec §2
// "Per-ingredient stock color", §7 DrinkCard; ADR-008 favourites gaps;
// chrispezza/barback#20). GET /cocktails loads no substitutes upstream
// (CocktailQueryFilter::__construct at v5.15.3), so a line a held substitute
// covers arrives with in_shelf false and no in_shelf_as_substitute. The
// drink's own in_shelf is the server's matcher (CocktailResource.php:133,
// CocktailService.php:255-311), which counted that line: the card says Can
// pour, and nothing beside it says a bottle is missing; nor does Tonight offer
// that bottle as one that completes the favourite.
//
// What the One bottle away section shows for such a drink, which the server
// also counts there, is chrispezza/barback#19 and is asserted neither way.

/** A drink card by name; a favourited card's heading is named "Favorited <name>". */
function card(page: Page, name: string, within?: Locator) {
  return (within ?? page).locator('a.bb-drink', {
    has: page.getByRole('heading', { level: 3, name: new RegExp(`^(Favorited )?${name}$`) }),
  })
}

/** A card that says it pours and names nothing missing, `bottle` painted held. */
async function expectPoursWithNothingMissing(drink: Locator, bottle: string) {
  await expect(drink).toHaveAttribute('data-match', 'full')
  await expect(drink.locator('.bb-drink__pour')).toMatchAriaSnapshot('- paragraph: Can pour')
  await expect(drink.locator('.bb-drink__missing-line')).toHaveCount(0)
  await expect(drink.locator('.bb-drink__have').filter({ hasText: bottle })).toHaveCount(1)
  await expect(drink.locator('.bb-drink__missing')).toHaveCount(0)
}

function world(change: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  change(w)
  return w
}

/**
 * The Mojito topped with Tonic: its club soda line lists Tonic as a substitute
 * (test/fixtures/world.ts). The shelf holds Tonic and Mint but no Club soda,
 * which is on the list, so its standing order is met and Tonight queues nothing.
 */
const mojitoOnTonic = world((w) => {
  w.shelf = [...w.shelf.filter((id) => id !== I.clubSoda), I.mint]
  w.list = [I.clubSoda]
})

/**
 * A Manhattan whose rye line lists Bourbon whiskey as a substitute, favourited.
 * The default shelf holds Bourbon whiskey, not Rye whiskey, and Rye whiskey is
 * no staple, so nothing but the favourites gaps could offer it as completing
 * the drink.
 */
const manhattanOnBourbon = world((w) => {
  const rye = w.cocktails.find((c) => c.id === C.manhattan)?.lines.find((l) => l.ingredientId === I.rye)
  if (rye) rye.substituteIds = [I.bourbon]
  w.favorites = [C.manhattan]
})

test.describe('the Mojito with Tonic standing in for its Club soda', () => {
  test.use({ world: mojitoOnTonic })

  test('reads Can pour on the Index, with no bottle missing', async ({ page }) => {
    const listed = page.waitForResponse((r) => {
      const url = new URL(r.url())
      return url.pathname === '/bar/api/cocktails' && url.searchParams.get('per_page') === '50'
    })
    await page.goto('/drinks')
    await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
    // Guard: the index line itself carries no sign of the substitute.
    const body = (await (await listed).json()) as {
      data: { id: number; in_shelf: boolean; ingredients: { ingredient: { id: number } }[] }[]
    }
    const mojito = body.data.find((c) => c.id === C.mojito)
    expect(mojito?.in_shelf).toBe(true)
    const soda = mojito?.ingredients.find((e) => e.ingredient.id === I.clubSoda)
    expect(soda).toMatchObject({ in_shelf: false })
    expect(soda).not.toHaveProperty('in_shelf_as_substitute')

    await expectPoursWithNothingMissing(card(page, 'Mojito'), 'Club soda')
  })

  test('reads Can pour on Tonight, with no bottle missing', async ({ page, bar }) => {
    await page.goto('/tonight')
    const pour = page.locator('#pour')
    await expect(pour.getByRole('heading', { name: 'You can pour · 6', exact: true })).toBeVisible()
    await expectPoursWithNothingMissing(card(page, 'Mojito', pour), 'Club soda')
    expect(bar.calls('POST')).toEqual([])
  })
})

/** Every Buy next card the rail shows from the first paint, as "Name — reason". */
async function recordBuyNext(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __buyNext: string[] }
    w.__buyNext = []
    new MutationObserver(() => {
      const shown = document.querySelector('#buy .buy-next')
      if (!shown) return
      const text = `${shown.querySelector('.buy-next-name')?.textContent ?? ''} — ${
        shown.querySelector('.buy-next-reason')?.textContent ?? ''
      }`
      if (w.__buyNext[w.__buyNext.length - 1] !== text) w.__buyNext.push(text)
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
}

/**
 * Resolve once the fake has recorded no new request for `quietMs` (as in
 * e2e/b-tonight-before-read.spec.ts): every read the screen asks for has
 * answered and been drawn.
 */
async function settled(bar: FakeBar, quietMs = 500) {
  let seen = -1
  let since = Date.now()
  await expect
    .poll(
      () => {
        const count = bar.calls().length
        if (count !== seen) {
          seen = count
          since = Date.now()
        }
        return Date.now() - since >= quietMs
      },
      { intervals: [50], timeout: 10_000 },
    )
    .toBe(true)
}

test.describe('a favourited Manhattan poured with Bourbon whiskey for its Rye whiskey', () => {
  test.use({ world: manhattanOnBourbon })

  test('reads Can pour on Tonight, with no bottle missing', async ({ page }) => {
    await page.goto('/tonight')
    const pour = page.locator('#pour')
    await expect(pour.getByRole('heading', { name: 'You can pour · 6', exact: true })).toBeVisible()
    await expectPoursWithNothingMissing(card(page, 'Manhattan', pour), 'Rye whiskey')
  })

  test('Buy next never offers Rye whiskey as completing it', async ({ page, bar }) => {
    await recordBuyNext(page)
    await page.goto('/tonight')
    await expect(page.locator('#pour').getByRole('heading', { name: 'You can pour · 6', exact: true })).toBeVisible()

    // The favourites have been read and drawn.
    await expect
      .poll(() => bar.calls('GET', /^\/cocktails$/).filter((c) => c.query.get('filter[favorites]') === 'true').length)
      .toBeGreaterThan(0)
    await settled(bar)
    const rail = page.locator('#buy')
    const buyNext = rail.locator('.buy-next')
    // No favourite needs a bottle, so Buy next is the server's pick.
    await expect(buyNext.locator('.buy-next-name')).toHaveText('Scotch whisky')
    await expect(buyNext.locator('.buy-next-reason')).not.toHaveText(/^completes|^in \d+ favorite/)
    await expect(rail.getByRole('heading', { name: 'For your favorites', exact: true })).toHaveCount(0)
    await expect(rail).not.toContainText('completes')
    const shown = await page.evaluate(() => (window as unknown as { __buyNext: string[] }).__buyNext)
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.filter((s) => s.startsWith('Rye whiskey'))).toEqual([])
    // App-derived suggestions never write the list by themselves (ADR-008).
    expect(bar.calls('POST')).toEqual([])
  })
})
