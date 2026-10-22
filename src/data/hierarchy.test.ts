import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../api/types'
import { BarModel, ingredientResource, orderByName } from '../../test/fixtures/upstream'
import { C, I, defaultWorld, type CocktailSeed } from '../../test/fixtures/world'
import {
  isPlaced,
  ledgerGroups,
  reachDetail,
  reachFallbackParent,
  reachOf,
  rootIdOf,
  rootIdsOf,
} from './hierarchy'

// Hierarchy-aware brand counting (frontend-spec §9): the shelf ledger's
// grouping and the list's reach line, checked against ingredient resources
// shaped as Bar Assistant v5.15.3 emits them (test/fixtures/upstream.ts).

const model = () => new BarModel(defaultWorld())

/** GET /ingredients?filter[on_shelf]=true rows: index resources in SQL name
 *  order (IngredientQueryFilter defaultSort('name'); orderByName). */
function shelfRows(m: BarModel) {
  return orderByName([...m.shelf].map((id) => ingredientResource(m, id, 'index')))
}

/** What useIngredientsByIds selects from GET /ingredients?filter[id]=…. */
function namesOf(m: BarModel, ids: number[]) {
  return new Map(ids.map((id) => [id, ingredientResource(m, id, 'index').name]))
}

/** A recipe calling Islay Scotch that the default shelf cannot pour. */
function islayRecipe(id: number): CocktailSeed {
  return {
    id,
    name: `Islay sour ${id}`,
    instructions: 'Shake with ice and strain.',
    lines: [
      { ingredientId: I.islayScotch, amount: 60, units: 'ml' },
      { ingredientId: I.honeySyrup, amount: 20, units: 'ml' },
    ],
  }
}

describe('isPlaced', () => {
  it('holds for every index and show resource upstream sends, roots included', () => {
    const m = model()
    for (const seed of m.world.ingredients) {
      expect(isPlaced(ingredientResource(m, seed.id, 'index')), seed.name).toBe(true)
      expect(isPlaced(ingredientResource(m, seed.id, 'show')), seed.name).toBe(true)
    }
  })

  it('fails for the client’s pending entry, which carries no materialized_path', () => {
    // What useShelfMutation puts on the cached shelf for a chip just tapped on.
    const pending: Ingredient = { id: I.cointreau, slug: 'cointreau-1', name: 'Cointreau', strength: 0, in_shelf: true }
    expect(isPlaced(pending)).toBe(false)
  })
})

describe('rootIdOf', () => {
  it('groups a root under itself (materialized_path is null)', () => {
    const spirits = ingredientResource(model(), I.spirits, 'index')
    expect(spirits.materialized_path).toBeNull()
    expect(rootIdOf(spirits)).toBe(I.spirits)
  })

  it('reads a child’s root from the head of its path', () => {
    const rum = ingredientResource(model(), I.rum, 'index')
    expect(rum.materialized_path).toBe('1/')
    expect(rootIdOf(rum)).toBe(I.spirits)
  })

  it('reads the root of a deep chain, not the direct parent', () => {
    const laphroaig = ingredientResource(model(), I.laphroaig10, 'index')
    expect(laphroaig.materialized_path).toBe('1/5/6/7/')
    expect(rootIdOf(laphroaig)).toBe(I.spirits)
  })

  it('agrees with upstream’s own hierarchy.root_ingredient_id for every ingredient', () => {
    const m = model()
    for (const seed of m.world.ingredients) {
      const row = ingredientResource(m, seed.id, 'index')
      expect(rootIdOf(row), row.name).toBe(row.hierarchy.root_ingredient_id ?? row.id)
    }
  })
})

describe('rootIdsOf', () => {
  it('names each root once, in first-seen order', () => {
    const m = model()
    const rows = [I.lemonJuice, I.whiteRum, I.limeJuice, I.laphroaig10, I.juices].map((id) =>
      ingredientResource(m, id, 'index'),
    )
    expect(rootIdsOf(rows)).toEqual([I.juices, I.spirits])
  })
})

describe('ledgerGroups', () => {
  it('groups the shelf under root ancestors, Spirits first, the rest alphabetical', () => {
    const m = model()
    const rows = shelfRows(m)
    const groups = ledgerGroups(rows, namesOf(m, rootIdsOf(rows)))
    expect(groups?.map((g) => [g.label, g.rows.map((r) => r.name)])).toEqual([
      ['Spirits', ['Bourbon whiskey', 'Gin', 'Laphroaig 10', 'White rum']],
      ['Beverages', ['Club soda', 'Tonic']],
      ['Bitters', ['Angostura aromatic bitters']],
      ['Fortified wine', ['Sweet vermouth']],
      ['Juices', ['Lemon juice', 'Lime juice']],
      ['Sweeteners', ['Simple syrup']],
    ])
  })

  it('keeps shelf order inside a group', () => {
    const m = model()
    const rows = [I.whiteRum, I.laphroaig10, I.bourbon].map((id) => ingredientResource(m, id, 'index'))
    const groups = ledgerGroups(rows, namesOf(m, [I.spirits]))
    expect(groups?.[0]?.rows.map((r) => r.id)).toEqual([I.whiteRum, I.laphroaig10, I.bourbon])
  })

  it('puts Spirits ahead of groups that sort before it', () => {
    const m = model()
    const rows = [I.tonic, I.cointreau, I.gin].map((id) => ingredientResource(m, id, 'index'))
    const groups = ledgerGroups(rows, namesOf(m, rootIdsOf(rows)))
    expect(groups?.map((g) => g.label)).toEqual(['Spirits', 'Beverages', 'Liqueurs'])
  })

  it('files a root bottle under its own name, beside its children', () => {
    const m = model()
    const rows = [I.juices, I.limeJuice].map((id) => ingredientResource(m, id, 'index'))
    const groups = ledgerGroups(rows, namesOf(m, rootIdsOf(rows)))
    expect(groups).toEqual([{ label: 'Juices', rows }])
  })

  it('reads flat until the root names load', () => {
    const rows = shelfRows(model())
    expect(ledgerGroups(rows, undefined)).toBeNull()
  })

  it('reads flat while any row’s root has no name', () => {
    const m = model()
    const rows = shelfRows(m)
    const partial = namesOf(m, rootIdsOf(rows).filter((id) => id !== I.juices))
    expect(ledgerGroups(rows, partial)).toBeNull()
  })

  it('is empty, not flat, for an empty shelf once names are known', () => {
    expect(ledgerGroups([], new Map())).toEqual([])
  })
})

describe('reachOf', () => {
  it('counts the recipes that call the bottle itself', () => {
    const m = model()
    const islay = ingredientResource(m, I.islayScotch, 'show')
    expect(islay.cocktails_count).toBe(1) // Penicillin
    expect(reachOf(islay, undefined)).toEqual({ count: 1 })
  })

  it('falls back to the direct parent when the bottle itself is in no recipe', () => {
    const m = model()
    const laphroaig = ingredientResource(m, I.laphroaig10, 'show')
    expect(laphroaig.cocktails_count).toBe(0)
    const islay = ingredientResource(m, I.islayScotch, 'show')
    expect(reachOf(laphroaig, islay)).toEqual({ count: 1, via: 'Islay Scotch' })
  })

  it('carries the parent’s full count, as the list says it ("in 12 drinks as Islay Scotch")', () => {
    const m = model()
    for (let id = 100; id < 111; id += 1) m.world.cocktails.push(islayRecipe(id))
    const islay = ingredientResource(m, I.islayScotch, 'show')
    expect(islay.cocktails_count).toBe(12)
    expect(reachOf(ingredientResource(m, I.laphroaig10, 'show'), islay)).toEqual({
      count: 12,
      via: 'Islay Scotch',
    })
  })

  it('does not credit an intermediate ancestor’s recipes (the matcher does not either)', () => {
    const m = model()
    // Without Penicillin, Islay Scotch is in no recipe; Scotch whisky, two
    // levels up, is in Rob Roy and Bobby Burns — which Laphroaig 10 does not pour.
    m.world.cocktails.splice(
      m.world.cocktails.findIndex((c) => c.id === C.penicillin),
      1,
    )
    expect(m.canMakeWith(new Set([I.laphroaig10, I.sweetVermouth, I.angostura])).has(C.robRoy)).toBe(false)
    const islay = ingredientResource(m, I.islayScotch, 'show')
    expect(islay.cocktails_count).toBe(0)
    expect(ingredientResource(m, I.scotch, 'show').cocktails_count).toBe(2)
    expect(reachOf(ingredientResource(m, I.laphroaig10, 'show'), islay)).toBeUndefined()
  })

  it('says nothing for a root that is in no recipe', () => {
    const spirits = ingredientResource(model(), I.spirits, 'show')
    expect(spirits.cocktails_count).toBe(0)
    expect(spirits.hierarchy.parent_ingredient).toBeNull()
    expect(reachOf(spirits, undefined)).toBeUndefined()
  })

  it('says nothing while the bottle or its parent is still loading', () => {
    const m = model()
    expect(reachOf(undefined, undefined)).toBeUndefined()
    expect(reachOf(ingredientResource(m, I.laphroaig10, 'show'), undefined)).toBeUndefined()
  })
})

describe('reachFallbackParent', () => {
  it('is the direct parent of a bottle in no recipe', () => {
    expect(reachFallbackParent(ingredientResource(model(), I.laphroaig10, 'show'))).toEqual({
      id: I.islayScotch,
      slug: 'islay-scotch-1',
      name: 'Islay Scotch',
    })
  })

  it('is null when the bottle is in a recipe, is a root, or has not loaded', () => {
    const m = model()
    expect(reachFallbackParent(ingredientResource(m, I.islayScotch, 'show'))).toBeNull()
    expect(reachFallbackParent(ingredientResource(m, I.spirits, 'show'))).toBeNull()
    expect(reachFallbackParent(undefined)).toBeNull()
  })
})

describe('reachDetail', () => {
  it('says the count and, for a brand, what it is in as', () => {
    expect(reachDetail({ count: 12, via: 'Islay Scotch' })).toBe('In 12 drinks as Islay Scotch')
    expect(reachDetail({ count: 3 })).toBe('In 3 drinks')
  })

  it('is singular for one drink', () => {
    expect(reachDetail({ count: 1 })).toBe('In 1 drink')
    expect(reachDetail({ count: 1, via: 'Islay Scotch' })).toBe('In 1 drink as Islay Scotch')
  })
})
