import { describe, expect, it } from 'vitest'
import type { Cocktail } from '../api/types'
import { BarModel, cocktailResource, slugify, type Endpoint } from '../../test/fixtures/upstream'
import { C, I, defaultWorld, type CocktailLineSeed, type CocktailSeed } from '../../test/fixtures/world'
import { RATIOS, deriveRatio, fractionGlyph, normalizeSlug, ratioForSlug, type RatioTemplate } from './ratios'

// Ratio templates (ADR-002; frontend-spec §3). Curated templates are client
// data keyed by the normalized Bar Assistant slug; every other recipe has its
// skeleton read off its own lines. Cocktails here are built by the fixture
// model, so slugs and `formatted` amounts have the shape v5.15.3 emits:
// "<name>-<bar id>" slugs, ml → oz as ml/30 rounded to four places.

let nextId = 900

function seed(name: string, lines: CocktailLineSeed[]): CocktailSeed {
  nextId += 1
  return { id: nextId, name, lines, instructions: '' }
}

function bar(opts: { barId?: number; extra?: CocktailSeed[] } = {}): BarModel {
  const world = defaultWorld()
  if (opts.barId !== undefined) world.barId = opts.barId
  world.cocktails.push(...(opts.extra ?? []))
  return new BarModel(world)
}

function cocktail(m: BarModel, id: number, endpoint: Endpoint = 'show'): Cocktail {
  const c = m.cocktail(id)
  if (!c) throw new Error(`fixture world has no cocktail ${id}`)
  return cocktailResource(m, c, endpoint)
}

const parts = (r: RatioTemplate | undefined) => r?.parts.map((p) => [p.value, p.label])

// Vintage names as scripts/vintage/winter-1884.json prints them.
const manhattan1884 = seed('Manhattan Cocktail (1884)', [
  { ingredientId: I.rye, amount: 30, units: 'ml' },
  { ingredientId: I.sweetVermouth, amount: 30, units: 'ml' },
  { ingredientId: I.angostura, amount: 3, units: 'dash' },
])
const turfClub1884 = seed('Turf Club Cocktail (1884)', [
  { ingredientId: I.londonDryGin, amount: 30, units: 'ml' },
  { ingredientId: I.sweetVermouth, amount: 30, units: 'ml' },
  { ingredientId: I.angostura, amount: 3, units: 'dash' },
])
const daiquiriNo2 = seed('Daiquiri No. 2', [
  { ingredientId: I.whiteRum, amount: 60, units: 'ml' },
  { ingredientId: I.limeJuice, amount: 22.5, units: 'ml' },
  { ingredientId: I.cointreau, amount: 7.5, units: 'ml' },
])

describe('normalizeSlug', () => {
  it('strips the bar id upstream appends to every cocktail slug', () => {
    const m = bar()
    expect(cocktail(m, C.daiquiri).slug).toBe('daiquiri-1')
    expect(normalizeSlug(cocktail(m, C.daiquiri).slug)).toBe('daiquiri')
    expect(normalizeSlug(cocktail(m, C.whiskeySour).slug)).toBe('whiskey-sour')
    expect(normalizeSlug(cocktail(m, C.darkNStormy).slug)).toBe('dark-n-stormy')
  })

  it('strips a bar id of more than one digit', () => {
    const m = bar({ barId: 12 })
    expect(cocktail(m, C.oldFashioned).slug).toBe('old-fashioned-12')
    expect(normalizeSlug(cocktail(m, C.oldFashioned).slug)).toBe('old-fashioned')
  })

  it('keeps the year of a vintage slug and any number that ends a name', () => {
    const m = bar({ extra: [manhattan1884, turfClub1884, daiquiriNo2] })
    expect(cocktail(m, manhattan1884.id).slug).toBe('manhattan-cocktail-1884-1')
    expect(normalizeSlug('manhattan-cocktail-1884-1')).toBe('manhattan-cocktail-1884')
    expect(normalizeSlug(cocktail(m, turfClub1884.id).slug)).toBe('turf-club-cocktail-1884')
    expect(normalizeSlug(cocktail(m, daiquiriNo2.id).slug)).toBe('daiquiri-no-2')
  })
})

describe('ratioForSlug', () => {
  it('finds the curated template from the slug the API returns', () => {
    const r = ratioForSlug(cocktail(bar(), C.daiquiri).slug)
    expect(r?.cocktailSlug).toBe('daiquiri')
    expect(parts(r)).toEqual([
      ['2', 'RUM'],
      ['¾', 'LIME'],
      ['¾', 'SYRUP'],
    ])
  })

  it('resolves every curated template from the slug upstream would emit for it', () => {
    for (const r of RATIOS) {
      expect(ratioForSlug(`${r.cocktailSlug}-1`)).toBe(r)
      expect(ratioForSlug(`${r.cocktailSlug}-12`)).toBe(r)
    }
  })

  it('gives a vintage drink its own template, not the modern one it starts with', () => {
    const m = bar({ extra: [manhattan1884, turfClub1884] })
    const vintage = ratioForSlug(cocktail(m, manhattan1884.id).slug)
    expect(vintage?.cocktailSlug).toBe('manhattan-cocktail-1884')
    expect(parts(vintage)).toEqual([
      ['1', 'WHISKEY'],
      ['1', 'VERMOUTH'],
    ])
    expect(parts(ratioForSlug(cocktail(m, C.manhattan).slug))).toEqual([
      ['2', 'WHISKEY'],
      ['1', 'VERMOUTH'],
    ])
    expect(ratioForSlug(cocktail(m, turfClub1884.id).slug)?.cocktailSlug).toBe('turf-club-cocktail-1884')
  })

  it('never lends one drink’s template to another', () => {
    const m = bar({ extra: [manhattan1884, turfClub1884, daiquiriNo2] })
    for (const c of m.world.cocktails) {
      const slug = cocktail(m, c.id).slug
      const found = ratioForSlug(slug)
      if (found) expect(found.cocktailSlug).toBe(normalizeSlug(slug))
    }
    // Names that contain a curated slug are not that drink.
    expect(ratioForSlug(cocktail(m, C.espressoMartini).slug)?.cocktailSlug).not.toBe('martini')
    expect(ratioForSlug(cocktail(m, daiquiriNo2.id).slug)?.cocktailSlug).not.toBe('daiquiri')
  })

  it('answers undefined for a slug with no template', () => {
    expect(ratioForSlug('house-pour-of-the-evening-1')).toBeUndefined()
  })
})

describe('deriveRatio', () => {
  it('reads the skeleton off a recipe in ounces, labelled by ingredient', () => {
    expect(deriveRatio(cocktail(bar(), C.daiquiri))).toEqual({
      cocktailSlug: 'daiquiri',
      parts: [
        { value: '2', label: 'White rum' },
        { value: '¾', label: 'Lime juice' },
        { value: '¾', label: 'Simple syrup' },
      ],
    })
    expect(parts(deriveRatio(cocktail(bar(), C.negroni)))).toEqual([
      ['1', 'Gin'],
      ['1', 'Campari'],
      ['1', 'Sweet vermouth'],
    ])
  })

  it('derives the same skeleton from the index and the show resource', () => {
    const m = bar()
    for (const c of m.world.cocktails) {
      expect(deriveRatio(cocktail(m, c.id, 'index'))).toEqual(deriveRatio(cocktail(m, c.id, 'show')))
    }
  })

  it('takes the first three measured lines and no more', () => {
    // Mojito: rum, lime, syrup, mint (leaves), soda. Soda is measured but fifth.
    expect(parts(deriveRatio(cocktail(bar(), C.mojito)))).toEqual([
      ['1½', 'White rum'],
      ['⅔', 'Lime juice'],
      ['½', 'Simple syrup'],
    ])
  })

  it('skips dashes', () => {
    const m = bar()
    expect(parts(deriveRatio(cocktail(m, C.oldFashioned)))).toEqual([
      ['2', 'Bourbon whiskey'],
      ['¼', 'Simple syrup'],
    ])
    expect(parts(deriveRatio(cocktail(m, C.manhattan)))).toEqual([
      ['2', 'Rye whiskey'],
      ['1', 'Sweet vermouth'],
    ])
  })

  it('skips barspoons, although upstream converts them to ounces', () => {
    const improved = seed('Improved Manhattan', [
      { ingredientId: I.rye, amount: 60, units: 'ml' },
      { ingredientId: I.simpleSyrup, amount: 1, units: 'barspoon' },
      { ingredientId: I.sweetVermouth, amount: 30, units: 'ml' },
      { ingredientId: I.angostura, amount: 2, units: 'dash' },
    ])
    const c = cocktail(bar({ extra: [improved] }), improved.id)
    expect(c.ingredients[1]?.formatted.oz.units).toBe('oz')
    expect(c.ingredients[1]?.formatted.oz.amount).toBeGreaterThan(0)
    expect(parts(deriveRatio(c))).toEqual([
      ['2', 'Rye whiskey'],
      ['1', 'Sweet vermouth'],
    ])
  })

  it('skips leaves, which upstream passes through unconverted', () => {
    const smash = seed('Whiskey Smash', [
      { ingredientId: I.mint, amount: 8, units: 'leaves' },
      { ingredientId: I.bourbon, amount: 60, units: 'ml' },
      { ingredientId: I.lemonJuice, amount: 22.5, units: 'ml' },
      { ingredientId: I.simpleSyrup, amount: 22.5, units: 'ml' },
    ])
    const c = cocktail(bar({ extra: [smash] }), smash.id)
    expect(c.ingredients[0]?.formatted.oz).toMatchObject({ amount: 8, units: 'leaves' })
    expect(parts(deriveRatio(c))).toEqual([
      ['2', 'Bourbon whiskey'],
      ['¾', 'Lemon juice'],
      ['¾', 'Simple syrup'],
    ])
  })

  it('skips optional lines', () => {
    // Dark 'n' Stormy: the lime is optional; without it two parts remain.
    expect(parts(deriveRatio(cocktail(bar(), C.darkNStormy)))).toEqual([
      ['2', 'Dark rum'],
      ['3⅓', 'Ginger beer'],
    ])
  })

  it('skips a line with no amount', () => {
    const topped = seed('Gin Rickey', [
      { ingredientId: I.gin, amount: 60, units: 'ml' },
      { ingredientId: I.clubSoda, amount: 0, units: 'ml' },
      { ingredientId: I.limeJuice, amount: 22.5, units: 'ml' },
    ])
    expect(parts(deriveRatio(cocktail(bar({ extra: [topped] }), topped.id)))).toEqual([
      ['2', 'Gin'],
      ['¾', 'Lime juice'],
    ])
  })

  it('counts ounce and centilitre lines as measured', () => {
    const authored = seed('Dry Martini', [
      { ingredientId: I.londonDryGin, amount: 2, units: 'oz' },
      { ingredientId: I.dryVermouth, amount: 1.5, units: 'cl' },
    ])
    expect(parts(deriveRatio(cocktail(bar({ extra: [authored] }), authored.id)))).toEqual([
      ['2', 'London dry gin'],
      ['½', 'Dry vermouth'],
    ])
  })

  it('answers undefined when fewer than two measured parts remain', () => {
    const neat = seed('Neat pour', [{ ingredientId: I.spirits, amount: 60, units: 'ml' }])
    // Gin Cocktail (1884): one measure of gin, the rest in dashes.
    const ginCocktail1884 = seed('Gin Cocktail (1884)', [
      { ingredientId: I.londonDryGin, amount: 60, units: 'ml' },
      { ingredientId: I.simpleSyrup, amount: 3, units: 'dash' },
      { ingredientId: I.angostura, amount: 2, units: 'dash' },
    ])
    const flip = seed('Bourbon flip', [
      { ingredientId: I.bourbon, amount: 60, units: 'ml' },
      { ingredientId: I.eggWhite, amount: 15, units: 'ml', optional: true },
      { ingredientId: I.angostura, amount: 2, units: 'dash' },
    ])
    const m = bar({ extra: [neat, ginCocktail1884, flip] })
    expect(deriveRatio(cocktail(m, neat.id))).toBeUndefined()
    expect(deriveRatio(cocktail(m, ginCocktail1884.id))).toBeUndefined()
    expect(deriveRatio(cocktail(m, flip.id))).toBeUndefined()
  })

  it('keys the derived skeleton by the normalized slug, year kept', () => {
    const samWard = seed('Sam Ward (1884)', [
      { ingredientId: I.cognac, amount: 30, units: 'ml' },
      { ingredientId: I.coffeeLiqueur, amount: 30, units: 'ml' },
    ])
    const derived = deriveRatio(cocktail(bar({ extra: [samWard] }), samWard.id))
    expect(derived?.cocktailSlug).toBe('sam-ward-1884')
    expect(parts(derived)).toEqual([
      ['1', 'Cognac'],
      ['1', 'Coffee liqueur'],
    ])
  })
})

describe('fractionGlyph', () => {
  it.each([
    [0.25, '¼'],
    [0.5, '½'],
    [0.75, '¾'],
    [0.33, '⅓'],
    [0.67, '⅔'],
    [0.125, '⅛'],
  ])('prints %s as %s', (n, glyph) => {
    expect(fractionGlyph(n)).toBe(glyph)
  })

  it('reads upstream’s four-place thirds as thirds', () => {
    // 10 ml and 20 ml arrive as 0.3333 and 0.6667 oz.
    expect(fractionGlyph(0.3333)).toBe('⅓')
    expect(fractionGlyph(0.6667)).toBe('⅔')
  })

  it.each([
    [1, '1'],
    [2, '2'],
    [3, '3'],
    [10, '10'],
  ])('prints the whole %s as %s', (n, text) => {
    expect(fractionGlyph(n)).toBe(text)
  })

  it('reads a value a hair under a whole as the whole', () => {
    expect(fractionGlyph(1.9999)).toBe('2')
  })

  it.each([
    [1.5, '1½'],
    [1.75, '1¾'],
    [2.25, '2¼'],
    [2.5, '2½'],
    [1.125, '1⅛'],
    [1.3333, '1⅓'],
    [1.6667, '1⅔'],
    [3.3333, '3⅓'],
  ])('prints the mixed number %s as %s', (n, text) => {
    expect(fractionGlyph(n)).toBe(text)
  })
})

/** A display string (frontend-spec §3): a numeral or fraction glyph, never a
 *  float — if it parses as a number at all, it is a whole one. */
function expectDisplayValue(value: string) {
  expect(value).toMatch(/^(\d|[¼½¾⅓⅔⅛])/)
  expect(value).not.toMatch(/[.,]/)
  const n = Number(value)
  expect(Number.isNaN(n) || Number.isInteger(n)).toBe(true)
}

describe('RATIOS', () => {
  it('has one template per slug', () => {
    const slugs = RATIOS.map((r) => r.cocktailSlug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('keys each template by a slug without the bar id, in upstream’s slug form', () => {
    for (const r of RATIOS) {
      expect(slugify(r.cocktailSlug)).toBe(r.cocktailSlug)
    }
  })

  it('gives every template 2 to 4 parts', () => {
    for (const r of RATIOS) {
      expect(r.parts.length, r.cocktailSlug).toBeGreaterThanOrEqual(2)
      expect(r.parts.length, r.cocktailSlug).toBeLessThanOrEqual(4)
    }
  })

  it('writes every part as a display string with a label, never a decimal', () => {
    for (const r of RATIOS) {
      for (const p of r.parts) {
        expectDisplayValue(p.value)
        expect(p.label.trim(), r.cocktailSlug).not.toBe('')
      }
    }
  })
})
