import type { Locator, Page } from '@playwright/test'
import { FIRST_POUR_SLUGS } from '../src/data/first-pours'
import { slugify } from '../test/fixtures/upstream'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// The warm path off Tonight's two sections (chrispezza/barback#103,
// chrispezza/barback#104, chrispezza/barback#105): a screen has read the bar
// once, then the reads it asks again fail. TanStack Query keeps a query's last
// answer beside the error of a refetch that failed, so every read below still
// holds what it last answered.
//
// ADR-007 Consequences: "No stock answer is ever served stale: screens that
// need the API say so in the error voice rather than showing cached matches."
// Validation: "the rail shows the stamped snapshot; every other section shows
// the error line." So a read in error draws nothing: not the rail's standing,
// not the Index's cards or counts, not the classics' roster, not a held brand
// off a shelf that could not be read again, not an unlock count.
//
// The Shelf's own ledger is the user's inventory, which they are editing; what
// it shows on the warm path is the maintainer's call (chrispezza/barback#105),
// so it is not pinned here. Tonight's pour and near sections are pinned in
// e2e/b-warm-offline.spec.ts, the cold start in e2e/d-cold-start.spec.ts and
// e2e/offline-tonight.spec.ts.

const ERROR = 'The bar didn’t answer — try again.'

const world = defaultWorld()

/** The roster as this bar resolves it (e2e/classics.spec.ts): slugs it lacks dropped. */
const ROSTER = FIRST_POUR_SLUGS.flatMap((slug) => {
  const c = world.cocktails.find((x) => slugify(x.name) === slug)
  return c ? [c.name] : []
})

const main = (page: Page) => page.getByRole('main')
const sectionHeading = (page: Page, name: string) => main(page).getByRole('heading', { level: 2, name, exact: true })
const cards = (page: Page) => main(page).locator('.card-list > li')
/** The card's "✓Can pour" mark, case-sensitive so no "You can pour" header matches. */
const canPourMarks = (page: Page) => main(page).getByText(/Can pour$/)
/** The rail's standing line ("11 bottles · 5 pourable"); desktop only. */
const standing = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByText(/ bottles? · \d+ pourable$/)

/** Tonight's whole-bar status line, and what it says of the default world. */
const status = (page: Page) => page.locator('.bar-status')
const STATUS = 'You can pour 5 · 7 one bottle away · 0 to buy'

const pour = (page: Page) => page.locator('#pour')
const near = (page: Page) => page.locator('#near')
const rail = (page: Page) => page.locator('#buy')
/** A To buy row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
/** The row's one detail line: "Unlocks N", or what the bottle builds toward. */
const meta = (page: Page, name: string) => listItem(page, name).locator('.bb-shop__meta')
/**
 * A card in a Tonight section, by the drink's name. Not by its heading's role:
 * on the phone the pour stack shows four cards before "Show all", and the
 * rest are in the list but hidden.
 */
const cardOf = (section: Locator, name: string) =>
  section
    .locator('.card-list > li')
    .filter({ has: section.page().locator('.bb-drink__name', { hasText: new RegExp(`^${name}$`) }) })

/** Client-side navigation through the visible main nav (rail or tab bar). */
async function goTo(page: Page, label: string, heading: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) }).click()
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
}

/** The page's one error line (ErrorLine is role="alert"), with its Retry. */
async function expectOneErrorLine(scope: Locator) {
  const alert = scope.getByRole('alert')
  await expect(alert).toHaveCount(1)
  await expect(alert).toContainText(ERROR)
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
}

/**
 * Drop every API request whose URL `matches`, until `lift` is called, and keep
 * the paths it dropped. FakeBar.takeApiDown cannot be undone and records
 * nothing it drops by path, so a spec that needs either routes the outage
 * itself. Playwright asks the route registered last first, so this one is
 * asked before the fake, and passes every other request on to it.
 */
async function outage(page: Page, matches: (url: URL) => boolean) {
  let down = true
  const dropped: string[] = []
  await page.route(
    (url) => url.pathname.startsWith('/bar/api/'),
    (route) => {
      const url = new URL(route.request().url())
      if (!down || !matches(url)) return route.fallback()
      dropped.push(url.pathname.slice('/bar/api'.length))
      return route.abort('connectionrefused')
    },
  )
  return {
    lift: () => {
      down = false
    },
    dropped: (path: RegExp) => dropped.filter((p) => path.test(p)).length,
  }
}

/** The shelf read (useShelf): the user's bottles, GET /ingredients?filter[on_shelf]=true. */
const isShelfRead = (url: URL) =>
  url.pathname === '/bar/api/ingredients' && url.searchParams.get('filter[on_shelf]') === 'true'

/** The sours' summary in the default world (e2e/index-family-summary.spec.ts). */
const SOUR = 'You can pour 3 of 5 sours · 1 is one bottle away.'

test.describe('the desktop rail after its reads fail (chrispezza/barback#103)', () => {
  test.skip(({ isMobile }) => isMobile, 'the nav rail exists only at 900px and wider')

  test('states no standing beside Tonight’s error lines, and states it again once the bar answers', async ({
    page,
  }) => {
    await page.goto('/tonight')
    await expect(standing(page)).toHaveText('11 bottles · 5 pourable')
    await expect(status(page)).toHaveText(STATUS)

    await goTo(page, 'Shelf', 'Shelf')
    const { lift } = await outage(page, () => true)
    await goTo(page, 'Tonight', 'Tonight')

    // Tonight says its reads failed; the rail beside it says nothing of them.
    await expectOneErrorLine(pour(page))
    await expect(standing(page)).toHaveCount(0)
    await expect(page.locator('.rail-standing')).toHaveCount(0)
    await expect(status(page)).toHaveCount(0)
    // Log out stays: it needs no read.
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Log out' })).toBeVisible()

    // On the same screen, through the pour section's Retry: the standing and
    // the status line have no error line of their own, and share the pour
    // section's whole-bar read and its shelf.
    lift()
    await pour(page).getByRole('alert').getByRole('button', { name: 'Retry' }).click()
    await expect(pour(page).getByRole('alert')).toHaveCount(0)
    await expect(standing(page)).toHaveText('11 bottles · 5 pourable')
    await expect(status(page)).toHaveText(STATUS)

    await near(page).getByRole('alert').getByRole('button', { name: 'Retry' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})

test.describe('the Index after its reads fail (chrispezza/barback#105)', () => {
  test('shows the error line alone: no card, no match mark, no count in its header', async ({ page, bar }) => {
    await page.goto('/drinks')
    await expect(sectionHeading(page, 'The index · 15')).toBeVisible()
    await expect(cards(page)).toHaveCount(15)
    await expect(canPourMarks(page).first()).toBeVisible()

    await goTo(page, 'Shelf', 'Shelf')
    bar.takeApiDown()
    await goTo(page, 'Drinks', 'Drinks')

    await expectOneErrorLine(main(page))
    await expect(main(page).getByRole('heading', { level: 2, name: /^The index · / })).toHaveCount(0)
    await expect(cards(page)).toHaveCount(0)
    await expect(canPourMarks(page)).toHaveCount(0)
    await expect(sectionHeading(page, 'The index')).toBeVisible()
  })

  test('under a family, states no stock summary from counts it could not read', async ({ page, bar }) => {
    await page.goto('/drinks?family=sour')
    await expect(main(page).getByText(/^You can pour \d+ of \d+ sours · /)).toBeVisible()
    await expect(cards(page).first()).toBeVisible()

    // The family rides the nav between the Index and Tonight (frontend-spec §6).
    await goTo(page, 'Tonight', 'Tonight')
    bar.takeApiDown()
    await goTo(page, 'Drinks', 'Drinks')
    await expect(page).toHaveURL(/\/drinks\?family=sour$/)

    await expectOneErrorLine(main(page))
    await expect(main(page).getByText(/^You can pour /)).toHaveCount(0)
    await expect(main(page).getByText(/one bottle away\.$/)).toHaveCount(0)
    await expect(main(page).getByRole('heading', { level: 2, name: /^The index · / })).toHaveCount(0)
    await expect(cards(page)).toHaveCount(0)
  })

  // The summary is three count reads of its own beside the list's: Retry asks
  // for every read the error line stands for, or the list comes back alone and
  // the summary never does, with nothing to say so.
  test('under a family, states its summary again once the bar answers and Retry asks', async ({ page }) => {
    await page.goto('/drinks?family=sour')
    const summary = main(page).getByText(/^You can pour \d+ of \d+ sours · /)
    await expect(summary).toHaveText(SOUR)

    await goTo(page, 'Tonight', 'Tonight')
    const { lift } = await outage(page, () => true)
    await goTo(page, 'Drinks', 'Drinks')
    await expect(page).toHaveURL(/\/drinks\?family=sour$/)
    await expectOneErrorLine(main(page))
    await expect(summary).toHaveCount(0)

    lift()
    await main(page).getByRole('alert').getByRole('button', { name: 'Retry' }).click()
    await expect(summary).toHaveText(SOUR)
    await expect(cards(page)).toHaveCount(5)
    await expect(main(page).getByRole('alert')).toHaveCount(0)
  })

  // The cards read held child brands off the shelf (chrispezza/barback#20). A
  // shelf read that failed is dropped, and the cards fall back to their own
  // line flags, which see no child brand: that may err toward "not held", and
  // only under an error line that says the shelf was not read
  // (chrispezza/barback#104, Option 1).
  test('says so beside its cards when only the shelf could not be read again, and asks for it on Retry', async ({
    page,
  }) => {
    await page.goto('/drinks')
    const penicillin = cardOf(main(page), 'Penicillin')
    await expect(penicillin.locator('.bb-drink__missing-line')).toHaveText('One bottle away: Honey syrup')

    await goTo(page, 'Shelf', 'Shelf')
    const { lift } = await outage(page, isShelfRead)
    await goTo(page, 'Drinks', 'Drinks')

    // The list answered; the shelf its cards are read against did not.
    await expect(sectionHeading(page, 'The index · 15')).toBeVisible()
    await expect(cards(page)).toHaveCount(15)
    await expectOneErrorLine(main(page))

    lift()
    await main(page).getByRole('alert').getByRole('button', { name: 'Retry' }).click()
    await expect(main(page).getByRole('alert')).toHaveCount(0)
    await expect(penicillin.locator('.bb-drink__missing-line')).toHaveText('One bottle away: Honey syrup')
  })

  test('a search says so beside its hits when the shelf could not be read again', async ({ page }) => {
    await page.goto('/drinks')
    await expect(cards(page)).toHaveCount(15)

    await goTo(page, 'Shelf', 'Shelf')
    const { lift } = await outage(page, isShelfRead)
    await goTo(page, 'Drinks', 'Drinks')
    await page.getByRole('searchbox', { name: 'Find a drink' }).fill('Penicillin')

    // The search and its cards answered; the shelf did not.
    await expect(sectionHeading(page, 'Matches · 1')).toBeVisible()
    await expect(cardOf(main(page), 'Penicillin')).toBeVisible()
    await expectOneErrorLine(main(page))

    lift()
    await main(page).getByRole('alert').getByRole('button', { name: 'Retry' }).click()
    await expect(main(page).getByRole('alert')).toHaveCount(0)
    await expect(cardOf(main(page), 'Penicillin').locator('.bb-drink__missing-line')).toHaveText(
      'One bottle away: Honey syrup',
    )
  })
})

test.describe('the classics after the roster read fails (chrispezza/barback#105)', () => {
  test('show the error line alone: no roster card, and no count of the roster', async ({ page, bar }) => {
    await page.goto('/first-pours')
    await expect(sectionHeading(page, `The roster · ${ROSTER.length}`)).toBeVisible()
    await expect(page.locator('.first-pour-item')).toHaveCount(ROSTER.length)

    await goTo(page, 'Shelf', 'Shelf')
    bar.takeApiDown()
    await goTo(page, 'Classics', 'The classics')

    await expectOneErrorLine(main(page))
    await expect(main(page).getByRole('heading', { level: 2, name: /^The roster · / })).toHaveCount(0)
    await expect(page.locator('.first-pour-item')).toHaveCount(0)
    await expect(canPourMarks(page)).toHaveCount(0)
    await expect(main(page).getByRole('button', { name: /Choose|Chosen/ })).toHaveCount(0)
    await expect(sectionHeading(page, 'The roster')).toBeVisible()
  })
})

test.describe('Tonight after the shelf read fails and the drinks still answer (chrispezza/barback#104)', () => {
  // Honey syrup on the default shelf: the Laphroaig 10 there stands in for the
  // Islay Scotch the Penicillin calls (chrispezza/barback#20), so it pours.
  // With the Laphroaig gone it waits on Islay Scotch alone.
  test.use({
    world: ((w: WorldSeed) => {
      w.shelf.push(I.honeySyrup)
      return w
    })(defaultWorld()),
  })

  test('a near card names the bottle the shelf no longer holds, not a brand read off the failed shelf', async ({
    page,
    bar,
  }) => {
    await page.goto('/tonight')
    await expect(cardOf(pour(page), 'Penicillin')).toContainText('Can pour')

    await goTo(page, 'Shelf', 'Shelf')
    // The Laphroaig leaves the shelf, and the shelf cannot be read again.
    bar.model.shelf.delete(I.laphroaig10)
    await outage(page, (url) => url.pathname === '/bar/api/ingredients' && url.searchParams.get('filter[on_shelf]') === 'true')
    await goTo(page, 'Tonight', 'Tonight')

    // The pour section says the shelf read failed (one line for its reads).
    await expectOneErrorLine(pour(page))
    // The drinks answered: the Penicillin no longer pours, and is one bottle away.
    await expect(cardOf(pour(page), 'Penicillin')).toHaveCount(0)
    const penicillin = cardOf(near(page), 'Penicillin')
    await expect(penicillin).toBeVisible()
    // The card reads its lines off its own flags, not off the shelf that was
    // last read: the Islay Scotch is missing, and it is the bottle listed.
    await expect(penicillin).toContainText('One bottle away: Islay Scotch')
    await expect(penicillin.getByRole('button', { name: 'Add Islay Scotch to the list' })).toBeVisible()
    // Nothing is offered against a shelf that could not be read.
    await expect(rail(page).getByRole('heading', { name: /^(Buy next|For your favorites|Restock next)$/ })).toHaveCount(0)
  })
})

test.describe('Tonight’s empty state after the shelf read fails (chrispezza/barback#104)', () => {
  // Espresso alone: the shelf is not bare, nothing pours, and nothing is one
  // bottle away (the Espresso Martini still waits on vodka and coffee
  // liqueur), so the pour section says "Nothing pours yet".
  test.use({ world: { ...defaultWorld(), shelf: [I.espresso] } })

  test('names no bottle to start with against a shelf it could not read', async ({ page }) => {
    // The names are suggestions, decided against what is owned or listed, as
    // Buy next and Restock next are: with neither the shelf nor its held
    // brands known, a bottle the shelf holds or covers could be named.
    const startWith = pour(page).getByText(/^Start with .+ — they open the most drinks\.$/)
    await page.goto('/tonight')
    await expect(startWith).toHaveText('Start with Gin, Sweet vermouth, White rum — they open the most drinks.')

    await goTo(page, 'Shelf', 'Shelf')
    await outage(page, isShelfRead)
    await goTo(page, 'Tonight', 'Tonight')

    await expectOneErrorLine(pour(page))
    await expect(pour(page).getByRole('heading', { name: 'Nothing pours yet', exact: true })).toBeVisible()
    // What the counts alone support, as before the suggestions can be decided.
    await expect(pour(page)).toContainText(
      'Nothing is one bottle away either — add to the shelf and the first drinks open up.',
    )
    await expect(startWith).toHaveCount(0)
  })
})

test.describe('To buy after an unlock count’s read fails', () => {
  // As e2e/a-shelf-unlocks.spec.ts: Campari, listed, opens the Negroni only
  // while gin and sweet vermouth are on the shelf.
  test.use({
    world: ((w: WorldSeed) => {
      w.shelf.push(I.eggWhite)
      w.list = [I.campari]
      return w
    })(defaultWorld()),
  })

  test('a row states no count, and no rail line states one, once the count could not be read again', async ({
    page,
    bar,
  }) => {
    await page.goto('/tonight')
    await expect(meta(page, 'Campari')).toHaveText('Unlocks 1· 1 spirit-forward drink')

    await goTo(page, 'Shelf', 'Shelf')
    const extra = /^\/ingredients\/\d+\/extra$/
    const { dropped } = await outage(page, (url) => extra.test(url.pathname.slice('/bar/api'.length)))
    // Every shelf toggle asks every count again (chrispezza/barback#102): this
    // one leaves Campari opening nothing.
    await page.getByRole('button', { name: 'Remove Gin from the shelf', exact: true }).click()
    await expect.poll(() => bar.model.shelf.has(I.gin)).toBe(false)
    await goTo(page, 'Tonight', 'Tonight')

    // Campari's count is asked for, and its one retry, and both fail.
    const campariExtra = new RegExp(`^/ingredients/${I.campari}/extra$`)
    await expect.poll(() => dropped(campariExtra), { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
    await expect(listItem(page, 'Campari')).toBeVisible()
    await expect(listItem(page, 'Campari')).not.toContainText('Unlocks')
    await expect(listItem(page, 'Campari')).not.toContainText('spirit-forward')
    // Buy next and Restock next state no count either.
    await expect(rail(page).getByText(/unlocks \d/i)).toHaveCount(0)
    await expect(rail(page).getByText(/^opens \d+ drinks? tonight$/)).toHaveCount(0)
  })

  // The journey above changes the pick (Gin, once off the shelf, ranks first),
  // and a new pick's count is never read, so it states none either way. Here
  // the toggle leaves the pick where it is, with a count it has read once.
  test('Buy next states no count for the same pick once its count could not be read again', async ({
    page,
    bar,
  }) => {
    const buyNext = rail(page).locator('.buy-next')
    await page.goto('/tonight')
    await expect(buyNext.locator('.buy-next-name')).toHaveText('Scotch whisky')
    await expect(buyNext.locator('.buy-next-reason')).toHaveText('opens 2 drinks tonight')

    await goTo(page, 'Shelf', 'Shelf')
    const scotchExtra = new RegExp(`^/ingredients/${I.scotch}/extra$`)
    const { dropped } = await outage(page, (url) => scotchExtra.test(url.pathname.slice('/bar/api'.length)))
    // Egg white is optional in the one drink that calls it, and ranks below
    // Scotch once off the shelf; the toggle still asks every count again
    // (chrispezza/barback#102).
    await page.getByRole('button', { name: 'Remove Egg white from the shelf', exact: true }).click()
    await expect.poll(() => bar.model.shelf.has(I.eggWhite)).toBe(false)
    await goTo(page, 'Tonight', 'Tonight')

    // The count is asked for, and its one retry, and both fail.
    await expect.poll(() => dropped(scotchExtra), { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
    await expect(buyNext.locator('.buy-next-name')).toHaveText('Scotch whisky')
    await expect(buyNext.locator('.buy-next-reason')).toHaveText('ranked highest for your shelf')
  })
})
