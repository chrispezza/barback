import { describe, expect, it } from 'vitest'
import { BarModel, cocktailIngredientResource, type Endpoint } from '../../test/fixtures/upstream'
import { C, I, defaultWorld } from '../../test/fixtures/world'
import { isStocked, type CocktailIngredientEntry } from './types'

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
