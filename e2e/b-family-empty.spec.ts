import type { Page } from '@playwright/test'
import { I, T, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar, RecordedRequest } from './support/fake-bar'
import { expect, test } from './support/test'

// A family where nothing pours names the bottles that open it
// (chrispezza/barback#74).
//
// frontend-spec §6 Journey 2: "Family-aware empty states ('Add a citrus and a
// sweetener') come from this journey's gap data." §5: "Empty states are
// directive." Content fundamentals: "Empty states name the next action:
// 'Nothing pours yet — add a citrus and a sweetener and six drinks open up.'"
//
// The gap data is the family's own drinks, read by one tag-filtered GET
// /cocktails (ADR-002 filter parity), each card's missing required lines read
// as the card paints them (held child brands included, chrispezza/barback#20).
// The line names the bottles the closest drinks wait on, the most common
// first, and counts only the drinks those bottles open whole: a count the
// arithmetic holds. Tonight and the Index say the same sentence. Ingredient
// names sit in the italic Caslon run the empty state's body already is, and
// its number is a word, never a numeral in italic.
//
// A family that holds no drinks at all has nothing to pour or browse: both
// screens say so and point at another family, never "0 of 0".

const pour = (page: Page) => page.locator('#pour')
const near = (page: Page) => page.locator('#near')
const emptyTitle = (page: Page) => pour(page).locator('.bb-empty').getByRole('heading', { level: 3 })
const emptyBody = (page: Page) => pour(page).locator('.bb-empty__body')
const header = (page: Page) => page.locator('main > header')
/** The Index family header's stock summary line (frontend-spec §6 "Family header"). */
const summary = (page: Page) => header(page).locator('p').filter({ hasText: /^You can pour/ })
const familyButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Drink family' }).getByRole('button', { name, exact: true })

function filtersOf(r: RecordedRequest): Record<string, string> {
  return Object.fromEntries([...r.query.entries()].filter(([k]) => k.startsWith('filter[')))
}

/** Every GET /cocktails filtered by this tag alone: the family's own drinks. */
const familyReads = (bar: FakeBar, tagId: number) =>
  bar
    .calls('GET', /^\/cocktails$/)
    .filter((r) => JSON.stringify(filtersOf(r)) === JSON.stringify({ 'filter[tag_id]': String(tagId) }))

/**
 * The default bar with two more dessert drinks. The family then waits on the
 * same two bottles in two of its three drinks, and nothing in it pours or is
 * one bottle away (by the server's count, which reads exact lines only):
 *
 *   Black Russian     vodka, coffee liqueur                missing 2
 *   Espresso Martini  vodka, coffee liqueur, espresso      missing 3
 *   Mind Eraser       vodka, coffee liqueur, club soda     missing 2 (club soda held)
 *
 * No staple leaves the shelf, so nothing queues itself on Tonight.
 */
function dessertWorld(): WorldSeed {
  const w = defaultWorld()
  w.cocktails.push(
    {
      id: 16,
      name: 'Black Russian',
      tagIds: [T.dessert],
      lines: [
        { ingredientId: I.vodka, amount: 50, units: 'ml' },
        { ingredientId: I.coffeeLiqueur, amount: 20, units: 'ml' },
      ],
      instructions: 'Build over ice and stir.',
    },
    {
      id: 17,
      name: 'Mind Eraser',
      tagIds: [T.dessert],
      lines: [
        { ingredientId: I.vodka, amount: 30, units: 'ml' },
        { ingredientId: I.coffeeLiqueur, amount: 30, units: 'ml' },
        { ingredientId: I.clubSoda, amount: 60, units: 'ml' },
      ],
      instructions: 'Build over ice; top with soda unstirred.',
    },
  )
  return w
}

const DESSERT_LINE = 'Add Vodka and Coffee liqueur and two dessert drinks open up.'
const TIKI_LINE = 'The index holds no tiki drinks yet — pick another family.'

test.describe('Tonight, under a family where nothing pours and nothing is one bottle away', () => {
  test.use({ world: dessertWorld() })

  test('names the bottles the family waits on, and what they open', async ({ page, bar }) => {
    await page.goto('/tonight?family=dessert')
    await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText('dessert drinks you can pour · 0')
    await expect(near(page).getByRole('heading', { level: 2 })).toHaveText('dessert drinks one bottle away · 0')
    await expect(emptyTitle(page)).toHaveText('No dessert drinks pour yet')
    await expect(emptyBody(page)).toHaveText(DESSERT_LINE)
    // The interim line that named no bottle (chrispezza/barback#72) is gone.
    await expect(page.getByText('browse them to see what they call for')).toHaveCount(0)
    // The gap data is the family's: one read filtered by its tag alone.
    expect(familyReads(bar, T.dessert).length).toBeGreaterThan(0)
  })

  test('with the shelf unread, names no bottle: a held brand could cover it', async ({ page, bar }) => {
    // The shelf read fails, first try and its one retry (src/app.tsx, retry: 1).
    bar.fail(/^\/ingredients$/, { method: 'GET', status: 500, times: 2 })
    await page.goto('/tonight?family=dessert')
    await expect(emptyTitle(page)).toHaveText('No dessert drinks pour yet')
    await expect(pour(page).getByRole('alert')).toContainText('The bar didn’t answer — try again.')
    await expect(emptyBody(page)).toHaveText('None is one bottle away either — browse them to see what they call for.')
    await expect(page.getByText(/Add Vodka/)).toHaveCount(0)
  })

  test('a family switch never states the previous family’s bottles under the new one', async ({ page, bar }) => {
    await page.goto('/tonight?family=dessert')
    await expect(emptyBody(page)).toHaveText(DESSERT_LINE)

    bar.slowDown(1500)
    // Every empty-state body the pour section shows from the click on TIKI
    // until the tiki line lands; armed by the click itself (capture phase).
    await page.evaluate((landed) => {
      const w = window as unknown as { __bodies: string[] }
      w.__bodies = []
      const section = document.getElementById('pour')!
      let armed = false
      let done = false
      const button = [...document.querySelectorAll<HTMLButtonElement>('.bb-fam__btn')].find(
        (b) => b.textContent === 'TIKI',
      )!
      button.addEventListener('click', () => (armed = true), { capture: true, once: true })
      new MutationObserver(() => {
        if (!armed || done) return
        for (const b of section.querySelectorAll<HTMLElement>('.bb-empty__body')) {
          w.__bodies.push(b.textContent ?? '')
          if (b.textContent === landed) done = true
        }
      }).observe(section, { childList: true, subtree: true, characterData: true })
    }, TIKI_LINE)
    await familyButton(page, 'TIKI').click()
    await expect(page).toHaveURL(/\/tonight\?family=tiki$/)
    await expect(emptyBody(page)).toHaveText(TIKI_LINE, { timeout: 10_000 })
    const seen = await page.evaluate(() => (window as unknown as { __bodies: string[] }).__bodies)
    expect(seen.filter((b) => b !== TIKI_LINE)).toEqual([])
  })
})

test.describe('Tonight, under a family that holds no drinks', () => {
  // The default world tags no drink tiki.
  test('says the index holds none and points at another family', async ({ page }) => {
    await page.goto('/tonight?family=tiki')
    await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText('tiki drinks you can pour · 0')
    await expect(emptyTitle(page)).toHaveText('No tiki drinks pour yet')
    await expect(emptyBody(page)).toHaveText(TIKI_LINE)
    await expect(page.getByText('browse them to see what they call for')).toHaveCount(0)
    await expect(pour(page).getByRole('button', { name: 'Show all families' })).toBeVisible()
  })
})

test.describe('Tonight, under a family whose closest drink waits on a bottle a held brand does not cover', () => {
  // Laphroaig 10 and lemon juice. The Penicillin calls Islay Scotch, which the
  // held Laphroaig 10 covers (its direct parent; chrispezza/barback#20), so it
  // waits on honey syrup alone. The server counts it two away (its
  // missing_ingredients reads exact lines only, chrispezza/barback#19), so
  // nothing in the family is one bottle away and the family's empty state
  // shows. The staples off the shelf are already listed, so none queues.
  test.use({
    world: {
      ...defaultWorld(),
      shelf: [I.laphroaig10, I.lemonJuice],
      list: [I.clubSoda, I.tonic, I.simpleSyrup, I.limeJuice, I.angostura],
    },
  })

  test('names the bottle the card names, never the parent a brand already covers', async ({ page }) => {
    await page.goto('/tonight?family=sour')
    await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText('sours you can pour · 0')
    await expect(near(page).getByRole('heading', { level: 2 })).toHaveText('sours one bottle away · 0')
    await expect(emptyTitle(page)).toHaveText('No sours pour yet')
    await expect(emptyBody(page)).toHaveText('Add Honey syrup and one sour opens up.')
    await expect(page.getByText(/Islay Scotch/)).toHaveCount(0)
  })
})

test.describe('the Index, under a family where nothing pours', () => {
  test.describe('and nothing is one bottle away', () => {
    test.use({ world: dessertWorld() })

    test('keeps the summary and names the bottles that open the family', async ({ page, bar }) => {
      await page.goto('/drinks?family=dessert')
      await expect(summary(page)).toHaveText('You can pour 0 of 3 dessert drinks · 0 are one bottle away.')
      await expect(header(page).getByText(DESSERT_LINE, { exact: true })).toBeVisible()
      // The cards below say the same gaps, line by line.
      await expect(page.locator('main .card-list .bb-drink__missing-line')).toHaveText([
        'Missing 2: Vodka, Coffee liqueur',
        'Missing 3: Vodka, Coffee liqueur, Espresso',
        'Missing 2: Vodka, Coffee liqueur',
      ])
      expect(familyReads(bar, T.dessert).length).toBeGreaterThan(0)
    })

    test('a family switch never states the previous family’s bottles under the new one', async ({ page, bar }) => {
      await page.goto('/drinks?family=dessert')
      await expect(header(page).getByText(DESSERT_LINE, { exact: true })).toBeVisible()

      bar.slowDown(1500)
      await page.evaluate((landed) => {
        const w = window as unknown as { __lines: string[] }
        w.__lines = []
        const main = document.querySelector('main')!
        let armed = false
        let done = false
        const button = [...document.querySelectorAll<HTMLButtonElement>('.bb-fam__btn')].find(
          (b) => b.textContent === 'TIKI',
        )!
        button.addEventListener('click', () => (armed = true), { capture: true, once: true })
        new MutationObserver(() => {
          if (!armed || done) return
          for (const p of main.querySelectorAll<HTMLElement>(':scope > header p')) {
            const text = p.textContent ?? ''
            if (!/^(Add |The index holds )/.test(text)) continue
            w.__lines.push(text)
            if (text === landed) done = true
          }
        }).observe(main, { childList: true, subtree: true, characterData: true })
      }, TIKI_LINE)
      await familyButton(page, 'TIKI').click()
      await expect(page).toHaveURL(/\/drinks\?family=tiki$/)
      await expect(header(page).getByText(TIKI_LINE, { exact: true })).toBeVisible({ timeout: 10_000 })
      const seen = await page.evaluate(() => (window as unknown as { __lines: string[] }).__lines)
      expect(seen.filter((l) => l !== TIKI_LINE)).toEqual([])
    })
  })

  test.describe('but one is one bottle away', () => {
    // Gin alone: the Gin Tonic waits on tonic; the Dark 'n' Stormy and the
    // Mojito on two bottles or more.
    test.use({ world: { ...defaultWorld(), shelf: [I.gin] } })

    test('names the one bottle that opens it', async ({ page }) => {
      await page.goto('/drinks?family=highball')
      await expect(summary(page)).toHaveText('You can pour 0 of 3 highballs · 1 is one bottle away.')
      await expect(header(page).getByText('Add Tonic and one highball opens up.', { exact: true })).toBeVisible()
    })
  })
})

test.describe('the Index, under a family where something pours', () => {
  test('states the summary alone', async ({ page }) => {
    await page.goto('/drinks?family=sour')
    await expect(summary(page)).toHaveText(/^You can pour 3 of 5 sours · /)
    await expect(page.locator('main .card-list > li')).toHaveCount(5)
    await expect(header(page).getByText(/^Add /)).toHaveCount(0)
  })
})

test.describe('the Index, under a family that holds no drinks', () => {
  test('says the index holds none instead of “0 of 0”', async ({ page }) => {
    await page.goto('/drinks?family=tiki')
    await expect(header(page).getByText(TIKI_LINE, { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'The index · 0', exact: true })).toBeVisible()
    await expect(summary(page)).toHaveCount(0)
    await expect(page.getByText(/0 of 0/)).toHaveCount(0)
  })
})
