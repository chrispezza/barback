import type { Locator, Page } from '@playwright/test'
import { C, I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// The cards "In the same vein" after the shelf changes elsewhere (frontend-spec
// §4: "can-make and near-miss are server-derived from shelf state, so they must
// refetch after any shelf change"; ADR-003 Validation: an optimistic change
// "reconciles with API in the background"). The cards are GET
// /cocktails/{id}/similar (CocktailController::similar,
// app/Http/Controllers/CocktailController.php 352-371 at v5.15.3): cocktail
// resources whose in_shelf is the matcher's answer against the user's shelf
// (CocktailResource.php 133), and src/data/match.ts paints a card Can pour
// exactly when that answer says so. The client holds /similar for five minutes
// (useSimilarCocktails), so a recipe opened again inside that time paints its
// cards from whatever /similar answered before the shelf changed, unless the
// shelf change read it back.
//
// Default world (test/fixtures/world.ts): the Gimlet's similar drinks are the
// Negroni (one bottle away: Campari), the Gin Tonic (pours) and the Martini.
// A favourite made elsewhere is pinned last: toggle-favorite already settles
// and reads back the cards that carry the drink (e2e/a-favourite-settles.spec.ts
// pins it from another recipe; here it is made on the Classics).

/** The default bar with Campari on the shopping list. */
function campariListed(): WorldSeed {
  const w = defaultWorld()
  w.list = [I.campari]
  return w
}

/** The main navigation the viewport shows: the rail on desktop, the tab bar on the phone. */
const navLink = (page: Page, label: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) })

const main = (page: Page) => page.getByRole('main')
const similarHeading = (page: Page) => page.getByRole('heading', { level: 2, name: 'In the same vein' })
const similarSection = (page: Page) => main(page).locator('section', { has: similarHeading(page) })
/** A similar-drink card; a favourited card's name starts with its mark, so no anchor. */
const similarCard = (page: Page, name: string) => similarSection(page).getByRole('link', { name: new RegExp(name) })
const favouriteMark = (page: Page, name: string) => similarCard(page, name).getByRole('img', { name: 'Favorited' })

const count = (page: Page) => page.locator('.shelf-count')
const search = (page: Page) => page.getByRole('searchbox', { name: 'Add a bottle' })
const chip = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const removeButton = (page: Page, name: string) =>
  page.getByRole('button', { name: `Remove ${name} from the shelf`, exact: true })
/** The removal's toast (destructive, so the design system gives it role alert). */
const removalUndo = (page: Page) =>
  page
    .locator('.toast-host')
    .filter({ hasText: 'Bottle removed from the shelf.' })
    .getByRole('button', { name: 'Undo' })

/** A shopping-list row's check-off control on Tonight; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  page.locator('#buy .shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
/** The check-off's receipt toast, which carries the Undo. */
const checkOffUndo = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Moved to the shelf.' }).getByRole('button', { name: 'Undo' })

/** One Classics roster entry by its drink. */
const rosterEntry = (page: Page, name: string) =>
  page.locator('.first-pour-item').filter({
    has: page.getByRole('heading', { level: 3, name: new RegExp(`^(Favorited )?${name}$`) }),
  })

/** GET /cocktails/{gimlet}/similar reads made so far. */
const similarReads = (bar: FakeBar): number => bar.calls('GET', new RegExp(`^/cocktails/${C.gimlet}/similar$`)).length

async function openGimlet(page: Page): Promise<void> {
  await page.goto('/drinks/gimlet-1')
  await expect(page.getByRole('heading', { level: 1, name: 'Gimlet' })).toBeVisible()
  await expect(similarHeading(page)).toBeVisible()
}

/**
 * Open the Gimlet again from the index, inside the app: nothing is reloaded, so
 * the cache from the first visit stands. (Not the browser's Back: a nav-link tap
 * pushes two history entries, so one Back from the Shelf lands on the Shelf.)
 */
async function backToGimlet(page: Page): Promise<void> {
  await navLink(page, 'Drinks').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
  await main(page)
    .locator('a.bb-drink', { has: page.getByRole('heading', { level: 3, name: /^(Favorited )?Gimlet$/ }) })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Gimlet' })).toBeVisible()
}

/** The card says the drink pours, and names no missing bottle. */
async function expectPours(card: Locator): Promise<void> {
  await expect(card).toHaveAttribute('data-match', 'full')
  // The ✓ before it is aria-hidden: matched on what a reader hears (as e2e/index-card-match.spec.ts).
  await expect(card.locator('.bb-drink__pour')).toMatchAriaSnapshot('- paragraph: Can pour')
  await expect(card.locator('.bb-drink__missing-line')).toHaveCount(0)
}

/** The card says the drink waits on this one bottle, and does not say it pours. */
async function expectOneAway(card: Locator, bottle: string): Promise<void> {
  await expect(card).toHaveAttribute('data-match', 'near')
  await expect(card.locator('.bb-drink__missing-line')).toHaveText(`One bottle away: ${bottle}`)
  await expect(card.locator('.bb-drink__pour')).toHaveCount(0)
}

test.describe('a shelf change on the Shelf (§4; ADR-003)', () => {
  test('a bottle removed takes Can pour off the similar card that needs it', async ({ page, bar }) => {
    await openGimlet(page)
    await expectPours(similarCard(page, 'Gin Tonic'))
    const reads = similarReads(bar)

    await navLink(page, 'Shelf').click()
    await expect(count(page)).toHaveText('11 bottles on the shelf.')
    await removeButton(page, 'Tonic').click()
    await expect(count(page)).toHaveText('10 bottles on the shelf.')
    await expect.poll(() => bar.model.shelf.has(I.tonic)).toBe(false)

    await backToGimlet(page)
    await expectOneAway(similarCard(page, 'Gin Tonic'), 'Tonic')
    expect(similarReads(bar)).toBeGreaterThan(reads)
  })

  test('a bottle added by its chip puts Can pour on the similar card it completes', async ({ page, bar }) => {
    await openGimlet(page)
    await expectOneAway(similarCard(page, 'Negroni'), 'Campari')
    const reads = similarReads(bar)

    await navLink(page, 'Shelf').click()
    await expect(count(page)).toHaveText('11 bottles on the shelf.')
    await search(page).fill('Campari')
    await expect(chip(page, 'Campari')).toHaveAttribute('aria-pressed', 'false')
    await chip(page, 'Campari').click()
    await expect(chip(page, 'Campari')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => bar.model.shelf.has(I.campari)).toBe(true)

    await backToGimlet(page)
    await expectPours(similarCard(page, 'Negroni'))
    expect(similarReads(bar)).toBeGreaterThan(reads)
  })

  test('the removal’s Undo, tapped on the recipe, puts Can pour back on the card', async ({ page, bar }) => {
    await openGimlet(page)
    await expectPours(similarCard(page, 'Gin Tonic'))

    await navLink(page, 'Shelf').click()
    await expect(count(page)).toHaveText('11 bottles on the shelf.')
    await removeButton(page, 'Tonic').click()
    await expect(removalUndo(page)).toBeVisible()
    await expect.poll(() => bar.model.shelf.has(I.tonic)).toBe(false)

    await backToGimlet(page)
    await expectOneAway(similarCard(page, 'Gin Tonic'), 'Tonic')
    const reads = similarReads(bar)

    // The Undo outlives the Shelf screen; it is tapped with the recipe open.
    await removalUndo(page).click()
    await expect.poll(() => bar.model.shelf.has(I.tonic)).toBe(true)
    await expectPours(similarCard(page, 'Gin Tonic'))
    expect(similarReads(bar)).toBeGreaterThan(reads)
  })
})

test.describe('a check-off on Tonight (§4, §5; §6 journey 3)', () => {
  test.use({ world: campariListed() })

  test('a bottle checked off puts Can pour on the similar card it completes', async ({ page, bar }) => {
    await openGimlet(page)
    await expectOneAway(similarCard(page, 'Negroni'), 'Campari')
    const reads = similarReads(bar)

    await navLink(page, 'Tonight').click()
    await listItem(page, 'Campari').click()
    await expect(checkOffUndo(page)).toBeVisible()
    await expect.poll(() => [bar.model.shelf.has(I.campari), bar.model.list.has(I.campari)]).toEqual([true, false])

    await backToGimlet(page)
    await expectPours(similarCard(page, 'Negroni'))
    expect(similarReads(bar)).toBeGreaterThan(reads)
  })

  test('the check-off’s Undo, tapped on the recipe, takes Can pour back off the card', async ({ page, bar }) => {
    await openGimlet(page)
    await expectOneAway(similarCard(page, 'Negroni'), 'Campari')

    await navLink(page, 'Tonight').click()
    await listItem(page, 'Campari').click()
    await expect(checkOffUndo(page)).toBeVisible()
    await expect.poll(() => [bar.model.shelf.has(I.campari), bar.model.list.has(I.campari)]).toEqual([true, false])

    await backToGimlet(page)
    await expectPours(similarCard(page, 'Negroni'))
    const reads = similarReads(bar)

    // The Undo outlives Tonight; it is tapped with the recipe open.
    await checkOffUndo(page).click()
    await expect.poll(() => [bar.model.shelf.has(I.campari), bar.model.list.has(I.campari)]).toEqual([false, true])
    await expectOneAway(similarCard(page, 'Negroni'), 'Campari')
    expect(similarReads(bar)).toBeGreaterThan(reads)
  })
})

test.describe('a favourite made on the Classics (§1; ADR-003)', () => {
  test('a drink chosen on the Classics carries its mark on the similar card', async ({ page, bar }) => {
    await openGimlet(page)
    await expect(similarCard(page, 'Negroni')).toBeVisible()
    await expect(favouriteMark(page, 'Negroni')).toHaveCount(0)

    await navLink(page, 'Classics').click()
    const choose = rosterEntry(page, 'Negroni').getByRole('button')
    await expect(choose).toHaveText('Choose')
    await expect(choose).toBeEnabled()
    await choose.click()
    await expect(choose).toHaveText('✓ Chosen')
    expect(bar.model.favorites.has(C.negroni)).toBe(true)

    await backToGimlet(page)
    await expect(favouriteMark(page, 'Negroni')).toBeVisible()
  })
})
