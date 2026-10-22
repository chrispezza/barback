import type { Locator, Page } from '@playwright/test'
import { C, I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// Near-miss cards convert directly to the shopping list (frontend-spec §6
// Journey 1; §2 Tonight "Add gap to list": POST /users/{id}/shopping-list/
// batch-store). Beside each card on Tonight's One bottle away section, outside
// its link (a control inside a link is invalid and unnamed), sits the action
// that lists the one bottle the card names: it says List it, as every list
// action on Tonight does, and is named "List it: <bottle>", the words it shows
// first (WCAG 2.5.3); once that bottle is on the list it reads Listed instead. Listing is a tap,
// never automatic (ADR-008: suggestions the app derives require a tap), and
// leaves the receipt every List it leaves ("Campari — listed.").
//
// Whether a bottle is listed is a fact about the list, so the action waits for
// the list read, and offers nothing while the list cannot be read (ADR-007:
// mutations require connectivity; the rail is then the snapshot alone).
//
// A card that names no missing bottle (a drink the server pours, which it also
// counts one bottle away: chrispezza/barback#19) offers nothing. Whether such a
// card belongs in the section at all is #19's decision and is asserted neither
// way. Rob Roy and Bobby Burns are left out of the cases below: the bottle
// their cards name waits on chrispezza/barback#20.

/**
 * The default bar with the Whiskey Sour's optional egg white on the shelf, so
 * the can-pour and one-bottle-away sets do not overlap (as e2e/tonight.spec.ts).
 * One bottle away 6: Bobby Burns, Manhattan, Martini, Mojito, Negroni, Rob Roy.
 */
function tonightWorld(change?: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  w.shelf.push(I.eggWhite)
  change?.(w)
  return w
}

/** Each near-miss card the cases use, and the one bottle it names. */
const NEAR: [drink: string, bottle: string][] = [
  ['Manhattan', 'Rye whiskey'],
  ['Martini', 'Dry vermouth'],
  ['Mojito', 'Mint'],
  ['Negroni', 'Campari'],
]

const near = (page: Page) => page.locator('#near')
const rail = (page: Page) => page.locator('#buy')
const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true })
/** A near-miss card's list item: the card's link, and what sits beside it. */
const item = (page: Page, drink: string) =>
  near(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: new RegExp(`^${drink}`) }) })
const addToList = (scope: Locator, bottle: string) =>
  scope.getByRole('button', { name: `List it: ${bottle}`, exact: true })
/** Every list action the near-miss section offers, whatever the bottle. */
const anyAdd = (page: Page) => near(page).getByRole('button', { name: /^List it: .+$/ })
const listedMark = (scope: Locator) => scope.getByText('Listed', { exact: true })
/** A shopping-list row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
const listWrites = (bar: FakeBar) => bar.calls('POST').map((c) => [c.path, c.body])

/** Focused, with the whole ring: Visual foundations "2px solid brass, 2px offset". */
async function expectRing(control: Locator): Promise<void> {
  await expect(control).toBeFocused()
  await expect(control).toHaveCSS('outline-style', 'solid')
  await expect(control).toHaveCSS('outline-width', '2px')
  await expect(control).toHaveCSS('outline-color', 'rgb(198, 161, 91)')
  await expect(control).toHaveCSS('outline-offset', '2px')
}

/**
 * Hold every GET `matches` picks out from now on; the fake answers, and
 * records, each one only once released (as e2e/b-tonight-before-read.spec.ts).
 */
async function hold(page: Page, matches: (url: URL) => boolean): Promise<() => void> {
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    (url) => matches(url),
    async (route) => {
      if (route.request().method() === 'GET') await held
      await route.fallback()
    },
  )
  return release
}

/** GET /users/{id}/shopping-list: useShoppingList. */
const listRead = (url: URL) => /^\/bar\/api\/users\/\d+\/shopping-list$/.test(url.pathname)

test.describe('a near-miss card on Tonight', () => {
  test.use({ world: tonightWorld() })

  test('offers to list the one bottle it names, beside the card and outside its link', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(heading(page, 'One bottle away · 6')).toBeVisible()
    await expect(heading(page, 'To buy · 0')).toBeVisible()

    for (const [drink, bottle] of NEAR) {
      const card = item(page, drink)
      await expect(card.getByRole('link')).toContainText(`One bottle away: ${bottle}`)
      const add = addToList(card, bottle)
      await expect(add).toBeVisible()
      await expect(add).toHaveText('List it')
      // Beside the card, never inside its link: the link is named by the card alone.
      await expect(card.getByRole('link').getByRole('button')).toHaveCount(0)
      await expect(card.getByRole('link')).not.toHaveAccessibleName(/List it/)
      // Visual foundations: every interactive target is at least 44px.
      const box = await add.boundingBox()
      expect(box && box.height >= 44 && box.width >= 44, `${bottle}: ${JSON.stringify(box)}`).toBe(true)
    }
    // One action per card that names one bottle, and none on the pour section.
    const naming = near(page).locator('a.bb-drink').filter({ hasText: /One bottle away: / })
    expect(await naming.count()).toBeGreaterThanOrEqual(NEAR.length)
    await expect(anyAdd(page)).toHaveCount(await naming.count())
    await expect(page.locator('#pour').getByRole('button', { name: /^List it: .+$/ })).toHaveCount(0)
    // ADR-008: an app-derived suggestion writes nothing until it is tapped.
    expect(bar.calls('POST')).toEqual([])
  })

  test('lists its bottle on a tap, with a receipt, and then reads Listed', async ({ page, bar }) => {
    await page.goto('/tonight')
    const negroni = item(page, 'Negroni')
    await addToList(negroni, 'Campari').click()

    await expect(page.getByText('Campari — listed.')).toBeVisible()
    await expect(listedMark(negroni)).toBeVisible()
    await expect(addToList(negroni, 'Campari')).toHaveCount(0)
    expect(listWrites(bar)).toEqual([
      ['/users/1/shopping-list/batch-store', { ingredients: [{ id: I.campari }] }],
    ])
    expect(bar.model.list.has(I.campari)).toBe(true)
    // Listed is not stocked: the bottle goes to the list, not the shelf, and
    // the drink still waits on it.
    expect(bar.model.shelf.has(I.campari)).toBe(false)
    await expect(negroni.getByRole('link')).toContainText('One bottle away: Campari')
    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(heading(page, 'To buy · 1')).toBeVisible()
    // Every other card still offers its own.
    for (const [drink, bottle] of NEAR.filter(([d]) => d !== 'Negroni')) {
      await expect(addToList(item(page, drink), bottle)).toBeVisible()
    }
  })

  test('is reached by Tab from its card and operated by Enter', async ({ page, bar }) => {
    await page.goto('/tonight')
    const martini = item(page, 'Martini')
    await expect(addToList(martini, 'Dry vermouth')).toBeVisible()

    await martini.getByRole('link').focus()
    await page.keyboard.press('Tab')
    await expectRing(addToList(martini, 'Dry vermouth'))
    await page.keyboard.press('Enter')
    await expect(listedMark(martini)).toBeVisible()
    expect(listWrites(bar)).toEqual([
      ['/users/1/shopping-list/batch-store', { ingredients: [{ id: I.dryVermouth }] }],
    ])
  })
})

test.describe('a bottle already on the list', () => {
  test.use({ world: tonightWorld((w) => (w.list = [I.campari])) })

  test('reads Listed on arrival, with nothing to tap', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(heading(page, 'To buy · 1')).toBeVisible()
    const negroni = item(page, 'Negroni')
    await expect(listedMark(negroni)).toBeVisible()
    await expect(addToList(negroni, 'Campari')).toHaveCount(0)
    await expect(addToList(item(page, 'Martini'), 'Dry vermouth')).toBeVisible()
    expect(bar.calls('POST')).toEqual([])
  })
})

test.describe('a bottle two near-miss cards wait on', () => {
  // Gin off the shelf: the Gimlet and the Gin Tonic each wait on it alone; the
  // Negroni and the Martini now wait on two bottles and leave the section.
  test.use({ world: tonightWorld((w) => (w.shelf = w.shelf.filter((id) => id !== I.gin))) })

  test('reads Listed on both cards after one tap', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(heading(page, 'One bottle away · 6')).toBeVisible()
    for (const drink of ['Gimlet', 'Gin Tonic']) {
      await expect(item(page, drink).getByRole('link')).toContainText('One bottle away: Gin')
    }

    await addToList(item(page, 'Gin Tonic'), 'Gin').click()
    await expect(page.getByText('Gin — listed.')).toBeVisible()
    for (const drink of ['Gimlet', 'Gin Tonic']) {
      await expect(listedMark(item(page, drink))).toBeVisible()
      await expect(addToList(item(page, drink), 'Gin')).toHaveCount(0)
    }
    expect(listWrites(bar)).toEqual([['/users/1/shopping-list/batch-store', { ingredients: [{ id: I.gin }] }]])
  })
})

test.describe('a card that names no missing bottle (chrispezza/barback#19)', () => {
  // The default shelf: the Whiskey Sour pours with its optional egg white off
  // the shelf, and the server also counts it one bottle away.
  test('offers nothing, while the cards beside it offer theirs', async ({ page }) => {
    const answered = page.waitForResponse((r) => {
      const url = new URL(r.url())
      return (
        url.pathname === '/bar/api/cocktails' &&
        url.searchParams.get('filter[missing_ingredients]') === '1' &&
        url.searchParams.get('per_page') !== '1'
      )
    })
    await page.goto('/tonight')
    // Guard: the server's near set holds the Whiskey Sour, and says it pours.
    const body = (await (await answered).json()) as { data: { id: number; in_shelf: boolean }[] }
    expect(body.data.find((c) => c.id === C.whiskeySour)).toMatchObject({ in_shelf: true })

    await expect(addToList(item(page, 'Negroni'), 'Campari')).toBeVisible()
    const sour = item(page, 'Whiskey Sour')
    await expect(sour.locator('.bb-drink__missing-line')).toHaveCount(0)
    await expect(sour.getByRole('button')).toHaveCount(0)
    await expect(listedMark(sour)).toHaveCount(0)
    await expect(near(page).getByRole('button', { name: /Egg white/ })).toHaveCount(0)
  })
})

test.describe('until the list has been read', () => {
  test.use({ world: tonightWorld((w) => (w.list = [I.campari])) })

  test('no card offers its bottle, nor says Listed', async ({ page, bar }) => {
    const releaseList = await hold(page, listRead)
    await page.goto('/tonight')
    await expect(heading(page, 'One bottle away · 6')).toBeVisible()
    await expect(item(page, 'Negroni').getByRole('link')).toContainText('One bottle away: Campari')
    await expect(rail(page).getByRole('heading', { name: 'To buy', exact: true })).toBeVisible()
    await expect(anyAdd(page)).toHaveCount(0)
    await expect(listedMark(near(page))).toHaveCount(0)

    releaseList()
    await expect(heading(page, 'To buy · 1')).toBeVisible()
    await expect(listedMark(item(page, 'Negroni'))).toBeVisible()
    await expect(addToList(item(page, 'Martini'), 'Dry vermouth')).toBeVisible()
    expect(bar.calls('POST')).toEqual([])
  })
})

test.describe('a list that cannot be read', () => {
  test.use({ world: tonightWorld() })

  test('no card offers to write it, and Retry brings the actions', async ({ page, bar }) => {
    // GET /users/1/shopping-list fails twice: the first try and its one retry
    // (src/app.tsx, retry: 1). The bar answers from the third.
    bar.fail(/^\/users\/1\/shopping-list$/, { method: 'GET', status: 500, times: 2 })
    await page.goto('/tonight')

    const alert = rail(page).getByRole('alert')
    await expect(alert).toContainText('The bar didn’t answer — try again.')
    await expect(item(page, 'Negroni').getByRole('link')).toContainText('One bottle away: Campari')
    await expect(anyAdd(page)).toHaveCount(0)
    await expect(listedMark(near(page))).toHaveCount(0)

    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(heading(page, 'To buy · 0')).toBeVisible()
    await expect(addToList(item(page, 'Negroni'), 'Campari')).toBeVisible()
    expect(bar.calls('POST')).toEqual([])
  })
})
