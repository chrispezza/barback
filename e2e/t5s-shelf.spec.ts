import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { defaultWorld, I } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// The Shelf as a keyboard and screen-reader user meets it, and its "Add a
// bottle" chips when the shelf cannot be read.
//
// - ADR-003 Consequences: "SPA routing/focus management must be handled
//   deliberately for accessibility (the design system's focus-visible and
//   keyboard rules)". frontend-spec §7: "all interactive elements
//   keyboard-operable, focus-visible 2px brass outline". Remove takes its row
//   away, and the focused button with it; the focus must land on the ledger,
//   never on the page body. It goes to the next bottle's Remove in the group,
//   or the one before it when the bottle was the group's last; when the group
//   empties and is dropped, to the heading of the group now in its place (or
//   the one before it), made focusable for the purpose; when the shelf empties,
//   to the screen's heading.
// - ADR-007 Consequences: "No stock answer is ever served stale"; a shelf read
//   that failed is not known (chrispezza/barback#105, the picker part). A chip
//   marked "have" from the shelf's last answer decides the write a tap sends:
//   from a stale shelf it can send batch-delete for a bottle that is no longer
//   there (or batch-store for one that is). With the shelf unknown the chips
//   claim no state, a tap on one sends nothing, and the page's one error line
//   says why. The ledger's own visibility is #105's decision, not this spec's.
// - The Back Bar Design System readme, Visual foundations: "focus-visible only:
//   2px solid brass, 2px offset ... never removed".

const ERROR = 'The bar didn’t answer — try again.'
const SHELF_WRITE = /^\/users\/\d+\/ingredients\/batch-(store|delete)$/
const BRASS = 'rgb(198, 161, 91)'
const RING = { style: 'solid', width: '2px', color: BRASS, offset: '2px' }
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function groupHeading(page: Page, header: string): Locator {
  return page.getByRole('main').getByRole('heading', { level: 2, name: header, exact: true })
}

/** The bottle names under one root's header, in ledger order. */
function bottlesUnder(page: Page, root: string): Locator {
  return page
    .getByRole('main')
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: new RegExp(`^${escapeRegExp(root)} · \\d+$`) }) })
    .locator('.shelf-row-main')
}

function removeControl(page: Page, name: string): Locator {
  return page.getByRole('main').getByRole('button', { name: `Remove ${name} from the shelf`, exact: true })
}

function picker(page: Page): Locator {
  return page.getByRole('searchbox', { name: 'Add a bottle' })
}

function chipRow(page: Page): Locator {
  return page.getByRole('main').locator('.chip-row')
}

function chip(page: Page, name: string): Locator {
  return chipRow(page).getByRole('button', { name, exact: true })
}

function countLine(page: Page): Locator {
  return page.locator('.shelf-count')
}

function shelfWrites(bar: FakeBar) {
  return bar.calls('POST', SHELF_WRITE).map((c) => ({ path: c.path, body: c.body }))
}

/**
 * Open the Shelf and wait until its ledger is grouped (the root names read:
 * until then it is flat, and the grouped rows that replace it are new
 * elements) and the profile every shelf write is addressed by has answered.
 */
async function openShelf(page: Page, count = '11 bottles on the shelf.', groups = 6): Promise<void> {
  const profile = page.waitForResponse((r) => new URL(r.url()).pathname === '/bar/api/profile' && r.ok())
  await page.goto('/shelf')
  await expect(countLine(page)).toHaveText(count)
  await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(groups)
  await profile
}

/** What holds the focus, as a screen reader would name it, or the page body. */
function focusIsOn(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (el === null || el === document.body) return 'the page body'
    const name = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? ''
    return `${el.tagName} ${name}`
  })
}

async function focusRing(target: Locator) {
  return target.evaluate((el) => {
    const s = getComputedStyle(el)
    return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, offset: s.outlineOffset }
  })
}

/** Reach a Remove the way a keyboard does: from the Remove before it, by Tab. */
async function tabTo(page: Page, from: string, to: string): Promise<Locator> {
  await removeControl(page, from).focus()
  await page.keyboard.press('Tab')
  const target = removeControl(page, to)
  await expect(target).toBeFocused()
  return target
}

/**
 * Fail every read of the user's shelf (GET /ingredients?filter[on_shelf]=true)
 * with a 500 while armed, in front of the fake; every other request falls
 * through to it. Returns how many shelf reads were failed.
 */
async function failShelfReads(page: Page): Promise<{ failed: () => number; stop: () => void }> {
  let armed = true
  let failed = 0
  await page.route(
    (url) => url.pathname === '/bar/api/ingredients' && url.searchParams.get('filter[on_shelf]') === 'true',
    (route) => {
      if (!armed || route.request().method() !== 'GET') return route.fallback()
      failed += 1
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Server Error"}' })
    },
  )
  return { failed: () => failed, stop: () => (armed = false) }
}

/** Resolve once the fake has recorded no new request for `quietMs`. */
async function settled(bar: FakeBar, quietMs = 500): Promise<void> {
  let seen = -1
  let since = Date.now()
  await expect
    .poll(
      () => {
        const count = bar.requests.length
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

/** A tap on the phone project, a click on desktop; `force` reaches a held control. */
async function press(target: Locator, hasTouch: boolean, force = false): Promise<void> {
  if (hasTouch) await target.tap({ force })
  else await target.click({ force })
}

test.describe('Remove leaves the focus on the ledger (ADR-003; §7)', () => {
  test('Enter on a Remove hands the focus to the next bottle’s Remove in its group', async ({ page, bar }) => {
    await openShelf(page)
    await tabTo(page, 'Bourbon whiskey', 'Gin')

    await page.keyboard.press('Enter')

    await expect(bottlesUnder(page, 'Spirits')).toHaveText(['Bourbon whiskey', 'Laphroaig 10', 'White rum'])
    expect(await focusIsOn(page), 'the focus once Gin’s row is gone').toBe(
      'BUTTON Remove Laphroaig 10 from the shelf',
    )
    const next = removeControl(page, 'Laphroaig 10')
    await expect(next).toBeFocused()
    expect(await focusRing(next), 'the keyboard’s ring on the next Remove').toEqual(RING)

    // The removal is answered and read back; the focus stays where it went.
    await expect(page.getByRole('alert')).toContainText('Bottle removed from the shelf.')
    await expect.poll(() => shelfWrites(bar)).toEqual([
      { path: `/users/${bar.model.world.user.id}/ingredients/batch-delete`, body: { ingredients: [I.gin] } },
    ])
    await settled(bar)
    await expect(next).toBeFocused()
  })

  test('the last bottle in a group hands the focus to the Remove before it', async ({ page }) => {
    await openShelf(page)
    await tabTo(page, 'Laphroaig 10', 'White rum')

    await page.keyboard.press('Enter')

    await expect(bottlesUnder(page, 'Spirits')).toHaveText(['Bourbon whiskey', 'Gin', 'Laphroaig 10'])
    expect(await focusIsOn(page), 'the focus once White rum’s row is gone').toBe(
      'BUTTON Remove Laphroaig 10 from the shelf',
    )
    await expect(removeControl(page, 'Laphroaig 10')).toBeFocused()
  })

  test('a group’s only bottle hands the focus to the heading of the group now in its place', async ({ page }) => {
    await openShelf(page)
    await tabTo(page, 'Tonic', 'Angostura aromatic bitters')

    await page.keyboard.press('Enter')

    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
      'Spirits · 4',
      'Beverages · 2',
      'Fortified wine · 1',
      'Juices · 2',
      'Sweeteners · 1',
    ])
    expect(await focusIsOn(page), 'the focus once the Bitters group is gone').toBe('H2 Fortified wine · 1')
    const heading = groupHeading(page, 'Fortified wine · 1')
    await expect(heading).toBeFocused()
    // Focusable for the purpose, never a Tab stop of its own.
    await expect(heading).toHaveAttribute('tabindex', '-1')
    expect(await focusRing(heading), 'the keyboard’s ring on the heading').toEqual(RING)

    // The next Tab goes on into the group the heading names.
    await page.keyboard.press('Tab')
    await expect(removeControl(page, 'Sweet vermouth')).toBeFocused()
  })

  test('the last group’s only bottle hands the focus to the heading of the group before it', async ({ page }) => {
    await openShelf(page)
    await tabTo(page, 'Lime juice', 'Simple syrup')

    await page.keyboard.press('Enter')

    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
      'Spirits · 4',
      'Beverages · 2',
      'Bitters · 1',
      'Fortified wine · 1',
      'Juices · 2',
    ])
    expect(await focusIsOn(page), 'the focus once the Sweeteners group is gone').toBe('H2 Juices · 2')
    await expect(groupHeading(page, 'Juices · 2')).toBeFocused()
  })

  test('a tap or a click on Remove moves the focus on too, without the keyboard’s ring', async ({
    page,
    hasTouch,
  }) => {
    await openShelf(page)

    await press(removeControl(page, 'Gin'), hasTouch)

    await expect(bottlesUnder(page, 'Spirits')).toHaveText(['Bourbon whiskey', 'Laphroaig 10', 'White rum'])
    expect(await focusIsOn(page), 'the focus once Gin’s row is gone').toBe(
      'BUTTON Remove Laphroaig 10 from the shelf',
    )
    // focus-visible only: a pointer's press paints no ring (Visual foundations).
    expect(await removeControl(page, 'Laphroaig 10').evaluate((el) => el.matches(':focus-visible'))).toBe(false)
  })

  test.describe('with one bottle on the shelf', () => {
    test.use({ world: { ...defaultWorld(), shelf: [I.gin] } })

    test('its Remove hands the focus to the screen’s heading, above the empty state', async ({ page }) => {
      await openShelf(page, '1 bottle on the shelf.', 1)
      await picker(page).focus()
      await page.keyboard.press('Tab')
      await expect(removeControl(page, 'Gin')).toBeFocused()

      await page.keyboard.press('Enter')

      await expect(page.getByRole('main').getByRole('heading', { name: 'Nothing on the shelf' })).toBeVisible()
      expect(await focusIsOn(page), 'the focus once the shelf is empty').toBe('H1 Shelf')
      await expect(page.getByRole('heading', { level: 1, name: 'Shelf' })).toBeFocused()
    })
  })
})

test.describe('the "Add a bottle" chips with the shelf unknown (ADR-007; #105)', () => {
  /**
   * The warm path: the shelf was read and the picker marks Gin as on it. Then
   * Gin goes off the shelf from another device, the shelf can no longer be
   * read, and the tab comes back into view, so the shelf is asked again and
   * the read and its one retry fail. Returns Gin's chip.
   */
  async function staleShelf(page: Page, bar: FakeBar): Promise<Locator> {
    await openShelf(page)
    await picker(page).fill('gin')
    const gin = chip(page, 'Gin')
    await expect(gin).toHaveAttribute('aria-pressed', 'true')
    await expect(gin).toContainText('✓')

    bar.model.shelf.delete(I.gin)
    const reads = await failShelfReads(page)
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))

    // The page's one error line says so.
    await expect(page.getByRole('alert')).toContainText(ERROR)
    await expect(page.getByRole('alert')).toHaveCount(1)
    expect(reads.failed()).toBe(2)
    return gin
  }

  test('a tap on a chip the stale shelf marked sends nothing, not the opposite write', async ({
    page,
    bar,
    hasTouch,
  }) => {
    const gin = await staleShelf(page, bar)

    await press(gin, hasTouch, true)
    await settled(bar)

    // Before the fix this tap sent batch-delete for Gin, decided from the
    // shelf's last answer: Gin is no longer on the shelf.
    expect(shelfWrites(bar), 'shelf writes sent from a shelf that could not be read').toEqual([])
    expect(bar.model.shelf.has(I.gin)).toBe(false)
  })

  test('a shelf read that fails on its refetch takes every mark off the chips and holds them', async ({
    page,
    bar,
  }) => {
    const gin = await staleShelf(page, bar)

    // No chip claims what the shelf holds: no ✓, no pressed state either way.
    const chips = chipRow(page).locator('.bb-chip')
    await expect(chips).toHaveText(['Gin', 'London dry gin', 'Ginger beer'])
    for (const each of await chips.all()) {
      await expect(each).not.toHaveAttribute('aria-pressed')
      await expect(each).not.toContainText('✓')
      await expect(each).toHaveAttribute('data-state', 'default')
      // Held: aria-disabled, so the focus a keyboard gives it stays.
      await expect(each).toHaveAttribute('aria-disabled', 'true')
      await expect(each).toBeDisabled()
    }

    // Enter from the keyboard: nothing is sent, and the focus holds.
    await gin.focus()
    await page.keyboard.press('Enter')
    await settled(bar)
    expect(shelfWrites(bar), 'shelf writes sent from a shelf that could not be read').toEqual([])
    await expect(gin).toBeFocused()
  })

  test('a shelf that was never read marks no chip, and a tap sends nothing', async ({ page, bar, hasTouch }) => {
    // The shelf read and its one retry fail from the start (cold path).
    bar.fail(/^\/ingredients$/, { method: 'GET', status: 500, times: 2 })
    await page.goto('/shelf')
    await expect(page.getByRole('alert')).toContainText(ERROR)

    await picker(page).fill('gin')
    const gin = chip(page, 'Gin')
    await expect(gin).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(1)

    await press(gin, hasTouch, true)
    await settled(bar)

    // Before the fix this tap sent batch-store for a bottle already on the
    // shelf, which upstream also takes off the shopping list
    // (ShelfController::batchStore, ShelfController.php 140-142).
    expect(shelfWrites(bar), 'shelf writes sent from a shelf that was never read').toEqual([])
    expect(bar.model.shelf.has(I.gin)).toBe(true)
    await expect(gin).not.toHaveAttribute('aria-pressed')
    await expect(gin).toBeDisabled()
  })

  test('Retry reads the shelf, and the chips take back their marks and their taps', async ({
    page,
    bar,
    hasTouch,
  }) => {
    await openShelf(page)
    await picker(page).fill('gin')
    await expect(chip(page, 'Gin')).toHaveAttribute('aria-pressed', 'true')
    bar.model.shelf.delete(I.gin)
    const reads = await failShelfReads(page)
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    const alert = page.getByRole('alert')
    await expect(alert).toContainText(ERROR)
    await expect(chip(page, 'Gin')).toBeDisabled()

    reads.stop()
    await press(alert.getByRole('button', { name: 'Retry' }), hasTouch)

    // The shelf as the bar now holds it: Gin is off it, so its chip adds it.
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(countLine(page)).toHaveText('10 bottles on the shelf.')
    const gin = chip(page, 'Gin')
    await expect(gin).toHaveAttribute('aria-pressed', 'false')
    await expect(gin).toBeEnabled()
    await expect(gin).not.toHaveAttribute('aria-disabled')
    await press(gin, hasTouch)
    await expect.poll(() => shelfWrites(bar)).toEqual([
      { path: `/users/${bar.model.world.user.id}/ingredients/batch-store`, body: { ingredients: [I.gin] } },
    ])
    await expect(gin).toHaveAttribute('aria-pressed', 'true')
    expect(bar.model.shelf.has(I.gin)).toBe(true)
  })
})

test.describe('axe finds nothing on the Shelf (WCAG 2.2 AA)', () => {
  test('with the chips held, and with the focus on a heading after a Remove', async ({ page }) => {
    await openShelf(page)
    const scan = () => new AxeBuilder({ page }).include('main').withTags(WCAG).analyze()

    await tabTo(page, 'Tonic', 'Angostura aromatic bitters')
    await page.keyboard.press('Enter')
    await expect(groupHeading(page, 'Fortified wine · 1')).toBeFocused()
    expect((await scan()).violations, 'with the focus on a group heading').toEqual([])

    await picker(page).fill('gin')
    await expect(chip(page, 'Gin')).toHaveAttribute('aria-pressed', 'true')
    await failShelfReads(page)
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    await expect(page.getByRole('alert').filter({ hasText: ERROR })).toBeVisible()
    await expect(chip(page, 'Gin')).toBeDisabled()
    expect((await scan()).violations, 'with the chips held').toEqual([])
  })
})
