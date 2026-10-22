import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { I, bareWorld, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Tonight's marks and copy against the design system's "Content fundamentals"
// and "Iconography" (The Back Bar Design System/readme.md), on both projects.
//
// - Affordances are words. "Affordances are words in the utility caps voice —
//   REMOVE, UNDO, CLEAR, ADD A BOTTLE — not glyphs"; the only marks are ◆, ✓
//   and ·. A To buy row's drop action is the word Remove, still named for the
//   bottle it takes off the list. The near-miss action says what the rest of
//   Tonight says, List it (Buy next, For your favorites, Restock next), and its
//   name starts with those words, so a speech user who says what they see
//   reaches it (WCAG 2.5.3 Label in Name), while still naming the bottle.
// - Say only what the data supports. The names a bare shelf (or a shelf from
//   which nothing pours) starts with are Restock next's, the server's ranking
//   (frontend-spec §5: "wired from bars/{id}/ingredients/recommend"). That
//   ranking counts the recipes that call a bottle at all
//   (IngredientService::getIngredientsForPossibleCocktails, `COUNT(DISTINCT
//   c.id) AS potential_cocktails`, IngredientService.php:227-282 at v5.15.3),
//   not the drinks the bottle would open: on a bare shelf, gin alone opens
//   none.
// - Italic Caslon is for ingredient names and one-line editorial asides,
//   "never for numbers" (Content fundamentals; Visual foundations, "Type").
//   The offline line ("Offline — the list as it stood Wednesday 7 October,
//   5:40 PM.") is a status line about the data, mostly numerals: it is set in
//   the interface face, Instrument Sans in cream-400, and the snapshot's names
//   under it stay italic Caslon (chrispezza/barback#66, its Tonight part).
// - Empty states name the next action, one that helps. A family that holds no
//   drinks has nothing to browse: the Index says so (data/match.ts
//   familyHoldsNoDrinks), so the family's empty state offers only the way out.
//   In the default world the tiki family holds no drinks, and the dessert
//   family holds one, the Espresso Martini.

/** The default bar with the Whiskey Sour's optional egg white on the shelf, so
 *  the can-pour and one-bottle-away sets do not overlap (as e2e/tonight.spec.ts). */
function tonightWorld(change?: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  w.shelf.push(I.eggWhite)
  change?.(w)
  return w
}

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const pour = (page: Page) => page.locator('#pour')
const near = (page: Page) => page.locator('#near')
const rail = (page: Page) => page.locator('#buy')
const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true })
/** A near-miss card's list item: the card's link, and what sits beside it. */
const nearItem = (page: Page, drink: string) =>
  near(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: new RegExp(`^${drink}`) }) })
/** A To buy row: the DS check-off control and the drop action beside it. */
const listRow = (page: Page, name: string) =>
  rail(page)
    .locator('.shopping-row-line')
    .filter({ has: page.getByRole('button', { name: new RegExp(`^${name}`) }) })
const emptyState = (page: Page) => pour(page).locator('.bb-empty')

/** No WCAG 2.2 A/AA rule axe checks is broken inside `scope`. */
async function expectNoViolations(page: Page, scope: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).include(scope).withTags(WCAG).analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

/**
 * As expectNoViolations, over a scope that holds an EmptyState. axe reports
 * one finding on every EmptyState: color-contrast on its —◆— fleuron
 * (`.bb-empty__fleuron`, brass at .55 alpha, #756D43 on #122E26, 2.78:1). The
 * fleuron is the design system's one ornament, aria-hidden, and WCAG 1.4.3
 * exempts pure decoration; its colour is the design system's own, so it changes
 * only in a numbered revision (ADR-006), and chrispezza/barback#168 tracks it.
 * Only that one finding on that one element is set aside: every other rule
 * still runs on the fleuron, and color-contrast still runs on everything else.
 */
async function expectNoViolationsBesideFleuron(page: Page, scope: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).include(scope).withTags(WCAG).analyze()
  const found = violations.flatMap((v) =>
    v.nodes
      .map((n) => n.target.join(' '))
      .filter((target) => !(v.id === 'color-contrast' && /(^|[\s>])\.bb-empty__fleuron$/.test(target)))
      .map((target) => `${v.id}: ${target}`),
  )
  expect(found).toEqual([])
}

/**
 * Every control in `scope` is named with the words it shows (WCAG 2.5.3).
 * axe-core holds this rule as experimental, so it runs only when asked for.
 */
async function expectLabelsInNames(page: Page, scope: string): Promise<void> {
  const { violations, passes } = await new AxeBuilder({ page })
    .include(scope)
    .withRules(['label-content-name-mismatch'])
    .analyze()
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  // The rule did look at the controls, rather than finding none to check.
  expect(passes.flatMap((p) => p.nodes).length).toBeGreaterThan(0)
}

/**
 * The marks that stand in for words: × and +, the arrows (U+2190–U+21FF) and
 * the dingbats (U+2700–U+27BF, ✕ and ✖ among them) except ✓ (U+2713), which
 * Iconography lists with ◆ and · as the only marks the UI uses. ◆ (U+25C6)
 * and · (U+00B7) lie outside every range here.
 */
const STRAY_GLYPH = '[×+←-⇿✀-✒✔-➿]'

/** The text nodes inside `scope` that carry a glyph Iconography does not list. */
async function strayGlyphs(scope: Locator): Promise<string[]> {
  return scope.evaluate((root, pattern) => {
    const stray = new RegExp(pattern)
    const found: string[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      if (stray.test(text)) found.push(text)
    }
    return found
  }, STRAY_GLYPH)
}

test('the stray-glyph check passes the three marks Iconography lists, and no other', () => {
  const stray = new RegExp(STRAY_GLYPH)
  for (const mark of ['◆', '✓', '·']) expect(stray.test(mark), mark).toBe(false)
  for (const glyph of ['✕', '✖', '×', '+', '←', '→', '✔', '✗', '➕']) expect(stray.test(glyph), glyph).toBe(true)
})

test.describe('a To buy row’s drop action', () => {
  test.use({ world: tonightWorld((w) => (w.list = [I.campari, I.cointreau])) })

  test('is the word Remove, named for the bottle it takes off the list', async ({ page }) => {
    await page.goto('/tonight')
    await expect(heading(page, 'To buy · 2')).toBeVisible()
    for (const bottle of ['Campari', 'Cointreau']) {
      const drop = listRow(page, bottle).getByRole('button', { name: `Remove ${bottle} from the list`, exact: true })
      await expect(drop).toBeVisible()
      // The word, in the caps utility voice the system's button sets.
      await expect(drop).toHaveText('Remove')
      await expect(drop).toHaveCSS('text-transform', 'uppercase')
      // Still the system's floor: every interactive target is at least 44px.
      const box = await drop.boundingBox()
      expect(box && box.height >= 44 && box.width >= 44, `${bottle}: ${JSON.stringify(box)}`).toBe(true)
    }
    expect(await strayGlyphs(rail(page))).toEqual([])
    await expectLabelsInNames(page, '#buy')
    await expectNoViolations(page, '#buy')
  })
})

test.describe('a near-miss card’s list action', () => {
  test.use({ world: tonightWorld() })

  test('says List it, as the rest of Tonight does, and is named for its bottle with those words', async ({
    page,
  }) => {
    await page.goto('/tonight')
    await expect(heading(page, 'One bottle away · 6')).toBeVisible()
    await expect(heading(page, 'To buy · 0')).toBeVisible()
    for (const [drink, bottle] of [
      ['Negroni', 'Campari'],
      ['Martini', 'Dry vermouth'],
    ] as const) {
      const action = nearItem(page, drink).getByRole('button', { name: `List it: ${bottle}`, exact: true })
      await expect(action).toBeVisible()
      await expect(action).toHaveText('List it')
    }
    // The rail's own actions use the same words.
    await expect(rail(page).locator('.buy-next').getByRole('button')).toHaveText('List it')
    expect(await strayGlyphs(near(page))).toEqual([])
    await expectLabelsInNames(page, '#near')
    await expectNoViolations(page, '#near')
  })
})

test.describe('the names a bare shelf starts with', () => {
  test.use({ world: bareWorld() })

  test('say what the ranking counts, the recipes that call for them, not the drinks they open', async ({
    page,
  }) => {
    await page.goto('/tonight')
    await expect(emptyState(page).getByRole('heading', { name: 'The shelf is bare', exact: true })).toBeVisible()
    await expect(emptyState(page).locator('.bb-empty__body')).toHaveText(
      'Start with Gin, Sweet vermouth, White rum — the most recipes call for them.',
    )
    await expect(page.getByText(/open the most drinks/)).toHaveCount(0)
    await expectNoViolationsBesideFleuron(page, '#pour')
  })
})

test.describe('the offline line', () => {
  // As e2e/offline-snapshot.spec.ts "the stamp": served Wednesday 7 October
  // 2026, 5:40 PM in New York, and read two weeks later with the API gone.
  test.use({
    world: tonightWorld((w) => (w.list = [I.campari, I.cointreau])),
    locale: 'en-US',
    timezoneId: 'America/New_York',
  })

  test('is set in the interface face, and the snapshot’s names stay italic Caslon', async ({ page, bar }) => {
    await page.clock.setFixedTime('2026-10-07T21:40:00Z')
    await page.goto('/tonight')
    await expect(listRow(page, 'Campari')).toBeVisible()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Shelf/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Shelf' })).toBeVisible()
    bar.takeApiDown()
    await page.clock.setFixedTime('2026-10-21T23:53:00Z')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Tonight/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()

    // ICU may put U+202F before PM, hence \s.
    const line = rail(page).getByText(/^Offline — the list as it stood .+\.$/)
    await expect(line).toHaveText(/^Offline — the list as it stood Wednesday 7 October, 5:40\sPM\.$/)
    await page.evaluate(() => document.fonts.ready)
    // Instrument Sans in cream-400 (#B9AE97), never italic: the line is mostly numerals.
    await expect(line).toHaveCSS('font-family', /^"Instrument Sans",/)
    await expect(line).toHaveCSS('font-style', 'normal')
    await expect(line).toHaveCSS('color', 'rgb(185, 174, 151)')
    expect(await line.evaluate((el) => document.fonts.check(`13px "Instrument Sans"`, el.textContent ?? ''))).toBe(
      true,
    )

    // The names under it are ingredient names: italic Libre Caslon Text.
    const names = rail(page).locator('.snapshot-list li')
    await expect(names).toHaveText(['Campari', 'Cointreau'])
    for (const name of await names.all()) {
      await expect(name).toHaveCSS('font-family', /^"Libre Caslon Text",/)
      await expect(name).toHaveCSS('font-style', 'italic')
    }
    await expectNoViolations(page, '#buy')
  })
})

test.describe('a family’s empty state', () => {
  /** Record, from the first paint, every Browse action the pour section shows. */
  async function recordBrowse(page: Page) {
    await page.addInitScript(() => {
      const w = window as unknown as { __browse: string[] }
      w.__browse = []
      new MutationObserver(() => {
        for (const b of document.querySelectorAll<HTMLButtonElement>('#pour .bb-empty button')) {
          const text = b.textContent ?? ''
          if (text.startsWith('Browse') && !w.__browse.includes(text)) w.__browse.push(text)
        }
      }).observe(document, { childList: true, subtree: true, characterData: true })
    })
  }
  const browseSeen = (page: Page) => page.evaluate(() => (window as unknown as { __browse: string[] }).__browse)

  test('under a family that holds no drinks offers only the way to the others', async ({ page }) => {
    await recordBrowse(page)
    await page.goto('/tonight?family=tiki')
    await expect(emptyState(page).getByRole('heading', { level: 3 })).toHaveText('No tiki drinks pour yet')
    await expect(emptyState(page).locator('.bb-empty__body')).toHaveText(
      'The index holds no tiki drinks yet — pick another family.',
    )
    await expect(emptyState(page).getByRole('button')).toHaveText(['Show all families'])
    expect(await browseSeen(page)).toEqual([])
    await expectNoViolationsBesideFleuron(page, '#pour')
  })

  test('under a family that holds a drink still offers to browse it', async ({ page }) => {
    await recordBrowse(page)
    await page.goto('/tonight?family=dessert')
    await expect(emptyState(page).locator('.bb-empty__body')).toHaveText(
      'Add Vodka, Coffee liqueur and Espresso and one dessert drink opens up.',
    )
    await expect(emptyState(page).getByRole('button')).toHaveText(['Browse dessert drinks', 'Show all families'])
    expect(await browseSeen(page)).toEqual(['Browse dessert drinks'])
    await expectNoViolationsBesideFleuron(page, '#pour')
  })
})
