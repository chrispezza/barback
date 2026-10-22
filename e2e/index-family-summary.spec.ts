import type { Page } from '@playwright/test'
import { C, I, T, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { RecordedRequest } from './support/fake-bar'
import { expect, test } from './support/test'

// The Index family header's stock summary (frontend-spec §6 "Family header"):
//
//   2 : ¾ : ¾ / SPIRIT · CITRUS · SWEET — You can pour 8 of 23 sours · 6 are
//   one bottle away.
//
// Every count is the family's: "of 23 sours" is how many drinks carry the
// family tag, whatever else the list below is filtered by, and the sentence
// names the family it counts (families.ts `plural`; one drink reads singular).
// The counts are pagination totals of tag_id-filtered reads (§6; ADR-002
// filter parity), never a client-side count.
//
// The shelf is chosen so each family's two server sets are clean: no drink is
// in both "can pour" and "one bottle away" (chrispezza/barback#19: upstream's
// missing_ingredients counts optional lines and exact matches only) and no
// brand-level child stands in for its parent (chrispezza/barback#20). On it:
//
//   sour            pours Daiquiri, Whiskey Sour, Gimlet; Margarita is one away; Penicillin two
//   spirit-forward  pours Old Fashioned; Manhattan, Negroni, Rob Roy, Martini are one away
//   highball        pours Gin Tonic; Mojito is one away (the mint); Dark 'n' Stormy two
//   dessert         Espresso Martini, three away

function cleanWorld(): WorldSeed {
  const world = defaultWorld()
  world.shelf = [...world.shelf.filter((id) => id !== I.laphroaig10), I.eggWhite, I.cointreau]
  return world
}

const SOUR = 'You can pour 3 of 5 sours · 1 is one bottle away.'
const HIGHBALL = 'You can pour 1 of 3 highballs · 1 is one bottle away.'

/** The stock summary line in the family header. */
const summary = (page: Page) => page.locator('main > header p').filter({ hasText: /^You can pour/ })

function filtersOf(r: RecordedRequest): Record<string, string> {
  return Object.fromEntries([...r.query.entries()].filter(([k]) => k.startsWith('filter[')))
}

test.use({ world: cleanWorld() })

for (const { suffix, sentence } of [
  { suffix: 'sour', sentence: SOUR },
  { suffix: 'spirit-forward', sentence: 'You can pour 1 of 5 spirit-forward drinks · 4 are one bottle away.' },
  { suffix: 'highball', sentence: HIGHBALL },
  // One drink in the family: the noun is singular.
  { suffix: 'dessert', sentence: 'You can pour 0 of 1 dessert drink · 0 are one bottle away.' },
]) {
  test(`?family=${suffix} says the summary as the spec does, naming the family`, async ({ page }) => {
    await page.goto(`/drinks?family=${suffix}`)
    await expect(summary(page)).toHaveText(sentence)
  })
}

test.describe('with the favourites filter on', () => {
  // One sour favourited: the list below shows one drink; the family has five.
  test.use({ world: { ...cleanWorld(), favorites: [C.daiquiri] } })

  test('the total is every sour, not the favourites listed', async ({ page, bar }) => {
    await page.goto('/drinks?family=sour&fav=1')
    await expect(page.getByRole('heading', { level: 2, name: 'Favorites · 1', exact: true })).toBeVisible()
    await expect(summary(page)).toHaveText(SOUR)

    // The total is the pagination total of a read filtered by the family tag
    // alone (§6), not of the favourites-filtered list.
    expect(bar.calls('GET', /^\/cocktails$/).map(filtersOf)).toContainEqual({ 'filter[tag_id]': String(T.sour) })
  })

  test('turning favourites on and off leaves the summary as it was', async ({ page }) => {
    // The counts are checked at each step; the whole sentence once at the end.
    const sourCounts = /^You can pour 3 of 5 /
    await page.goto('/drinks?family=sour')
    await expect(summary(page)).toHaveText(sourCounts)

    await page.getByRole('button', { name: 'Favorites', exact: true }).click()
    await expect(page).toHaveURL(/\/drinks\?family=sour&fav=1$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Favorites · 1', exact: true })).toBeVisible()
    await expect(summary(page)).toHaveText(sourCounts)

    await page.getByRole('button', { name: '✓ Favorites', exact: true }).click()
    await expect(page).toHaveURL(/\/drinks\?family=sour$/)
    await expect(page.getByRole('heading', { level: 2, name: 'The index · 5', exact: true })).toBeVisible()
    await expect(summary(page)).toHaveText(SOUR)
  })
})

test.describe('switching family while the new counts are on their way', () => {
  // The cocktail reads keep the previous family's answer on screen until the
  // new one lands (TanStack placeholderData). Those counts are the old
  // family's: the header of the new family never states them, whole or in
  // part. On this shelf the sours read "3 of 5" and the highballs "1 of 3".
  test('never shows the old family’s counts under the new family', async ({ page, bar }) => {
    const highballCounts = 'You can pour 1 of 3 '
    await page.goto('/drinks?family=sour')
    await expect(summary(page)).toHaveText(/^You can pour 3 of 5 /)

    bar.slowDown(1500)
    // Watch the whole window, not one instant: from the click on HIGHBALL
    // until the highball counts land, record every summary line the header
    // shows. Armed by the click itself (capture phase), so the sour line that
    // is rightly on screen before it is not recorded.
    await page.evaluate((landed) => {
      const w = window as unknown as { __summaries: string[] }
      w.__summaries = []
      const main = document.querySelector('main')!
      let armed = false
      let done = false
      const button = [...document.querySelectorAll<HTMLButtonElement>('.bb-fam__btn')].find(
        (b) => b.textContent === 'HIGHBALL',
      )!
      button.addEventListener('click', () => (armed = true), { capture: true, once: true })
      new MutationObserver(() => {
        if (!armed || done) return
        for (const p of main.querySelectorAll<HTMLElement>(':scope > header p')) {
          const text = p.textContent ?? ''
          if (!text.startsWith('You can pour')) continue
          w.__summaries.push(text)
          if (text.startsWith(landed)) done = true
        }
      }).observe(main, { childList: true, subtree: true, characterData: true })
    }, highballCounts)
    await page.getByRole('group', { name: 'Drink family' }).getByRole('button', { name: 'HIGHBALL', exact: true }).click()
    await expect(page).toHaveURL(/\/drinks\?family=highball$/)
    // The highball reads have been asked for and not yet answered.
    await expect
      .poll(() => bar.calls('GET', /^\/cocktails$/).filter((c) => c.query.get('filter[tag_id]') === String(T.highball)).length)
      .toBeGreaterThan(0)

    await expect(summary(page)).toHaveText(new RegExp(`^${highballCounts}`))
    const seen = await page.evaluate(() => (window as unknown as { __summaries: string[] }).__summaries)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.filter((text) => !text.startsWith(highballCounts))).toEqual([])
    await expect(summary(page)).toHaveText(HIGHBALL)
  })
})
