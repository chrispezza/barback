import type { Locator, Page } from '@playwright/test'
import { bareWorld, I, USER_ID } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// Shelf (/shelf) against docs/spec/frontend-spec.md: §1 (route), §2 (Shelf
// calls), §4 (shelf writes refresh what is derived from the shelf), §5 (a
// refused write leaves the shelf as it was; search degrades to REST), §6
// journey 3 (check-off lands the bottle on the shelf), §7 (chip, row, header,
// empty state, toast contracts; keyboard operable, 2px brass focus ring) and
// §9 "Shelf ledger: rows grouped by root ancestor via materialized_path;
// always-visible remove (touch-reachable)". Driven against the fake bar
// (ADR-011). Only conformant behaviour is asserted here: where the code and
// the spec disagree the case is left out and tracked in an issue instead.
//
// The default world shelves eleven bottles under six roots: Spirits (Bourbon
// whiskey, Gin, Laphroaig 10 — three levels below its root — and White rum),
// Beverages, Bitters, Fortified wine, Juices and Sweeteners.

const DEFAULT_GROUPS = [
  'Spirits · 4',
  'Beverages · 2',
  'Bitters · 1',
  'Fortified wine · 1',
  'Juices · 2',
  'Sweeteners · 1',
]

const SHELF_WRITE = /^\/users\/\d+\/ingredients\/batch-(store|delete)$/
const STORE = `/users/${USER_ID}/ingredients/batch-store`
const DELETE = `/users/${USER_ID}/ingredients/batch-delete`

/** The brass focus ring: 2px solid brass-500 (#C6A15B), 2px offset (§7, Visual foundations). */
const BRASS = 'rgb(198, 161, 91)'

function groupHeaders(page: Page): Locator {
  return page.getByRole('main').getByRole('heading', { level: 2 })
}

/** The bottle names under one root's header, in ledger order. */
function bottlesUnder(page: Page, root: string): Locator {
  return page
    .getByRole('main')
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: new RegExp(`^${root} · \\d+$`) }) })
    .locator('.shelf-row-main')
}

function countLine(page: Page): Locator {
  return page.getByRole('main').getByText(/ bottles on the shelf\.$/)
}

function picker(page: Page): Locator {
  return page.getByRole('searchbox', { name: 'Add a bottle' })
}

function chip(page: Page, name: string): Locator {
  return page.getByRole('main').getByRole('button', { name, exact: true })
}

function removeControl(page: Page, name: string): Locator {
  return page.getByRole('button', { name: `Remove ${name} from the shelf` })
}

function shelfWrites(bar: FakeBar) {
  return bar.calls('POST', SHELF_WRITE).map((c) => ({ path: c.path, body: c.body }))
}

/** A tap on the phone project (touch, no hover), a click on desktop. */
async function press(target: Locator, hasTouch: boolean): Promise<void> {
  if (hasTouch) await target.tap()
  else await target.click()
}

async function openShelf(page: Page): Promise<void> {
  await page.goto('/shelf')
  await expect(groupHeaders(page).first()).toBeVisible()
}

async function focusRing(target: Locator) {
  return target.evaluate((el) => {
    const s = getComputedStyle(el)
    return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, offset: s.outlineOffset }
  })
}

test.describe('the ledger', () => {
  test('groups bottles under their root ancestor, Spirits first, each header counted', async ({ page, bar }) => {
    await page.goto('/shelf')
    await expect(page).toHaveTitle('Shelf · Barback')
    await expect(page.getByRole('heading', { level: 1, name: 'Shelf' })).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Shelf/ }),
    ).toHaveAttribute('aria-current', 'page')

    await expect(groupHeaders(page)).toHaveText(DEFAULT_GROUPS)
    // Laphroaig 10's path is Spirits/Whisky/Scotch whisky/Islay Scotch: the
    // ledger groups by the root, not the parent.
    await expect(bottlesUnder(page, 'Spirits')).toHaveText(['Bourbon whiskey', 'Gin', 'Laphroaig 10', 'White rum'])
    await expect(bottlesUnder(page, 'Juices')).toHaveText(['Lemon juice', 'Lime juice'])
    await expect(countLine(page)).toHaveText('11 bottles on the shelf.')
    // §7 ShelfRow: fraction text, never a progress bar.
    await expect(page.getByRole('progressbar')).toHaveCount(0)

    // §2: the ledger reads the user's shelf through the on_shelf filter.
    expect(bar.calls('GET', /^\/ingredients$/).some((c) => c.query.get('filter[on_shelf]') === 'true')).toBe(true)
  })

  test('a root ingredient on the shelf heads its own group', async ({ page, bar }) => {
    // A root has no materialized_path (MaterializedPath::toStringPath); it
    // groups under itself, beside its descendants.
    bar.model.shelf.add(I.bitters)
    await openShelf(page)
    await expect(groupHeaders(page)).toHaveText([
      'Spirits · 4',
      'Beverages · 2',
      'Bitters · 2',
      'Fortified wine · 1',
      'Juices · 2',
      'Sweeteners · 1',
    ])
    await expect(bottlesUnder(page, 'Bitters')).toHaveText(['Angostura aromatic bitters', 'Bitters'])
    await expect(countLine(page)).toHaveText('12 bottles on the shelf.')
  })

  test('every bottle has a remove control that is named, visible at rest and touch-sized', async ({ page }) => {
    await openShelf(page)
    const removes = page.getByRole('main').getByRole('button', { name: /^Remove .+ from the shelf$/ })
    await expect(removes).toHaveCount(11)
    await expect(removeControl(page, 'Laphroaig 10')).toBeVisible()
    // §9: always visible, never hover-gated; every target at least 44px.
    for (const control of await removes.all()) {
      await expect(control).toBeVisible()
      await expect(control).toHaveCSS('opacity', '1')
      const box = await control.boundingBox()
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
  })
})

test.describe('adding a bottle', () => {
  test('a Meilisearch hit becomes a chip, and the chip shelves the bottle into its group', async ({ page, bar, hasTouch }) => {
    await openShelf(page)
    await picker(page).fill('campari')
    const campari = chip(page, 'Campari')
    await expect(campari).toHaveAttribute('aria-pressed', 'false')
    // ADR-004: type-ahead goes to the ingredients index with the scoped key.
    expect(
      bar.requests.filter((r) => r.service === 'search' && r.path === '/indexes/ingredients/search').map((r) => r.body),
    ).toContainEqual(expect.objectContaining({ q: 'campari' }))
    expect(bar.calls('GET', /^\/ingredients$/).filter((c) => c.query.has('filter[name]'))).toEqual([])

    await press(campari, hasTouch)

    await expect.poll(() => shelfWrites(bar)).toEqual([{ path: STORE, body: { ingredients: [I.campari] } }])
    // §7: in-shelf is never colour alone — pressed, with the check mark.
    await expect(campari).toHaveAttribute('aria-pressed', 'true')
    await expect(campari).toContainText('✓')
    await expect(groupHeaders(page)).toHaveText([
      'Spirits · 4',
      'Beverages · 2',
      'Bitters · 1',
      'Fortified wine · 1',
      'Juices · 2',
      'Liqueurs · 1',
      'Sweeteners · 1',
    ])
    await expect(bottlesUnder(page, 'Liqueurs')).toHaveText(['Campari'])
    await expect(countLine(page)).toHaveText('12 bottles on the shelf.')
  })

  test('with Meilisearch down, the REST name filter still finds the bottle', async ({ page, bar, hasTouch }) => {
    bar.takeSearchDown()
    await openShelf(page)
    await picker(page).fill('tequila')
    const tequila = chip(page, 'Tequila')
    await expect(tequila).toHaveAttribute('aria-pressed', 'false')
    // ADR-004 consequence: the API answers by name when search does not.
    expect(bar.calls('GET', /^\/ingredients$/).map((c) => c.query.get('filter[name]'))).toContain('tequila')

    await press(tequila, hasTouch)

    await expect.poll(() => shelfWrites(bar)).toEqual([{ path: STORE, body: { ingredients: [I.tequila] } }])
    await expect(tequila).toHaveAttribute('aria-pressed', 'true')
    await expect(bottlesUnder(page, 'Spirits')).toHaveText(['Bourbon whiskey', 'Gin', 'Laphroaig 10', 'Tequila', 'White rum'])
    await expect(groupHeaders(page).first()).toHaveText('Spirits · 5')
    await expect(countLine(page)).toHaveText('12 bottles on the shelf.')
  })

  test('chips mark what is already shelved, and a pressed chip takes the bottle off', async ({ page, bar, hasTouch }) => {
    await openShelf(page)
    await picker(page).fill('gin')
    const gin = chip(page, 'Gin')
    await expect(gin).toHaveAttribute('aria-pressed', 'true')
    await expect(gin).toContainText('✓')
    await expect(chip(page, 'London dry gin')).toHaveAttribute('aria-pressed', 'false')
    await expect(chip(page, 'London dry gin')).not.toContainText('✓')
    await expect(chip(page, 'Ginger beer')).toHaveAttribute('aria-pressed', 'false')

    await press(gin, hasTouch)

    await expect.poll(() => shelfWrites(bar)).toEqual([{ path: DELETE, body: { ingredients: [I.gin] } }])
    await expect(gin).toHaveAttribute('aria-pressed', 'false')
    await expect(bottlesUnder(page, 'Spirits')).toHaveText(['Bourbon whiskey', 'Laphroaig 10', 'White rum'])
    await expect(page.getByRole('alert')).toHaveText(/Bottle removed from the shelf\./)
  })

  test('a search with no match says so, and Clear empties the picker', async ({ page }) => {
    await openShelf(page)
    await picker(page).fill('zzz')
    await expect(page.getByText('Nothing by that name.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(picker(page)).toHaveValue('')
    await expect(page.getByText('Nothing by that name.')).toHaveCount(0)
  })

  test('an add the bar refuses leaves the shelf as it was, and says so', async ({ page, bar, hasTouch }) => {
    bar.fail(/\/ingredients\/batch-store$/, { method: 'POST', status: 500 })
    await openShelf(page)
    await picker(page).fill('campari')
    const campari = chip(page, 'Campari')
    await press(campari, hasTouch)

    // §5: on error the toggle rolls back. End state only.
    await expect(page.getByRole('status')).toHaveText('The shelf didn’t take that change.')
    expect(shelfWrites(bar)).toEqual([{ path: STORE, body: { ingredients: [I.campari] } }])
    await expect(campari).toHaveAttribute('aria-pressed', 'false')
    await expect(groupHeaders(page)).toHaveText(DEFAULT_GROUPS)
    await expect(countLine(page)).toHaveText('11 bottles on the shelf.')
    expect(bar.model.shelf.has(I.campari)).toBe(false)
  })
})

test.describe('removing a bottle', () => {
  test('remove takes the bottle off; the destructive toast’s Undo puts it back', async ({ page, bar, hasTouch }) => {
    await openShelf(page)
    await press(removeControl(page, 'White rum'), hasTouch)

    await expect.poll(() => shelfWrites(bar)).toEqual([{ path: DELETE, body: { ingredients: [I.whiteRum] } }])
    // Destructive toasts are announced assertively and carry the Undo.
    const toast = page.getByRole('alert').filter({ hasText: 'Bottle removed from the shelf.' })
    await expect(toast).toBeVisible()
    await expect(bottlesUnder(page, 'Spirits')).toHaveText(['Bourbon whiskey', 'Gin', 'Laphroaig 10'])
    await expect(groupHeaders(page).first()).toHaveText('Spirits · 3')
    await expect(countLine(page)).toHaveText('10 bottles on the shelf.')

    await press(toast.getByRole('button', { name: 'Undo' }), hasTouch)

    await expect
      .poll(() => shelfWrites(bar))
      .toEqual([
        { path: DELETE, body: { ingredients: [I.whiteRum] } },
        { path: STORE, body: { ingredients: [I.whiteRum] } },
      ])
    await expect(toast).toHaveCount(0)
    await expect(bottlesUnder(page, 'Spirits')).toHaveText(['Bourbon whiskey', 'Gin', 'Laphroaig 10', 'White rum'])
    await expect(groupHeaders(page)).toHaveText(DEFAULT_GROUPS)
    await expect(countLine(page)).toHaveText('11 bottles on the shelf.')
  })

  test('removing the last bottle under a root drops its group', async ({ page, hasTouch }) => {
    await openShelf(page)
    await press(removeControl(page, 'Angostura aromatic bitters'), hasTouch)
    await expect(groupHeaders(page)).toHaveText([
      'Spirits · 4',
      'Beverages · 2',
      'Fortified wine · 1',
      'Juices · 2',
      'Sweeteners · 1',
    ])
    await expect(countLine(page)).toHaveText('10 bottles on the shelf.')
  })

  test('a removal the bar refuses keeps the bottle, and says so', async ({ page, bar, hasTouch }) => {
    bar.fail(/\/ingredients\/batch-delete$/, { method: 'POST', status: 500 })
    await openShelf(page)
    await press(removeControl(page, 'White rum'), hasTouch)

    await expect(page.getByRole('status')).toHaveText('The shelf didn’t take that change.')
    expect(shelfWrites(bar)).toEqual([{ path: DELETE, body: { ingredients: [I.whiteRum] } }])
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(bottlesUnder(page, 'Spirits')).toHaveText(['Bourbon whiskey', 'Gin', 'Laphroaig 10', 'White rum'])
    await expect(countLine(page)).toHaveText('11 bottles on the shelf.')
    expect(bar.model.shelf.has(I.whiteRum)).toBe(true)
  })
})

test('the picker chips and remove controls work from the keyboard, with the brass focus ring', async ({ page, bar }) => {
  await openShelf(page)

  // From the picker, Tab reaches the first bottle's remove control.
  await picker(page).focus()
  await page.keyboard.press('Tab')
  const removeBourbon = removeControl(page, 'Bourbon whiskey')
  await expect(removeBourbon).toBeFocused()
  expect(await focusRing(removeBourbon)).toEqual({ style: 'solid', width: '2px', color: BRASS, offset: '2px' })
  await page.keyboard.press('Enter')
  await expect.poll(() => shelfWrites(bar)).toEqual([{ path: DELETE, body: { ingredients: [I.bourbon] } }])
  await expect(bottlesUnder(page, 'Spirits')).toHaveText(['Gin', 'Laphroaig 10', 'White rum'])

  // Type, then Tab past Clear to the first chip; Space toggles it.
  await picker(page).focus()
  await page.keyboard.type('campari')
  const campari = chip(page, 'Campari')
  await expect(campari).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(campari).toBeFocused()
  expect(await focusRing(campari)).toEqual({ style: 'solid', width: '2px', color: BRASS, offset: '2px' })
  await page.keyboard.press('Space')
  await expect(campari).toHaveAttribute('aria-pressed', 'true')
  await expect(bottlesUnder(page, 'Liqueurs')).toHaveText(['Campari'])
})

test.describe('a bare shelf', () => {
  test.use({ world: bareWorld() })

  test('says what to do, and the first bottle starts the ledger', async ({ page, bar, hasTouch }) => {
    await page.goto('/shelf')
    // §5 / design system: empty states are directive, never apologetic.
    await expect(page.getByRole('heading', { level: 3, name: 'Nothing on the shelf' })).toBeVisible()
    await expect(
      page.getByText('Add the bottles you own and Tonight starts answering for itself.'),
    ).toBeVisible()
    await expect(countLine(page)).toHaveText('0 bottles on the shelf.')
    await expect(groupHeaders(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Remove .+ from the shelf$/ })).toHaveCount(0)

    await picker(page).fill('white')
    await press(chip(page, 'White rum'), hasTouch)

    await expect.poll(() => shelfWrites(bar)).toEqual([{ path: STORE, body: { ingredients: [I.whiteRum] } }])
    await expect(groupHeaders(page)).toHaveText(['Spirits · 1'])
    await expect(bottlesUnder(page, 'Spirits')).toHaveText(['White rum'])
    await expect(page.getByRole('heading', { level: 3, name: 'Nothing on the shelf' })).toHaveCount(0)
  })
})

test('when the shelf read fails, the error line offers a retry that recovers', async ({ page, bar }) => {
  // The query client retries once, so the first two reads fail.
  bar.fail(/^\/ingredients$/, { method: 'GET', status: 500, times: 2 })
  await page.goto('/shelf')
  const error = page.getByRole('alert')
  await expect(error).toContainText('The bar didn’t answer — try again.')
  await expect(groupHeaders(page)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 3, name: 'Nothing on the shelf' })).toHaveCount(0)

  await error.getByRole('button', { name: 'Retry' }).click()

  await expect(groupHeaders(page)).toHaveText(DEFAULT_GROUPS)
  await expect(countLine(page)).toHaveText('11 bottles on the shelf.')
  await expect(error).toHaveCount(0)
})

test('a bottle checked off the list on Tonight is on the ledger (§6 journey 3)', async ({ page, bar, hasTouch }) => {
  bar.model.list.set(I.campari, 1)
  await page.goto('/tonight')
  await press(page.getByRole('main').getByRole('button', { name: /^Campari/ }), hasTouch)
  await expect(page.getByRole('status')).toContainText('Moved to the shelf.')

  await press(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Shelf/ }), hasTouch)

  await expect(page.getByRole('heading', { level: 1, name: 'Shelf' })).toBeVisible()
  await expect(bottlesUnder(page, 'Liqueurs')).toHaveText(['Campari'])
  await expect(countLine(page)).toHaveText('12 bottles on the shelf.')
})

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'the nav rail exists only at 900px and wider')

  test('a shelf change refreshes the rail’s standing (§4)', async ({ page, hasTouch }) => {
    await openShelf(page)
    const standing = page.getByRole('navigation', { name: 'Main' }).getByText(/ bottles · \d+ pourable$/)
    await expect(standing).toHaveText('11 bottles · 5 pourable')

    // White rum is the Daiquiri's only rum.
    await press(removeControl(page, 'White rum'), hasTouch)
    await expect(standing).toHaveText('10 bottles · 4 pourable')
    await press(page.getByRole('alert').getByRole('button', { name: 'Undo' }), hasTouch)
    await expect(standing).toHaveText('11 bottles · 5 pourable')

    // Campari completes the Negroni (gin and sweet vermouth are shelved).
    await picker(page).fill('campari')
    await press(chip(page, 'Campari'), hasTouch)
    await expect(standing).toHaveText('12 bottles · 6 pourable')
  })

  test('the rail carries Log out, so the Shelf does not repeat it', async ({ page }) => {
    await openShelf(page)
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Log out' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('button', { name: 'Log out' })).toBeHidden()
  })
})

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'Log out moves from the rail to the end of the Shelf below 900px')

  test('Log out sits at the end of the Shelf and returns to the door', async ({ page }) => {
    await openShelf(page)
    const logout = page.getByRole('main').getByRole('button', { name: 'Log out' })
    await expect(logout).toBeVisible()
    await logout.tap()

    await expect(page).toHaveURL(/\/login$/)
    expect(await page.evaluate(() => localStorage.getItem('barback.token'))).toBeNull()
    await page.goto('/shelf')
    await expect(page).toHaveURL(/\/login\?next=%2Fshelf$/)
  })
})
