import type { Locator, Page } from '@playwright/test'
import { C, I, T, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { ISSUED_TOKEN, SEARCH_TOKEN, type FakeBar, type RecordedRequest } from './support/fake-bar'
import { expect, test } from './support/test'

// The Index (/drinks) against docs/spec/frontend-spec.md: §1 (route), §2
// (Index rows), §3 (family tags, partition), §5 (search degrades, directive
// empty states), §6 (filter mechanics, family header, journey 2), §7 (DrinkCard,
// FamilyBar, FamilyHeader, MatchHeader) and §9 (cocktail search, favourites
// filter), plus the pager. Only conformant behaviour is asserted. Divergences
// are left out on purpose and tracked in the PR that adds this file, among
// them: search ignoring the active family (chrispezza/barback#81), the family
// bar's arrow keys, and "type-ahead disables" (chrispezza/barback#76). Two
// that were left out here have since been fixed and are pinned elsewhere: a
// cold deep link to a family, which listed every drink under the family's
// header until /tags answered (e2e/b-family-reads.spec.ts), and the
// family-aware empty state (e2e/b-family-empty.spec.ts).

interface FamilyCase {
  segment: string
  slug: string
  tag: number
  drinks: string[]
}

// The world's families, in the order families.ts declares them (§3).
const FAMILIES: FamilyCase[] = [
  { segment: 'SOUR', slug: 'sour', tag: T.sour, drinks: ['Daiquiri', 'Gimlet', 'Margarita', 'Penicillin', 'Whiskey Sour'] },
  {
    segment: 'SPIRIT-FORWARD',
    slug: 'spirit-forward',
    tag: T.spiritForward,
    drinks: ['Manhattan', 'Martini', 'Negroni', 'Old Fashioned', 'Rob Roy'],
  },
  { segment: 'HIGHBALL', slug: 'highball', tag: T.highball, drinks: ["Dark 'n' Stormy", 'Gin Tonic', 'Mojito'] },
  { segment: 'TIKI', slug: 'tiki', tag: T.tiki, drinks: [] },
  { segment: 'DESSERT', slug: 'dessert', tag: T.dessert, drinks: ['Espresso Martini'] },
]
const [SOUR, SPIRIT_FORWARD, HIGHBALL] = FAMILIES as [FamilyCase, FamilyCase, FamilyCase, ...FamilyCase[]]

// Bobby Burns carries no family tag (test/fixtures/world.ts).
const ALL_DRINKS = [
  'Bobby Burns',
  'Daiquiri',
  "Dark 'n' Stormy",
  'Espresso Martini',
  'Gimlet',
  'Gin Tonic',
  'Manhattan',
  'Margarita',
  'Martini',
  'Mojito',
  'Negroni',
  'Old Fashioned',
  'Penicillin',
  'Rob Roy',
  'Whiskey Sour',
]

const familyBar = (page: Page) => page.getByRole('group', { name: 'Drink family' })
const segment = (page: Page, name: string) => familyBar(page).getByRole('button', { name, exact: true })
const pressed = (page: Page) => familyBar(page).locator('[aria-pressed="true"]')
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Find a drink' })
const sectionHeading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name, exact: true })

/** The drink names on the listed cards, in order (the ◆ favourite mark is an img). */
const listed = (page: Page) => page.locator('main .card-list > li h3')

/** One listed card by its drink name. */
function card(page: Page, name: string): Locator {
  return page
    .locator('main .card-list > li')
    .filter({ has: page.getByRole('heading', { level: 3, name: new RegExp(`^(Favorited )?${name}$`) }) })
}

/** The Index list queries (per_page=50); the count-only queries ask for one row. */
function listQueries(bar: FakeBar, since = 0): RecordedRequest[] {
  return bar.requests
    .slice(since)
    .filter((r) => r.service === 'api' && r.method === 'GET' && r.path === '/cocktails' && r.query.get('per_page') === '50')
}

function filtersOf(r: RecordedRequest): Record<string, string> {
  return Object.fromEntries([...r.query.entries()].filter(([k]) => k.startsWith('filter[')))
}

/** The world plus fifty sours, so the index and the sour family each run to two pages of 50. */
function pagedWorld(): WorldSeed {
  const world = defaultWorld()
  for (let n = 1; n <= 50; n += 1) {
    world.cocktails.push({
      id: 1000 + n,
      name: `House sour ${String(n).padStart(2, '0')}`,
      tagIds: [T.sour],
      lines: [
        { ingredientId: I.whiteRum, amount: 60, units: 'ml' },
        { ingredientId: I.limeJuice, amount: 22.5, units: 'ml' },
        { ingredientId: I.simpleSyrup, amount: 22.5, units: 'ml' },
      ],
      instructions: 'Shake with ice and strain.',
    })
  }
  return world
}

test('opens on the whole index under All, with the family bar in declared order (§1, §3)', async ({ page, bar }) => {
  await page.goto('/drinks')
  await expect(page).toHaveTitle('Drinks · Barback')
  await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()

  await expect(familyBar(page).getByRole('button')).toHaveText(['ALL', ...FAMILIES.map((f) => f.segment)])
  await expect(pressed(page)).toHaveText(['ALL'])
  await expect(sectionHeading(page, 'The index · 15')).toBeVisible()
  await expect(listed(page)).toHaveText(ALL_DRINKS)
  // No family, no family header.
  await expect(page.getByRole('group', { name: /SPIRIT/ })).toHaveCount(0)

  // §2: browsing is the paginated cocktail index, unfiltered under All.
  expect(listQueries(bar).map(filtersOf)).toEqual([{}])
})

test('journey 2: a family teaches its skeleton, then shows its drinks with stock colouring and its near-misses (§6)', async ({
  page,
  bar,
}) => {
  // A shelf where the sour family's two server sets are clean: three pour and
  // one is a bottle away, with no drink in both (chrispezza/barback#19) and no
  // brand-level child standing in for its parent (chrispezza/barback#20).
  bar.model.shelf.delete(I.laphroaig10)
  bar.model.shelf.add(I.eggWhite)
  bar.model.shelf.add(I.cointreau)

  await page.goto('/drinks')
  await expect(listed(page)).toHaveText(ALL_DRINKS)
  await segment(page, 'SOUR').click()
  await expect(page).toHaveURL(/\/drinks\?family=sour$/)
  await expect(pressed(page)).toHaveText(['SOUR'])

  // The family header: the canonical ratio as a ratio device, fraction glyphs,
  // the italic one-line blurb, then the stock summary.
  const ratio = page.getByRole('group', { name: '2 SPIRIT, ¾ CITRUS, ¾ SWEET', exact: true })
  await expect(ratio).toBeVisible()
  await expect(ratio).toContainText('¾')
  const blurb = page.getByText('Spirit brightened by citrus, balanced by sweet.', { exact: true })
  await expect(blurb).toBeVisible()
  await expect(blurb).toHaveCSS('font-style', 'italic')
  await expect(blurb).toHaveCSS('font-family', /^"Libre Caslon Text"/)
  const summary = page.getByText(/^You can pour \d+ of \d+/)
  await expect(summary).toHaveText(/^You can pour 3 of 5\b/)
  await expect(summary).toHaveText(/\b1 (is|are) one bottle away\.$/)

  // Drinks below the header, coloured by what the shelf holds.
  await expect(listed(page)).toHaveText(SOUR.drinks)
  const ratioBox = await ratio.boundingBox()
  const firstCard = await page.locator('main .card-list > li').first().boundingBox()
  expect(ratioBox && firstCard && ratioBox.y < firstCard.y).toBe(true)

  const daiquiri = card(page, 'Daiquiri')
  await expect(daiquiri).toContainText('Can pour')
  await expect(daiquiri.locator('.bb-drink__have')).toHaveText(['White rum', 'Lime juice', 'Simple syrup'])
  await expect(daiquiri.locator('.bb-drink__missing')).toHaveCount(0)

  // The family's near-miss names the bottle that unlocks it.
  const margarita = card(page, 'Margarita')
  await expect(margarita.locator('.bb-drink__missing')).toHaveText(['Tequila'])
  await expect(margarita.locator('.bb-drink__have')).toHaveText(['Lime juice', 'Cointreau'])
  await expect(margarita).toContainText('One bottle away: Tequila')
  await expect(margarita).not.toContainText('Can pour')

  // The counts are two tag-filtered count queries read from pagination totals.
  const countQueries = bar
    .calls('GET', /^\/cocktails$/)
    .filter((r) => r.query.get('per_page') === '1' && r.query.get('filter[tag_id]') === String(T.sour))
    .map(filtersOf)
  expect(countQueries).toEqual(
    expect.arrayContaining([
      { 'filter[on_shelf]': 'true', 'filter[tag_id]': String(T.sour) },
      { 'filter[missing_ingredients]': '1', 'filter[tag_id]': String(T.sour) },
    ]),
  )

  // Open a drink and come back: the family is still the lens.
  await page.getByRole('heading', { level: 3, name: 'Margarita', exact: true }).click()
  await expect(page).toHaveURL(/\/drinks\/margarita-1$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Margarita' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/drinks\?family=sour$/)
  await expect(pressed(page)).toHaveText(['SOUR'])
  await expect(listed(page)).toHaveText(SOUR.drinks)
})

test('the family bar is single-select, and each family is one tag-filtered query (§6, ADR-002 filter parity)', async ({
  page,
  bar,
}) => {
  await page.goto('/drinks')
  await expect(listed(page)).toHaveText(ALL_DRINKS)

  const seen = new Set<string>()
  for (const family of FAMILIES) {
    const since = bar.requests.length
    const sent = page.waitForRequest(
      (r) => r.url().includes('/bar/api/cocktails?per_page=50&') && r.url().includes(`filter%5Btag_id%5D=${family.tag}&`),
    )
    await segment(page, family.segment).click()
    // §2: every request carries the token, Accept and the bar header.
    expect((await sent).headers()).toMatchObject({
      authorization: `Bearer ${ISSUED_TOKEN}`,
      accept: 'application/json',
      'bar-assistant-bar-id': '1',
    })

    await expect(page).toHaveURL(new RegExp(`/drinks\\?family=${family.slug}$`))
    await expect(pressed(page)).toHaveText([family.segment])
    await expect(listed(page)).toHaveText(family.drinks)
    // One list query, filtered by the tag server-side: the cards are exactly
    // what it returned, with no client-side pass.
    expect(listQueries(bar, since).map(filtersOf)).toEqual([{ 'filter[tag_id]': String(family.tag) }])
    for (const drink of family.drinks) {
      expect(seen.has(drink), `${drink} is in one family only`).toBe(false)
      seen.add(drink)
    }
  }

  // §3 partition: every tagged drink is in exactly one family; the untagged
  // drink appears only under All.
  expect([...seen].sort()).toEqual(ALL_DRINKS.filter((d) => d !== 'Bobby Burns'))
  await segment(page, 'ALL').click()
  await expect(page).toHaveURL(/\/drinks$/)
  await expect(pressed(page)).toHaveText(['ALL'])
  await expect(listed(page)).toHaveText(ALL_DRINKS)

  // One primary axis: stock state is per-card colouring only, never a filter
  // on the list and never a second filter bank.
  for (const r of listQueries(bar)) {
    expect(r.query.has('filter[on_shelf]')).toBe(false)
    expect(r.query.has('filter[missing_ingredients]')).toBe(false)
  }
  await expect(page.getByRole('group', { name: 'Drink family' })).toHaveCount(1)
})

test('the family lives in the URL: a deep link, a reload and the back button all keep it (§6)', async ({ page }) => {
  await page.goto('/drinks?family=spirit-forward')
  await expect(pressed(page)).toHaveText(['SPIRIT-FORWARD'])
  await expect(page.getByRole('group', { name: '2 SPIRIT, 1 VERMOUTH', exact: true })).toBeVisible()
  await expect(listed(page)).toHaveText(SPIRIT_FORWARD.drinks)

  await page.reload()
  await expect(pressed(page)).toHaveText(['SPIRIT-FORWARD'])
  await expect(listed(page)).toHaveText(SPIRIT_FORWARD.drinks)

  await segment(page, 'HIGHBALL').click()
  await expect(page).toHaveURL(/\/drinks\?family=highball$/)
  await expect(listed(page)).toHaveText(HIGHBALL.drinks)

  await page.goBack()
  await expect(page).toHaveURL(/\/drinks\?family=spirit-forward$/)
  await expect(pressed(page)).toHaveText(['SPIRIT-FORWARD'])
  await expect(listed(page)).toHaveText(SPIRIT_FORWARD.drinks)
})

test.describe('search (§9, ADR-004)', () => {
  test('goes to Meilisearch with the scoped key, and hits render as index cards', async ({ page, bar }) => {
    await page.goto('/drinks')
    await expect(listed(page)).toHaveText(ALL_DRINKS)

    const sent = page.waitForRequest((r) => new URL(r.url()).pathname === '/search/indexes/cocktails/search')
    await searchBox(page).fill('dai')
    const request = await sent
    expect(request.method()).toBe('POST')
    expect(request.headers()['authorization']).toBe(`Bearer ${SEARCH_TOKEN}`)
    expect(request.postDataJSON()).toMatchObject({ q: 'dai' })

    await expect(sectionHeading(page, 'Matches · 1')).toBeVisible()
    await expect(listed(page)).toHaveText(['Daiquiri'])
    // Hits are re-read from the API by id, so they carry stock state like any card.
    await expect(card(page, 'Daiquiri')).toContainText('Can pour')
    expect(
      bar.calls('GET', /^\/cocktails$/).some((r) => r.query.get('filter[id]') === String(C.daiquiri)),
    ).toBe(true)
    // While Meilisearch answers, the REST name filter is never used.
    expect(bar.calls('GET', /^\/cocktails$/).filter((r) => r.query.has('filter[name]'))).toEqual([])

    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(searchBox(page)).toHaveValue('')
    await expect(sectionHeading(page, 'The index · 15')).toBeVisible()
    await expect(listed(page)).toHaveText(ALL_DRINKS)
  })

  test('with Meilisearch down, browsing still works and search falls back to the REST name filter (§5)', async ({
    page,
    bar,
  }) => {
    bar.takeSearchDown()
    await page.goto('/drinks')
    await expect(listed(page)).toHaveText(ALL_DRINKS)

    // Enter as well as typing: the spec has type-ahead disable here, and a
    // submitted query must reach the fallback either way.
    await searchBox(page).fill('gim')
    await searchBox(page).press('Enter')
    await expect(sectionHeading(page, 'Matches · 1')).toBeVisible()
    await expect(listed(page)).toHaveText(['Gimlet'])
    await expect(card(page, 'Gimlet')).toContainText('Can pour')
    expect(
      bar
        .calls('GET', /^\/cocktails$/)
        .filter((r) => r.query.has('filter[name]'))
        .map((r) => r.query.get('filter[name]')),
    ).toEqual(['gim'])

    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(listed(page)).toHaveText(ALL_DRINKS)
  })
})

test.describe('favourites filter (§9)', () => {
  test('narrows the list with filter[favorites], composes with the family, and lives in the URL', async ({
    page,
    bar,
  }) => {
    bar.model.favorites.add(C.daiquiri)
    bar.model.favorites.add(C.negroni)

    await page.goto('/drinks')
    await expect(listed(page)).toHaveCount(ALL_DRINKS.length)
    // Under All the favourites are marked on their cards, not filtered.
    await expect(card(page, 'Daiquiri').getByRole('img', { name: 'Favorited' })).toBeVisible()
    await expect(card(page, 'Negroni').getByRole('img', { name: 'Favorited' })).toBeVisible()
    const favourites = page.getByRole('button', { name: /Favorites$/ })
    await expect(favourites).toHaveAttribute('aria-pressed', 'false')

    const since = bar.requests.length
    await favourites.click()
    await expect(page).toHaveURL(/\/drinks\?fav=1$/)
    await expect(favourites).toHaveAttribute('aria-pressed', 'true')
    await expect(sectionHeading(page, 'Favorites · 2')).toBeVisible()
    await expect(listed(page)).toHaveText([/Daiquiri$/, /Negroni$/])
    await expect(page.locator('main .card-list').getByRole('img', { name: 'Favorited' })).toHaveCount(2)
    expect(listQueries(bar, since).map(filtersOf)).toEqual([{ 'filter[favorites]': 'true' }])

    // With a family, the list query carries both filters.
    const before = bar.requests.length
    await page.goto('/drinks?family=sour&fav=1')
    await expect(pressed(page)).toHaveText(['SOUR'])
    await expect(listed(page)).toHaveText([/Daiquiri$/])
    expect(listQueries(bar, before).map(filtersOf)).toContainEqual({
      'filter[tag_id]': String(T.sour),
      'filter[favorites]': 'true',
    })

    // Off again: the family stays, the favourites filter goes.
    await favourites.click()
    await expect(page).toHaveURL(/\/drinks\?family=sour$/)
    await expect(favourites).toHaveAttribute('aria-pressed', 'false')
    await expect(listed(page)).toHaveText(SOUR.drinks.map((d) => new RegExp(`${d}$`)))
    await expect(card(page, 'Daiquiri').getByRole('img', { name: 'Favorited' })).toBeVisible()
  })

  test('with nothing favourited, the empty state names the next action (§5)', async ({ page }) => {
    await page.goto('/drinks?fav=1')
    await expect(sectionHeading(page, 'Favorites · 0')).toBeVisible()
    await expect(listed(page)).toHaveCount(0)
    await expect(
      page.getByText('Nothing favorited yet — Favorite on any recipe starts the collection.', { exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Start with the classics' }).click()
    await expect(page).toHaveURL(/\/first-pours$/)
  })
})

test.describe('pagination', () => {
  test.use({ world: pagedWorld() })

  test('Previous and Next page the index, and the page lives in the URL', async ({ page, bar }) => {
    const previous = page.getByRole('button', { name: 'Previous', exact: true })
    const next = page.getByRole('button', { name: 'Next', exact: true })

    await page.goto('/drinks')
    await expect(sectionHeading(page, 'The index · 65')).toBeVisible()
    await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible()
    await expect(listed(page)).toHaveCount(50)
    await expect(previous).toBeDisabled()
    await expect(next).toBeEnabled()

    await next.click()
    await expect(page).toHaveURL(/\/drinks\?page=2$/)
    await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
    await expect(listed(page)).toHaveCount(15)
    await expect(next).toBeDisabled()
    await expect(previous).toBeEnabled()
    expect(listQueries(bar).map((r) => r.query.get('page'))).toContain('2')

    await page.reload()
    await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
    await expect(listed(page)).toHaveCount(15)

    await previous.click()
    await expect(page).toHaveURL(/\/drinks$/)
    await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible()
    await expect(listed(page)).toHaveCount(50)
  })

  test('a family pages within itself, and another family starts again at page 1', async ({ page, bar }) => {
    const previous = page.getByRole('button', { name: 'Previous', exact: true })
    const next = page.getByRole('button', { name: 'Next', exact: true })

    await page.goto('/drinks?family=sour&page=2')
    await expect(pressed(page)).toHaveText(['SOUR'])
    await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible()
    await expect(listed(page)).toHaveText(['House sour 49', 'House sour 50', 'Margarita', 'Penicillin', 'Whiskey Sour'])
    expect(listQueries(bar).map((r) => [r.query.get('filter[tag_id]'), r.query.get('page')])).toContainEqual([
      String(T.sour),
      '2',
    ])

    await previous.click()
    await expect(page).toHaveURL(/\/drinks\?family=sour$/)
    await expect(listed(page)).toHaveCount(50)
    await next.click()
    await expect(page).toHaveURL(/\/drinks\?family=sour&page=2$/)
    await expect(listed(page)).toHaveCount(5)

    await segment(page, 'SPIRIT-FORWARD').click()
    await expect(page).toHaveURL(/\/drinks\?family=spirit-forward$/)
    await expect(listed(page)).toHaveText(SPIRIT_FORWARD.drinks)
    await expect(page.getByText(/^Page \d+ of \d+$/)).toHaveCount(0)
  })
})
