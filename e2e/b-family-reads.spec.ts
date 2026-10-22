import type { Page } from '@playwright/test'
import { C, I, T, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import type { RecordedRequest } from './support/fake-bar'
import { expect, test } from './support/test'

// A family's reads wait for the family's tag (chrispezza/barback#73).
//
// ADR-002 Validation: "selecting a family in the UI issues a single
// tag-filtered API/search query, no client-side filtering pass". The tag id
// comes from GET /tags (frontend-spec §3), so until that answers, a read
// scoped to the family named in ?family= cannot be asked for. Asked for
// without the tag it is the whole bar, and the screen shows it under the
// family's name: the family bar already presses SOUR, the Index already
// leads with the sour header. A count under a family's name is a claim about
// that family (frontend-spec §6).
//
// The same holds when the Index's question changes. The cocktail reads keep
// the previous answer in hand as a placeholder (TanStack keepPreviousData)
// until the new one lands. The previous page of the same list is a fair
// stand-in while the next page loads; the previous family's list, or the list
// before the favourites filter, is not. Until its own read lands, the list
// shows its heading with no count and no cards, as Tonight's sections do
// across a family switch (e2e/tonight-family-switch.spec.ts).

/** How long GET /tags takes on a cold load, while everything else answers at once. */
const TAGS_LATENCY_MS = 1000

const SOURS = ['Daiquiri', 'Gimlet', 'Margarita', 'Penicillin', 'Whiskey Sour']
const HIGHBALLS = ["Dark 'n' Stormy", 'Gin Tonic', 'Mojito']

/** What one list showed at one change: its heading as the DOM holds it, and its card names. */
interface SectionFrame {
  heading: string
  cards: string[]
}

/** What the Index showed at one change: its list, and the family header's summary line. */
interface IndexFrame extends SectionFrame {
  summary: string | null
}

/** What Tonight showed at one change: the #pour and #near sections. */
interface TonightFrame {
  pour: SectionFrame
  near: SectionFrame
}

type Recorded = { __snapshot: () => IndexFrame | TonightFrame | null; __frames: unknown[] }

// Every page gets `window.__snapshot()`: the screen as the frames record it.
// Card names leave out the favourite mark (◆) the name carries.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const section = (s: Element | null) => ({
      heading: s?.querySelector('h2')?.textContent ?? '',
      cards: [...(s?.querySelectorAll('.card-list > li .bb-drink__name') ?? [])].map((n) =>
        (n.textContent ?? '').replace(/^◆/, ''),
      ),
    })
    const w = window as unknown as Recorded
    w.__frames = []
    w.__snapshot = () => {
      const main = document.querySelector('main')
      if (!main) return null
      if (main.classList.contains('screen--index')) {
        const summary = [...main.querySelectorAll(':scope > header p')].find((p) =>
          (p.textContent ?? '').startsWith('You can pour'),
        )
        return { ...section(main), summary: summary?.textContent ?? null }
      }
      return { pour: section(document.getElementById('pour')), near: section(document.getElementById('near')) }
    }
  })
})

/**
 * Record the screen at every change from the first paint of the next
 * navigation on (an init script, so a cold load is watched whole). A frame
 * equal to the one before it is not recorded again.
 */
async function recordFromLoad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Recorded
    let last = ''
    new MutationObserver(() => {
      const f = w.__snapshot()
      const key = JSON.stringify(f)
      if (f === null || key === last) return
      last = key
      w.__frames.push(f)
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
}

/**
 * Record the screen at every change from a click on the button matching
 * `selector` whose text is `text`: armed by the click itself (capture phase),
 * so what is rightly on screen before it is not recorded.
 */
async function recordFromClick(page: Page, selector: string, text: string): Promise<void> {
  await page.evaluate(
    ({ selector, text }) => {
      const w = window as unknown as Recorded
      w.__frames = []
      let armed = false
      const button = [...document.querySelectorAll<HTMLButtonElement>(selector)].find((b) => b.textContent === text)!
      button.addEventListener('click', () => (armed = true), { capture: true, once: true })
      new MutationObserver(() => {
        if (armed) w.__frames.push(w.__snapshot())
      }).observe(document.querySelector('main')!, { childList: true, subtree: true, characterData: true })
    },
    { selector, text },
  )
}

async function frames<F>(page: Page): Promise<F[]> {
  return page.evaluate(() => (window as unknown as Recorded).__frames) as Promise<F[]>
}

async function now<F>(page: Page): Promise<F> {
  return page.evaluate(() => (window as unknown as Recorded).__snapshot()) as Promise<F>
}

/** GET /tags answers late; the fake answers it once the wait is over (routes run newest first). */
async function slowTags(page: Page): Promise<void> {
  await page.route('**/bar/api/tags', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, TAGS_LATENCY_MS))
    await route.fallback()
  })
}

function filtersOf(r: RecordedRequest): Record<string, string> {
  return Object.fromEntries([...r.query.entries()].filter(([k]) => k.startsWith('filter[')))
}

/** The Index list reads (per_page=50); the summary's count-only reads ask for one row. */
const listReads = (r: RecordedRequest) => r.query.get('per_page') === '50'

const listHeading = (page: Page) => page.locator('main').getByRole('heading', { level: 2 })
const listed = (page: Page) => page.locator('main .card-list > li .bb-drink__name')
const familyButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Drink family' }).getByRole('button', { name, exact: true })

const blank = (heading: string): SectionFrame => ({ heading, cards: [] })
const listOf = (f: SectionFrame): SectionFrame => ({ heading: f.heading, cards: f.cards })

/** The frames in `seen` that are none of `allowed`, each once, in the order first seen. */
function outside<F>(seen: F[], allowed: F[]): F[] {
  const ok = new Set(allowed.map((a) => JSON.stringify(a)))
  const off = new Map<string, F>()
  for (const f of seen) if (!ok.has(JSON.stringify(f))) off.set(JSON.stringify(f), f)
  return [...off.values()]
}

/** The two Tonight sections' list reads: the status line's whole-bar counts ask for one row. */
const sectionReads = (r: RecordedRequest) =>
  (r.query.has('filter[on_shelf]') || r.query.has('filter[missing_ingredients]')) && r.query.get('per_page') !== '1'

test.describe('a cold load that names a family, while GET /tags is on its way', () => {
  test.beforeEach(async ({ page }) => {
    await slowTags(page)
    await recordFromLoad(page)
  })

  test('/drinks?family=sour lists nothing under the sour header until the sours answer', async ({ page }) => {
    await page.goto('/drinks?family=sour')
    await expect(familyButton(page, 'SOUR')).toHaveAttribute('aria-pressed', 'true')
    await expect(listHeading(page)).toHaveText('The index · 5')
    await expect(listed(page)).toHaveText(SOURS)
    await expect(page.getByText(/^You can pour \d+ of 5 sours · /)).toBeVisible()
    const landed = await now<IndexFrame>(page)

    // At every change from the first paint on, the list stated nothing (its
    // heading with no count, no cards) or the sours that landed, and the
    // summary nothing or the sours'. Never the whole index under the sour
    // header while the tag was not yet known.
    const seen = await frames<IndexFrame>(page)
    expect(seen.length).toBeGreaterThan(0)
    expect(outside(seen.map(listOf), [blank('The index'), listOf(landed)])).toEqual([])
    expect(outside(seen.map((f) => f.summary), [null, landed.summary])).toEqual([])
  })

  test('/drinks?family=sour asks for no cocktail read without the sour tag', async ({ page, bar }) => {
    await page.goto('/drinks?family=sour')
    await expect(listed(page)).toHaveText(SOURS)
    await expect(page.getByText(/^You can pour \d+ of 5 sours · /)).toBeVisible()
    // ADR-002 filter parity: the list went out once, once the tag was known,
    // filtered by it, as did each of the summary's counts.
    const reads = bar.calls('GET', /^\/cocktails$/)
    expect(reads.filter(listReads).map(filtersOf)).toEqual([{ 'filter[tag_id]': String(T.sour) }])
    const counts = reads.filter((r) => r.query.get('per_page') === '1' && r.query.has('filter[tag_id]'))
    expect(counts.map(filtersOf)).toEqual(
      expect.arrayContaining([
        { 'filter[tag_id]': String(T.sour) },
        { 'filter[on_shelf]': 'true', 'filter[tag_id]': String(T.sour) },
        { 'filter[missing_ingredients]': '1', 'filter[tag_id]': String(T.sour) },
      ]),
    )
    // The only read without the tag is the rail's whole-bar "pourable" count
    // (app.tsx RailNav, one row): the shell's, not the Index's.
    const unscoped = reads
      .filter((r) => !r.query.has('filter[tag_id]'))
      .map((r): Record<string, string | null> => ({ per_page: r.query.get('per_page'), ...filtersOf(r) }))
    expect(outside(unscoped, [{ per_page: '1', 'filter[on_shelf]': 'true' }])).toEqual([])
  })

  test('/tonight?family=sour shows no whole-bar card or count while the URL says sour', async ({ page }) => {
    await page.goto('/tonight?family=sour')
    await expect(familyButton(page, 'SOUR')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#pour h2')).toHaveText('sours you can pour · 3')
    await expect(page.locator('#near h2')).toHaveText('sours one bottle away · 1')
    await expect(page.locator('#pour .card-list > li .bb-drink__name')).toHaveText(['Daiquiri', 'Gimlet', 'Whiskey Sour'])
    // The status line above stays whole-bar (Tonight.tsx: deliberately unscoped).
    await expect(page.locator('.bar-status')).toHaveText('You can pour 5 · 7 one bottle away · 0 to buy')
    const landed = await now<TonightFrame>(page)

    // At every change from the first paint on, each section named the family
    // with no count and no cards, or showed the sour answer that landed: never
    // the whole bar's cards or counts, under any name, while the URL and the
    // family bar said sour.
    const seen = (await frames<TonightFrame>(page)).filter((f) => f.pour.heading !== '' || f.near.heading !== '')
    expect(seen.length).toBeGreaterThan(0)
    expect(outside(seen.map((f) => f.pour), [blank('sours you can pour'), landed.pour])).toEqual([])
    expect(outside(seen.map((f) => f.near), [blank('sours one bottle away'), landed.near])).toEqual([])
  })

  test('/tonight?family=sour asks for no section read without the sour tag', async ({ page, bar }) => {
    await page.goto('/tonight?family=sour')
    await expect(page.locator('#pour h2')).toHaveText('sours you can pour · 3')
    await expect(page.locator('#near h2')).toHaveText('sours one bottle away · 1')
    // ADR-002 filter parity for the two sections: one can-pour and one
    // one-bottle-away read, each filtered by the sour tag (in either order).
    const reads = bar.calls('GET', /^\/cocktails$/).filter(sectionReads).map(filtersOf)
    expect(reads).toHaveLength(2)
    expect(reads).toEqual(
      expect.arrayContaining([
        { 'filter[on_shelf]': 'true', 'filter[tag_id]': String(T.sour) },
        { 'filter[missing_ingredients]': '1', 'filter[tag_id]': String(T.sour) },
      ]),
    )
  })
})

test.describe('changing the question on the Index while the new list is on its way', () => {
  test('a family switch lists no drink of the previous family under the new one', async ({ page, bar }) => {
    await page.goto('/drinks?family=sour')
    await expect(listHeading(page)).toHaveText('The index · 5')
    await expect(listed(page)).toHaveText(SOURS)

    bar.slowDown(1500)
    await recordFromClick(page, '.bb-fam__btn', 'HIGHBALL')
    await familyButton(page, 'HIGHBALL').click()
    await expect(page).toHaveURL(/\/drinks\?family=highball$/)
    // The highball list has been asked for and has not answered: the list
    // states nothing yet.
    await expect
      .poll(
        () =>
          bar
            .calls('GET', /^\/cocktails$/)
            .filter((r) => listReads(r) && r.query.get('filter[tag_id]') === String(T.highball)).length,
      )
      .toBeGreaterThan(0)
    expect(await listHeading(page).textContent()).toBe('The index')
    expect(await listed(page).count()).toBe(0)

    await expect(listHeading(page)).toHaveText('The index · 3')
    await expect(listed(page)).toHaveText(HIGHBALLS)
    const landed = await now<IndexFrame>(page)
    const seen = await frames<IndexFrame>(page)
    expect(seen.length).toBeGreaterThan(0)
    expect(outside(seen.map(listOf), [blank('The index'), listOf(landed)])).toEqual([])
  })

  test.describe('with one sour favourited', () => {
    test.use({ world: { ...defaultWorld(), favorites: [C.daiquiri] } })

    test('turning favourites on lists none of the family’s other drinks under Favorites', async ({ page, bar }) => {
      await page.goto('/drinks?family=sour')
      await expect(listHeading(page)).toHaveText('The index · 5')
      // The Daiquiri's name leads with the favourite mark.
      await expect(listed(page)).toHaveText(SOURS.map((d) => new RegExp(`^◆?${d}$`)))

      bar.slowDown(1500)
      await recordFromClick(page, 'main .favorites-filter-row button', 'Favorites')
      await page.getByRole('button', { name: 'Favorites', exact: true }).click()
      await expect(page).toHaveURL(/\/drinks\?family=sour&fav=1$/)
      await expect
        .poll(
          () =>
            bar.calls('GET', /^\/cocktails$/).filter((r) => listReads(r) && r.query.get('filter[favorites]') === 'true')
              .length,
        )
        .toBeGreaterThan(0)
      expect(await listHeading(page).textContent()).toBe('Favorites')
      expect(await listed(page).count()).toBe(0)

      await expect(listHeading(page)).toHaveText('Favorites · 1')
      await expect(listed(page)).toHaveText(['◆Daiquiri'])
      const seen = await frames<IndexFrame>(page)
      expect(seen.length).toBeGreaterThan(0)
      expect(outside(seen.map(listOf), [blank('Favorites'), { heading: 'Favorites · 1', cards: ['Daiquiri'] }])).toEqual([])
    })
  })

  test.describe('on a family two pages long', () => {
    // The default world plus fifty house sours: 55 sours, two pages of 50.
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
    test.use({ world: pagedWorld() })

    test('the next page keeps the page in hand, and the family’s total, until it lands', async ({ page, bar }) => {
      await page.goto('/drinks?family=sour')
      await expect(listHeading(page)).toHaveText('The index · 55')
      await expect(listed(page)).toHaveCount(50)
      const first = await listed(page).allTextContents()

      bar.slowDown(1500)
      await recordFromClick(page, 'main .pager button', 'Next')
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(page).toHaveURL(/\/drinks\?family=sour&page=2$/)
      await expect(listed(page)).toHaveText(['House sour 49', 'House sour 50', 'Margarita', 'Penicillin', 'Whiskey Sour'])
      const second = await listed(page).allTextContents()

      // The page alone changed: the list's total held throughout, and the
      // cards were page one's until page two's landed.
      const seen = await frames<IndexFrame>(page)
      expect(seen.length).toBeGreaterThan(0)
      expect(outside(seen.map((f) => f.heading), ['The index · 55'])).toEqual([])
      expect(outside(seen.map((f) => f.cards), [first, second])).toEqual([])
    })
  })
})
