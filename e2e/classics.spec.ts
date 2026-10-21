import type { Locator, Page } from '@playwright/test'
import { FIRST_POUR_SLUGS } from '../src/data/first-pours'
import { slugify } from '../test/fixtures/upstream'
import { BAR_ID, C, I, defaultWorld } from '../test/fixtures/world'
import { ISSUED_TOKEN } from './support/fake-bar'
import { expect, test } from './support/test'

// Classics (/first-pours) against docs/spec/frontend-spec.md: §1 (the route
// and its purpose, "favorite a classic, queue its missing bottles"), §2 (the
// favorite and list calls), §7 (DrinkCard, MatchHeader, keyboard and focus
// ring) and §9 (the Classics roster, nav role hints, the brand mark). ADR-008
// draws the line these journeys hold: every list write on this screen is the
// user's tap, and a tap writes once.
//
// The default world holds 12 of the roster's 19 canonical slugs, so the
// "missing slug is dropped" path runs on every load.

const world = defaultWorld()

/** The roster as this bar resolves it: roster order, slugs it lacks dropped. */
const ROSTER = FIRST_POUR_SLUGS.flatMap((slug) => {
  const c = world.cocktails.find((x) => slugify(x.name) === slug)
  return c ? [c.name] : []
})

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One roster entry: the drink card and its Choose button. The card heading's
 *  name gains "Favorited" (the ◆ marker) once the drink is chosen. */
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

async function openRoster(page: Page): Promise<void> {
  await page.goto('/first-pours')
  await expect(page.getByRole('heading', { level: 2, name: `The roster · ${ROSTER.length}` })).toBeVisible()
}

function listedIds(body: unknown): number[] {
  return ((body as { ingredients: { id: number }[] }).ingredients ?? []).map((i) => i.id).sort((a, b) => a - b)
}

test.describe('the roster (§1, §9)', () => {
  test('resolves the canonical slugs and drops the drinks this bar does not have', async ({ page, bar }) => {
    const headers: Record<string, string>[] = []
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.startsWith('/bar/api/cocktails/')) headers.push(r.headers())
    })
    await openRoster(page)

    // The fixture must actually exercise the drop path for this test to mean anything.
    expect(ROSTER.length).toBeGreaterThan(0)
    expect(ROSTER.length).toBeLessThan(FIRST_POUR_SLUGS.length)

    await expect(page.getByRole('heading', { level: 1, name: 'The classics' })).toBeVisible()
    await expect(page).toHaveTitle('The classics · Barback')
    await expect(page.locator('.first-pour-item').getByRole('heading', { level: 3 })).toHaveText(ROSTER)

    // Each canonical slug is completed with the bar id, as upstream slugs are.
    const asked = bar.calls('GET', /^\/cocktails\/[^/]+$/).map((r) => r.path)
    expect(asked.sort()).toEqual(FIRST_POUR_SLUGS.map((s) => `/cocktails/${s}-${BAR_ID}`).sort())
    // A slug the bar lacks is dropped quietly; it is not a failure.
    await expect(page.getByRole('alert')).toHaveCount(0)

    // §2: bearer token, JSON, and the bar header on every bar-scoped read.
    expect(headers.length).toBe(FIRST_POUR_SLUGS.length)
    for (const h of headers) {
      expect(h['accept']).toBe('application/json')
      expect(h['authorization']).toBe(`Bearer ${ISSUED_TOKEN}`)
      expect(h['bar-assistant-bar-id']).toBe(String(BAR_ID))
    }
  })

  test('each card colours its recipe by the shelf and links to the recipe', async ({ page }) => {
    await openRoster(page)

    await expect(entry(page, 'Daiquiri')).toContainText('Can pour')
    await expect(entry(page, 'Daiquiri')).not.toContainText(/bottle away|Missing/)
    // An optional line never counts as missing, and says so in words.
    await expect(entry(page, 'Whiskey Sour')).toContainText('Can pour')
    await expect(entry(page, 'Whiskey Sour')).toContainText('Egg whiteoptional')
    await expect(entry(page, 'Whiskey Sour')).not.toContainText(/bottle away|Missing/)
    await expect(entry(page, 'Negroni')).toContainText('One bottle away: Campari')
    await expect(entry(page, 'Margarita')).toContainText('Missing 2: Tequila, Cointreau')
    await expect(entry(page, 'Margarita').locator('.bb-drink__missing', { hasText: 'Tequila' })).toBeVisible()
    await expect(entry(page, 'Margarita').locator('.bb-drink__have', { hasText: 'Lime juice' })).toBeVisible()

    const link = entry(page, 'Margarita').getByRole('link')
    await expect(link).toHaveAttribute('href', `/drinks/margarita-${BAR_ID}`)
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/drinks/margarita-${BAR_ID}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Margarita' })).toBeVisible()
  })

  test('opening the roster writes nothing, even with favourites that have gaps (ADR-008)', async ({ page, bar }) => {
    bar.model.favorites.add(C.margarita)
    bar.model.favorites.add(C.espressoMartini)
    await openRoster(page)
    await expect(chooseButton(page, 'Margarita')).toHaveAttribute('aria-pressed', 'true')
    await expect(chooseButton(page, 'Espresso Martini')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => bar.calls('GET', /\/shopping-list$/).length).toBeGreaterThan(0)
    expect(bar.calls('POST')).toEqual([])
    expect([...bar.model.list.keys()]).toEqual([])
  })
})

test.describe('Choose (§1, §2, ADR-008)', () => {
  test('favorites the drink and queues exactly its missing bottles in one write', async ({ page, bar }) => {
    await openRoster(page)
    const button = chooseButton(page, 'Margarita')
    await expect(button).toHaveText('Choose')
    await expect(button).toHaveAttribute('aria-pressed', 'false')

    await button.click()
    await expect(toast(page)).toHaveText('Margarita — favorited, 2 bottles queued.')
    await expect(button).toHaveText('✓ Chosen')
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(entry(page, 'Margarita').getByRole('img', { name: 'Favorited' })).toBeVisible()

    expect(bar.calls('POST', /toggle-favorite$/).map((r) => r.path)).toEqual([`/cocktails/${C.margarita}/toggle-favorite`])
    const stores = bar.calls('POST', /\/shopping-list\/batch-store$/)
    expect(stores).toHaveLength(1)
    expect(listedIds(stores[0]?.body)).toEqual([I.tequila, I.cointreau].sort((a, b) => a - b))
    // Nothing else is written: no list removals, no shelf writes.
    expect(bar.calls('POST').map((r) => r.path).sort()).toEqual(
      [`/cocktails/${C.margarita}/toggle-favorite`, '/users/1/shopping-list/batch-store'].sort(),
    )
    expect(bar.model.favorites.has(C.margarita)).toBe(true)
    expect([...bar.model.list.keys()].sort((a, b) => a - b)).toEqual([I.tequila, I.cointreau].sort((a, b) => a - b))
  })

  test('one missing bottle is queued in the singular', async ({ page, bar }) => {
    await openRoster(page)
    await chooseButton(page, 'Negroni').click()
    await expect(toast(page)).toHaveText('Negroni — favorited, 1 bottle queued.')
    await expect(chooseButton(page, 'Negroni')).toHaveAttribute('aria-pressed', 'true')
    const stores = bar.calls('POST', /\/shopping-list\/batch-store$/)
    expect(stores).toHaveLength(1)
    expect(listedIds(stores[0]?.body)).toEqual([I.campari])
  })

  test('a drink that already pours is favorited and the list is left alone', async ({ page, bar }) => {
    await openRoster(page)
    // Whiskey Sour pours; its egg white is optional and not on the shelf.
    await chooseButton(page, 'Whiskey Sour').click()
    await expect(toast(page)).toHaveText('Whiskey Sour — favorited.')
    await expect(chooseButton(page, 'Whiskey Sour')).toHaveAttribute('aria-pressed', 'true')
    expect(bar.calls('POST', /toggle-favorite$/)).toHaveLength(1)
    expect(bar.calls('POST', /\/shopping-list\//)).toEqual([])
    expect(bar.model.list.has(I.eggWhite)).toBe(false)
  })

  test('a bottle already on the list is not sent again, so its quantity stands', async ({ page, bar }) => {
    // Upstream batch-store resets an existing row's quantity to the one sent,
    // or 1 (ShoppingListController::batchStore, ShoppingListController.php 76-79).
    bar.model.list.set(I.tequila, 2)
    await openRoster(page)
    await expect.poll(() => bar.calls('GET', /\/shopping-list$/).length).toBeGreaterThan(0)
    await chooseButton(page, 'Margarita').click()
    await expect(toast(page)).toHaveText('Margarita — favorited, 1 bottle queued.')
    const stores = bar.calls('POST', /\/shopping-list\/batch-store$/)
    expect(stores).toHaveLength(1)
    expect(listedIds(stores[0]?.body)).toEqual([I.cointreau])
    expect(bar.model.list.get(I.tequila)).toBe(2)
  })

  test('a brand on the shelf answers for the parent its recipe calls (§9 hierarchy-aware brands)', async ({ page, bar }) => {
    // London dry gin is a direct child of Gin; Gimlet calls Gin, not specified.
    bar.model.shelf.delete(I.gin)
    bar.model.shelf.add(I.londonDryGin)
    await openRoster(page)
    await expect(entry(page, 'Gimlet')).toContainText('Can pour')
    await expect(entry(page, 'Gimlet')).not.toContainText(/bottle away|Missing/)

    await chooseButton(page, 'Gimlet').click()
    await expect(toast(page)).toHaveText('Gimlet — favorited.')
    await expect(chooseButton(page, 'Gimlet')).toHaveAttribute('aria-pressed', 'true')
    expect(bar.calls('POST', /\/shopping-list\//)).toEqual([])
    expect(bar.model.list.has(I.gin)).toBe(false)
  })

  test('un-choosing takes the favourite off and leaves the list alone', async ({ page, bar }) => {
    // One of Margarita's gaps is still listed, the other is not: un-choosing
    // must neither remove the listed bottle nor queue the unlisted one.
    bar.model.favorites.add(C.margarita)
    bar.model.list.set(I.tequila, 1)
    await openRoster(page)
    await expect.poll(() => bar.calls('GET', /\/shopping-list$/).length).toBeGreaterThan(0)
    const button = chooseButton(page, 'Margarita')
    await expect(button).toHaveText('✓ Chosen')
    await expect(button).toHaveAttribute('aria-pressed', 'true')

    await button.click()
    await expect(toast(page)).toHaveText('Margarita — removed from favorites. Its bottles stay on the list.')
    await expect(button).toHaveText('Choose')
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(entry(page, 'Margarita').getByRole('img', { name: 'Favorited' })).toHaveCount(0)

    expect(bar.calls('POST').map((r) => r.path)).toEqual([`/cocktails/${C.margarita}/toggle-favorite`])
    expect(bar.model.favorites.has(C.margarita)).toBe(false)
    expect([...bar.model.list.entries()]).toEqual([[I.tequila, 1]])
  })

  test('a second tap while the first is in flight writes nothing more', async ({ page, bar }) => {
    await openRoster(page)
    bar.slowDown(600)
    const button = chooseButton(page, 'Negroni')
    await button.click()
    await expect(button).toBeDisabled()
    // An impatient second tap lands on a held button.
    await button.click({ force: true })
    await expect(toast(page)).toHaveText('Negroni — favorited, 1 bottle queued.')
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(button).toBeEnabled()
    expect(bar.calls('POST', /toggle-favorite$/)).toHaveLength(1)
    expect(bar.calls('POST', /\/shopping-list\/batch-store$/)).toHaveLength(1)
    expect(bar.model.favorites.has(C.negroni)).toBe(true)
  })

  test('is keyboard-operable and shows the brass focus ring (§7)', async ({ page, bar }) => {
    await openRoster(page)
    // Focus the card, then move to its Choose button by keyboard.
    await entry(page, 'Negroni').getByRole('link').focus()
    await page.keyboard.press('Tab')
    const button = chooseButton(page, 'Negroni')
    await expect(button).toBeFocused()
    const ring = await button.evaluate((el) => {
      const s = getComputedStyle(el)
      return { visible: el.matches(':focus-visible'), style: s.outlineStyle, width: s.outlineWidth, colour: s.outlineColor }
    })
    expect(ring).toEqual({ visible: true, style: 'solid', width: '2px', colour: 'rgb(198, 161, 91)' })

    await page.keyboard.press('Enter')
    await expect(toast(page)).toHaveText('Negroni — favorited, 1 bottle queued.')
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(bar.calls('POST', /toggle-favorite$/)).toHaveLength(1)
  })

  test('the queued bottles are on Tonight’s list (§6 journey 3, §9 To buy)', async ({ page }) => {
    await openRoster(page)
    await chooseButton(page, 'Margarita').click()
    await expect(toast(page)).toHaveText('Margarita — favorited, 2 bottles queued.')

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Tonight/ }).click()
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(page.getByRole('heading', { level: 2, name: 'To buy · 2' })).toBeVisible()
    await expect(page.locator('#buy .bb-shop__name')).toHaveText(['Cointreau', 'Tequila'])
  })
})

test.describe('navigation (§9 nav role hints, brand mark)', () => {
  test('the rail names Classics as drinks to aim for, and the brand mark goes home', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the rail is the ≥900px layout; the phone has the bare tab bar, covered below')
    await page.goto('/tonight')
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Main' })
    // Every rail item carries a role hint under its label.
    const hints = nav.locator('.rail-item .rail-hint')
    await expect(hints).toHaveCount(4)
    for (const hint of await hints.all()) await expect(hint).not.toBeEmpty()

    const classics = nav.getByRole('link', { name: 'Classics drinks to aim for', exact: true })
    await expect(classics.locator('.rail-hint')).toHaveText('drinks to aim for')
    await classics.click()
    await expect(page).toHaveURL(/\/first-pours$/)
    await expect(classics).toHaveAttribute('aria-current', 'page')
    await expect(page).toHaveTitle('The classics · Barback')
    // ADR-003: a client-side route change lands focus on the new screen's heading.
    await expect(page.getByRole('heading', { level: 1, name: 'The classics' })).toBeFocused()

    await nav.getByRole('link', { name: 'Barback', exact: true }).click()
    await expect(page).toHaveURL(/\/tonight$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
  })

  test('the tab bar reaches Classics and carries no hints', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the tab bar is the phone layout; desktop has the rail, covered above')
    await page.goto('/tonight')
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.locator('.rail-hint')).toHaveCount(0)

    const classics = nav.getByRole('link', { name: 'Classics', exact: true })
    await classics.click()
    await expect(page).toHaveURL(/\/first-pours$/)
    await expect(classics).toHaveAttribute('aria-current', 'page')
    await expect(page).toHaveTitle('The classics · Barback')
    await expect(page.getByRole('heading', { level: 1, name: 'The classics' })).toBeFocused()
  })
})
