import { describe, expect, it } from 'vitest'
import {
  BarModel,
  cocktailIngredientResource,
  ingredientResource,
  type Endpoint,
} from '../../test/fixtures/upstream'
import { C, I, defaultWorld } from '../../test/fixtures/world'
import { isStocked, shelfIndex, type CocktailIngredientEntry, type ShelfIndex } from './types'

// isStocked is the per-line half of stock colouring (frontend-spec §2, "Per-
// ingredient stock color"). Every entry here comes from the fixture builders in
// the shape Bar Assistant v5.15.3 emits on that endpoint (ADR-011): the index
// and /similar carry `in_shelf` only; show adds the three in_shelf_as_* flags
// (CocktailIngredientResource.php 62-77, each behind `$this->when(...)`).

const ENDPOINTS: Endpoint[] = ['index', 'show']

const model = () => new BarModel(defaultWorld())

/** The upstream resource for the line of `cocktailId` that calls `ingredientId`. */
function line(
  m: BarModel,
  cocktailId: number,
  ingredientId: number,
  endpoint: Endpoint,
): CocktailIngredientEntry {
  const seed = m.cocktail(cocktailId)!
  const index = seed.lines.findIndex((l) => l.ingredientId === ingredientId)
  return cocktailIngredientResource(m, seed.lines[index]!, index + 1, endpoint)
}

describe('isStocked', () => {
  describe.each(ENDPOINTS)('on the %s shape', (endpoint) => {
    it('counts a line whose ingredient is held exactly', () => {
      const m = model()
      // Daiquiri calls White rum; the default shelf holds it.
      const rum = line(m, C.daiquiri, I.whiteRum, endpoint)
      expect(rum.in_shelf).toBe(true)
      expect(isStocked(rum)).toBe(true)
    })

    it('does not count a line nothing on the shelf covers', () => {
      const m = model()
      // Margarita calls Tequila; nothing in its tree is held.
      const tequila = line(m, C.margarita, I.tequila, endpoint)
      expect(tequila.in_shelf).toBe(false)
      expect(isStocked(tequila)).toBe(false)
    })

    it('reports stock, not need: an optional line is stocked only when held', () => {
      const m = model()
      // Whiskey Sour's egg white is optional and off the shelf. Optional lines
      // never count as missing, but that is the callers' rule, not this one's.
      expect(isStocked(line(m, C.whiskeySour, I.eggWhite, endpoint))).toBe(false)
      m.shelf.add(I.eggWhite)
      const egg = line(m, C.whiskeySour, I.eggWhite, endpoint)
      expect(egg.optional).toBe(true)
      expect(isStocked(egg)).toBe(true)
    })
  })

  it('treats the in_shelf_as_* flags as false where the endpoint omits them', () => {
    const m = model()
    const tequila = line(m, C.margarita, I.tequila, 'index')
    expect('in_shelf_as_variant' in tequila).toBe(false)
    expect('in_shelf_as_substitute' in tequila).toBe(false)
    expect('in_shelf_as_complex_ingredient' in tequila).toBe(false)
    expect(isStocked(tequila)).toBe(false)
  })

  it('does not count a line whose flags are all present and false', () => {
    const tequila = line(model(), C.margarita, I.tequila, 'show')
    expect(tequila).toMatchObject({
      in_shelf: false,
      in_shelf_as_variant: false,
      in_shelf_as_substitute: false,
      in_shelf_as_complex_ingredient: false,
    })
    expect(isStocked(tequila)).toBe(false)
  })

  it('counts a line a held child brand satisfies (in_shelf_as_variant)', () => {
    const m = model()
    // Penicillin calls Islay Scotch; the shelf holds Laphroaig 10, its direct
    // child, which the upstream matcher also credits (CocktailService.php 281-288).
    const scotch = line(m, C.penicillin, I.islayScotch, 'show')
    expect(scotch).toMatchObject({ in_shelf: false, in_shelf_as_variant: true })
    expect(isStocked(scotch)).toBe(true)
  })

  it('counts a line a held substitute satisfies (in_shelf_as_substitute)', () => {
    const m = model()
    // Mojito's club soda line lists Tonic as a substitute.
    m.shelf.delete(I.clubSoda)
    const soda = line(m, C.mojito, I.clubSoda, 'show')
    expect(soda).toMatchObject({ in_shelf: false, in_shelf_as_substitute: true })
    expect(isStocked(soda)).toBe(true)
  })

  it('counts a line a held complex ingredient satisfies (in_shelf_as_complex_ingredient)', () => {
    // The fixture world has no complex ingredients, so the builder always
    // emits false. Upstream sets the flag when every one of the line
    // ingredient's parts is on the user's shelf (Ingredient.php 185-195,
    // userHasInShelfAsComplexIngredient); set it as that rule would.
    const cointreau = line(model(), C.margarita, I.cointreau, 'show')
    expect(isStocked(cointreau)).toBe(false)
    expect(isStocked({ ...cointreau, in_shelf_as_complex_ingredient: true })).toBe(true)
  })
})

// List cards (chrispezza/barback#20). GET /cocktails and /cocktails/{id}/similar
// load no descendants, substitutes or parts upstream, so their entries carry
// the exact `in_shelf` only. Given the shelf as useShelf reads it, isStocked
// applies the upstream matcher's own hierarchy rule (CocktailService.php
// 281-288 at v5.15.3): a line that is not `is_specified` is stocked when a held
// ingredient's direct parent, or its root, is the line's ingredient. An
// intermediate ancestor is not credited, because the matcher does not credit it.

/** The shelf as useShelf receives it: GET /ingredients?filter[on_shelf]=true. */
function shelfOf(m: BarModel): ShelfIndex {
  return shelfIndex([...m.shelf].map((id) => ingredientResource(m, id, 'index')))
}

describe('isStocked with the shelf, on the index shape', () => {
  it('counts a line calling the direct parent of a held brand', () => {
    const m = model()
    // Penicillin calls Islay Scotch; the shelf holds Laphroaig 10, its child.
    const scotch = line(m, C.penicillin, I.islayScotch, 'index')
    expect(scotch).toMatchObject({ in_shelf: false, is_specified: false })
    expect('in_shelf_as_variant' in scotch).toBe(false)
    expect(isStocked(scotch, shelfOf(m))).toBe(true)
  })

  it('counts a line calling the root of a held brand', () => {
    const m = model()
    // Laphroaig 10's path is Spirits/Whisky/Scotch whisky/Islay Scotch.
    const spirits = cocktailIngredientResource(m, { ingredientId: I.spirits, amount: 60, units: 'ml' }, 1, 'index')
    expect(spirits.in_shelf).toBe(false)
    expect(isStocked(spirits, shelfOf(m))).toBe(true)
  })

  it('does not count a line calling an intermediate ancestor of a held brand', () => {
    const m = model()
    // Rob Roy calls Scotch whisky: Laphroaig 10's grandparent, not its parent
    // or its root. The matcher leaves the line unmatched, and so does this.
    const scotch = line(m, C.robRoy, I.scotch, 'index')
    expect(m.lineMatches(m.cocktail(C.robRoy)!.lines[0]!, m.shelf)).toBe(false)
    expect(isStocked(scotch, shelfOf(m))).toBe(false)
  })

  it('does not count a held child toward an is_specified line', () => {
    const m = model()
    const specified = cocktailIngredientResource(
      m,
      { ingredientId: I.islayScotch, amount: 60, units: 'ml', isSpecified: true },
      1,
      'index',
    )
    expect(specified.is_specified).toBe(true)
    expect(isStocked(specified, shelfOf(m))).toBe(false)
  })

  it('reads the line flags alone while the shelf is not known', () => {
    expect(isStocked(line(model(), C.penicillin, I.islayScotch, 'index'))).toBe(false)
  })

  // The same answer the fixture's model of the matcher gives (pinned to the
  // upstream lines it cites in test/fixtures/upstream.test.ts), line by line,
  // on shelves that reach a line through a parent, a root, an intermediate
  // ancestor and nothing at all. Lines with substitutes are left out: the index
  // shape carries no substitutes, so a held substitute stays invisible there.
  const shelves: [string, number[]][] = [
    ['the default shelf', defaultWorld().shelf],
    ['a bare shelf', []],
    ['London dry gin in place of Gin', [...defaultWorld().shelf.filter((id) => id !== I.gin), I.londonDryGin]],
    ['brands and children only', [I.laphroaig10, I.londonDryGin, I.darkRum, I.cointreau, I.honeySyrup]],
  ]

  it.each(shelves)('agrees with the upstream matcher on every line, on %s', (_name, held) => {
    const m = model()
    m.shelf.clear()
    for (const id of held) m.shelf.add(id)
    const shelf = shelfOf(m)
    for (const cocktail of m.world.cocktails) {
      cocktail.lines.forEach((seed, i) => {
        if (seed.substituteIds?.length) return
        const entry = cocktailIngredientResource(m, seed, i + 1, 'index')
        expect(isStocked(entry, shelf), `${cocktail.name}: ${entry.ingredient.name}`).toBe(
          m.lineMatches(seed, m.shelf),
        )
      })
    }
  })
})
