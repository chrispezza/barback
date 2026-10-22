import type { Page } from '@playwright/test'
import { C, I, T, defaultWorld, type CocktailSeed, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// To buy is annotated by family (frontend-spec §6 Journey 3: "items ranked by
// unlock count, annotated by family ('unlocks 4 sours, 2 tiki' — group
// /ingredients/{id}/extra results by family tag)"). A row's count is the
// drinks its bottle's GET /ingredients/{id}/extra names
// (IngredientController::extra, IngredientController.php:199-226 at v5.15.3),
// which carry only id, slug and name. Family membership is a Bar Assistant tag
// (ADR-002), so the row reads the tags of exactly those drinks from the
// cocktail index, GET /cocktails?filter[id]=<ids>&include=tags: filter[id] is
// exact and takes a comma list (CocktailQueryFilter.php:28), and the index
// carries `tags` only when included (CocktailResource.php:106-111). One read
// per row, every drink on one page (per_page is the count; the index pages at
// 25 by default, CocktailController.php:82).
//
// The breakdown sits in the row's one detail line, after the count, in the
// families' own plural names (src/data/families.ts): most drinks first, ties in
// the families' declared order, "1 highball" for one. A drink with no family
// tag is counted in "Unlocks N" but not named. The DS row renders the count,
// an aria-hidden "·" separator and the detail as three spans with no space
// between them, so ShoppingRow opens the detail with a hair space (U+200A)
// that parts the count from it for assistive tech: the line's text is
// "Unlocks 2·\u200A1 spirit-forward drink", and the row is named
// "Scotch whisky Unlocks 2 1 spirit-forward drink", never "Unlocks 21 …".
//
// A line too long for its row (beside the row's Remove, the desktop rail's is
// 171px wide, the 390px phone's 201px) wraps only after a separator, never
// inside a family's phrase:
// the count is held to its family's name, and the name's words to each other,
// by no-break spaces (U+00A0), and each "·" to the phrase before it, so no line
// opens with one: "2\u00A0sours\u00A0· 2\u00A0tiki\u00A0drinks". The hair
// space after the DS separator is a break after a separator too. The one break
// left inside a phrase is the hyphen of "spirit-forward" (ShoppingRow.tsx says
// why). toHaveText normalises both kinds of space to a space.
//
// Every line the row states is true when it is stated: the count alone until
// the tags of the drinks it counts have been read, never a breakdown of some
// other set of drinks beside it. The count stands when the tags cannot be read.

/**
 * The default bar with the Whiskey Sour's optional egg white on the shelf, so
 * the can-pour and one-bottle-away sets do not overlap (as e2e/tonight.spec.ts).
 */
function tonightWorld(change?: (w: WorldSeed) => void): WorldSeed {
  const w = defaultWorld()
  w.shelf.push(I.eggWhite)
  change?.(w)
  return w
}

/** A drink of white rum and whatever else, tagged as given. */
function rumDrink(id: number, name: string, tagIds: number[], others: number[]): CocktailSeed {
  return {
    id,
    name,
    tagIds,
    lines: [
      { ingredientId: I.whiteRum, amount: 50, units: 'ml' },
      ...others.map((ingredientId) => ({ ingredientId, amount: 20, units: 'ml' })),
    ],
    instructions: 'Shake with ice and strain.',
  }
}

// With White rum off the shelf it opens the Daiquiri and a rum sour (sours),
// two tiki drinks, a highball, and a drink tagged only "Classic", which is no
// family: six drinks, five of them named by family. White rum is no staple
// (src/data/staples.ts), so its row says nothing else.
const RUM_SOUR = 201
const SWIZZLE = 202
const PUNCH = 203
const RUM_TONIC = 204
const RUM_OLD_FASHIONED = 205
const rumWorld = tonightWorld((w) => {
  w.shelf = w.shelf.filter((id) => id !== I.whiteRum)
  w.list = [I.whiteRum, I.cointreau]
  w.cocktails.push(
    rumDrink(RUM_SOUR, 'Rum Sour', [T.sour], [I.lemonJuice, I.simpleSyrup]),
    rumDrink(SWIZZLE, 'Rum Swizzle', [T.tiki], [I.limeJuice, I.simpleSyrup, I.angostura]),
    rumDrink(PUNCH, 'Planter’s Punch', [T.tiki], [I.limeJuice, I.simpleSyrup, I.clubSoda]),
    rumDrink(RUM_TONIC, 'Rum Tonic', [T.highball], [I.tonic]),
    rumDrink(RUM_OLD_FASHIONED, 'Rum Old Fashioned', [T.classic], [I.simpleSyrup, I.angostura]),
  )
})

const rail = (page: Page) => page.locator('#buy')
/** A To buy row's check-off control; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  rail(page).locator('.shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
/** A To buy row's detail line: the count, then what it says of the drinks. */
const rowLine = (page: Page, name: string) => listItem(page, name).locator('.bb-shop__meta')
/** What the line says after the count, as its raw text: the spaces as they are. */
const rowDetail = (page: Page, name: string) => rowLine(page, name).locator(':scope > span:last-child')

/**
 * The detail line of a To buy row as the browser has laid it out: its text, one
 * string per rendered line, each read from where its characters sit, the fonts
 * loaded first.
 */
async function renderedLines(page: Page, name: string): Promise<string[]> {
  await page.evaluate(() => document.fonts.ready)
  return rowLine(page, name).evaluate((meta) => {
    const lines: { top: number; text: string }[] = []
    const walker = document.createTreeWalker(meta, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? ''
      for (let i = 0; i < text.length; i += 1) {
        const range = document.createRange()
        range.setStart(node, i)
        range.setEnd(node, i + 1)
        const rect = range.getClientRects()[0]
        if (!rect) continue
        let line = lines.find((l) => Math.abs(l.top - rect.top) < rect.height / 2)
        if (!line) {
          line = { top: rect.top, text: '' }
          lines.push(line)
        }
        line.text += text[i]
      }
    }
    return lines.sort((a, b) => a.top - b.top).map((l) => l.text)
  })
}

/** Every GET /cocktails the fake answered with tags included, as the filters it asked for. */
const tagReads = (bar: FakeBar) =>
  bar
    .calls('GET', /^\/cocktails$/)
    .filter((r) => (r.query.get('include') ?? '').split(',').includes('tags'))
    .map((r) => ({ ids: r.query.get('filter[id]'), perPage: r.query.get('per_page') }))

/**
 * Resolve once the fake has recorded no new request for `quietMs` (as in
 * e2e/b-tonight-before-read.spec.ts): every read the screen asks for has
 * answered and been drawn.
 */
async function settled(bar: FakeBar, quietMs = 500) {
  let seen = -1
  let since = Date.now()
  await expect
    .poll(
      () => {
        const count = bar.calls().length
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

test.describe('To buy, annotated by family', () => {
  test.use({ world: rumWorld })

  test('names the families of what a bottle unlocks, most first, the untagged counted but not named', async ({
    page,
    bar,
  }) => {
    await page.goto('/tonight')
    await expect(rowLine(page, 'White rum')).toHaveText('Unlocks 6·\u200A2 sours · 2 tiki drinks · 1 highball')
    // Assistive tech hears the count and the families apart: "6", then "2 sours".
    await expect(
      rail(page).getByRole('button', { name: 'White rum Unlocks 6 2 sours · 2 tiki drinks · 1 highball', exact: true }),
    ).toBeVisible()
    // A bottle that unlocks nothing still says what it is in, and nothing of families.
    await expect(rowLine(page, 'Cointreau')).toHaveText('In 1 drink')

    // One read of the drinks White rum opens, all on one page; none for Cointreau, which opens none.
    await settled(bar)
    const ids = [C.daiquiri, RUM_SOUR, SWIZZLE, PUNCH, RUM_TONIC, RUM_OLD_FASHIONED].join(',')
    expect(tagReads(bar)).toEqual([{ ids, perPage: '6' }])
  })

  test('holds each family whole, and wraps only after a separator', async ({ page }) => {
    await page.goto('/tonight')
    await expect(rowLine(page, 'White rum')).toHaveText('Unlocks 6·\u200A2 sours · 2 tiki drinks · 1 highball')
    // The line is wider than the row on both projects, so it wraps, and every
    // line but the last ends on a separator: no count cut from its family, no
    // family cut in two, no line opening with "·".
    const lines = await renderedLines(page, 'White rum')
    expect(lines.length, `lines: ${JSON.stringify(lines)}`).toBeGreaterThan(1)
    expect(lines.slice(0, -1).filter((line) => !line.trimEnd().endsWith('·'))).toEqual([])
    expect(lines.filter((line) => line.trimStart().startsWith('·'))).toEqual([])
    // As the row writes it: within a phrase every space is a no-break one; the
    // only breakable space follows a "·", and the hair space follows the DS's own.
    await expect(rowDetail(page, 'White rum')).toHaveJSProperty(
      'textContent',
      '\u200A2\u00A0sours\u00A0· 2\u00A0tiki\u00A0drinks\u00A0· 1\u00A0highball',
    )
  })
})

test.describe('To buy, a line that names a hyphenated family', () => {
  // As above, with the Rum Old Fashioned tagged spirit-forward and a Rum Flip,
  // a dessert drink, beside it: seven drinks, five families.
  const RUM_FLIP = 206
  const world = structuredClone(rumWorld)
  const oldFashioned = world.cocktails.find((c) => c.id === RUM_OLD_FASHIONED)
  if (oldFashioned) oldFashioned.tagIds = [T.spiritForward]
  world.cocktails.push(rumDrink(RUM_FLIP, 'Rum Flip', [T.dessert], [I.simpleSyrup]))
  test.use({ world })

  test('wraps after a separator, or at the hyphen of "spirit-forward", and nowhere else', async ({ page }) => {
    await page.goto('/tonight')
    await expect(rowLine(page, 'White rum')).toHaveText(
      'Unlocks 7·\u200A2 sours · 2 tiki drinks · 1 spirit-forward drink · 1 highball · 1 dessert drink',
    )
    // The hyphen is a compound's own break: held, the phrase could not break
    // at all, and would overflow a 320px viewport's line (ShoppingRow.tsx).
    const lines = await renderedLines(page, 'White rum')
    expect(lines.length, `lines: ${JSON.stringify(lines)}`).toBeGreaterThan(2)
    expect(lines.slice(0, -1).filter((line) => !/(·|spirit-)$/.test(line.trimEnd()))).toEqual([])
    expect(lines.filter((line) => line.trimStart().startsWith('·'))).toEqual([])
  })
})

test.describe('To buy, a bottle whose drinks are partly untagged', () => {
  // Scotch whisky opens the Rob Roy (spirit-forward) and the Bobby Burns (no tag).
  test.use({ world: tonightWorld((w) => (w.list = [I.scotch])) })

  test('counts both and names the one family', async ({ page }) => {
    await page.goto('/tonight')
    await expect(rowLine(page, 'Scotch whisky')).toHaveText('Unlocks 2·\u200A1 spirit-forward drink')
  })
})

test.describe('To buy, a bottle whose drinks carry no family', () => {
  // The Rob Roy tagged only "Classic": neither drink Scotch whisky opens has a family.
  test.use({
    world: tonightWorld((w) => {
      w.list = [I.scotch]
      const robRoy = w.cocktails.find((c) => c.id === C.robRoy)
      if (robRoy) robRoy.tagIds = [T.classic]
    }),
  })

  test('states the count alone once their tags are read', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect.poll(() => tagReads(bar)).toEqual([{ ids: `${C.robRoy},${C.bobbyBurns}`, perPage: '2' }])
    await settled(bar)
    await expect(rowLine(page, 'Scotch whisky')).toHaveText('Unlocks 2')
  })
})

test.describe('To buy, when the tags cannot be read', () => {
  test.use({ world: tonightWorld((w) => (w.list = [I.scotch])) })

  test('states the count alone, and no error in its place', async ({ page, bar }) => {
    // Every read of the drinks' tags fails as upstream fails (Handler.php
    // 52-72). Registered after the fake's route, so Playwright asks it first;
    // the fake never sees these reads.
    let attempts = 0
    await page.route(
      (url) => url.pathname === '/bar/api/cocktails' && url.searchParams.has('include'),
      async (route) => {
        attempts += 1
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ type: 'api_error', message: 'Server Error' }),
        })
      },
    )
    await page.goto('/tonight')
    await expect(rowLine(page, 'Scotch whisky')).toHaveText('Unlocks 2')
    // The app's queries retry once.
    await expect.poll(() => attempts, { timeout: 10_000 }).toBe(2)
    await settled(bar)
    await expect(rowLine(page, 'Scotch whisky')).toHaveText('Unlocks 2')
    await expect(rail(page).getByRole('alert')).toHaveCount(0)
  })
})

test.describe('To buy, a staple', () => {
  // Lime juice is a staple (src/data/staples.ts), off the shelf and already
  // listed; it opens the Daiquiri and the Gimlet.
  test.use({
    world: tonightWorld((w) => {
      w.shelf = w.shelf.filter((id) => id !== I.limeJuice)
      w.list = [I.limeJuice]
    }),
  })

  test('keeps its attribution after the breakdown', async ({ page }) => {
    await page.goto('/tonight')
    await expect(rowLine(page, 'Lime juice')).toHaveText('Unlocks 2·\u200A2 sours · Staple')
    // The attribution's "·" is held to the families before it, as theirs are.
    await expect(rowDetail(page, 'Lime juice')).toHaveJSProperty('textContent', '\u200A2\u00A0sours\u00A0· Staple')
  })
})

test.describe('To buy, after a check-off', () => {
  // White rum off the shelf opens the Daiquiri; Mint opens nothing alone (the
  // Mojito wants white rum too). Once Mint is shelved, White rum also opens
  // the Mojito, a highball.
  test.use({
    world: tonightWorld((w) => {
      w.shelf = w.shelf.filter((id) => id !== I.whiteRum)
      w.list = [I.whiteRum, I.mint]
    }),
  })

  test('the breakdown follows the refreshed count, and never states another set of drinks', async ({
    page,
    bar,
  }) => {
    // Every line the White rum row passes through, from the first paint.
    await page.addInitScript(() => {
      const w = window as unknown as { __lines: string[] }
      w.__lines = []
      new MutationObserver(() => {
        const row = [...document.querySelectorAll('#buy .shopping-row-line')].find(
          (r) => r.querySelector('.bb-shop__name')?.textContent === 'White rum',
        )
        const line = row?.querySelector('.bb-shop__meta')?.textContent ?? ''
        if (line !== '' && line !== w.__lines[w.__lines.length - 1]) w.__lines.push(line)
      }).observe(document, { childList: true, subtree: true, characterData: true })
    })
    await page.goto('/tonight')
    await expect(rowLine(page, 'White rum')).toHaveText('Unlocks 1·\u200A1 sour')
    await expect(rowLine(page, 'Mint')).toHaveText('In 1 drink')

    await listItem(page, 'Mint').click()
    await expect(page.getByText('Moved to the shelf.')).toBeVisible()
    expect(bar.model.shelf.has(I.mint)).toBe(true)
    await expect(rowLine(page, 'White rum')).toHaveText('Unlocks 2·\u200A1 sour · 1 highball')

    // Before its drinks' tags are read, a count stands alone; it never stands
    // beside the breakdown of the drinks it counted before ("Unlocks 2", "1 sour").
    const lines = await page.evaluate(() => (window as unknown as { __lines: string[] }).__lines)
    // The lines are raw text, the no-break spaces as the row writes them.
    const allowed = [
      'Unlocks 1',
      'Unlocks 1· \u200A1\u00A0sour',
      'Unlocks 2',
      'Unlocks 2· \u200A1\u00A0sour\u00A0· 1\u00A0highball',
    ]
    expect(lines.filter((l) => !allowed.includes(l))).toEqual([])
    expect(lines[lines.length - 1]).toBe('Unlocks 2· \u200A1\u00A0sour\u00A0· 1\u00A0highball')
  })
})
