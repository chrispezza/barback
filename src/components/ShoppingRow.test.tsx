import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { BarModel } from '../../test/fixtures/upstream'
import { C, I, T, defaultWorld, type CocktailSeed } from '../../test/fixtures/world'
import { FAMILIES } from '../data/families'
import { ShoppingRow, familiesDetail, singular } from './ShoppingRow'

// The list row's detail line (frontend-spec §9, "Hierarchy-aware brands"): a
// bottle that unlocks nothing says what it builds toward. One that unlocks
// drinks names their families after the count (frontend-spec §6 Journey 3,
// "annotated by family").
//
// The row's query hooks are answered from the fixture model rather than through
// a stubbed fetch: @tanstack/react-query is externalised by Vitest, so its own
// `import 'react'` resolves to the real React instead of preact/compat and
// cannot render under Preact here. The hooks' fetching is driven end to end in
// e2e/shelf-hierarchy.spec.ts instead; this test pins what the row does with
// their answers, using the real reach decision (data/hierarchy.ts).

const state = vi.hoisted(() => ({
  m: undefined as BarModel | undefined,
  reachAsked: [] as { id: number; enabled: boolean }[],
  /** Whether the tags of the drinks a bottle unlocks have been read. */
  tagsRead: true,
}))

vi.mock('../api/queries', async () => {
  const { ingredientResource } = await import('../../test/fixtures/upstream')
  const { reachFallbackParent, reachOf } = await import('../data/hierarchy')
  return {
    useBarId: () => state.m?.world.barId,
    // IngredientController::extra (IngredientController.php 199-226): the
    // cocktails this one bottle would add to the user's can-make set.
    useIngredientUnlocks: (_barId: number | undefined, id: number) => {
      const m = state.m
      if (!m) return { data: undefined }
      const before = m.canMake()
      const after = m.canMakeWith(new Set([...m.shelf, id]))
      return { data: [...after].filter((c) => !before.has(c)).length }
    },
    // As useIngredientReach fetches: the bottle's show resource, then — only
    // when reachFallbackParent names one — its direct parent's.
    useIngredientReach: (_barId: number | undefined, id: number, enabled: boolean) => {
      state.reachAsked.push({ id, enabled })
      const m = state.m
      if (!enabled || !m) return undefined
      const own = ingredientResource(m, id, 'show')
      const parent = reachFallbackParent(own)
      return reachOf(own, parent ? ingredientResource(m, parent.id, 'show') : undefined)
    },
  }
})

// As useUnlockFamilies joins its two reads: the drinks /extra names (as the
// count above), and the index's answer for them with their tags
// (cocktailResource with include=tags), through the real unlockFamilies; the
// tags answer only once `state.tagsRead`.
vi.mock('../api/unlocks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/unlocks')>()
  const { cocktailResource } = await import('../../test/fixtures/upstream')
  return {
    ...actual,
    useUnlockFamilies: (_barId: number | undefined, id: number) => {
      const m = state.m
      if (!m) return undefined
      const before = m.canMake()
      const drinks = [...m.canMakeWith(new Set([...m.shelf, id]))].filter((c) => !before.has(c))
      const tagged = drinks.flatMap((c) => {
        const seed = m.cocktail(c)
        return seed ? [cocktailResource(m, seed, 'index', { includeTags: true })] : []
      })
      return actual.unlockFamilies(drinks, state.tagsRead ? tagged : undefined)
    },
  }
})

beforeEach(() => {
  state.reachAsked = []
  state.tagsRead = true
})

// No Vitest globals (ADR-011), so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup()
  state.m = undefined
})

/** The default bar with the bottle off the shelf and on the list. */
function barWithout(id: number) {
  const m = new BarModel(defaultWorld())
  m.shelf.delete(id)
  m.list.set(id, 1)
  state.m = m
  return m
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

function renderRow(props: { ingredientId: number; name: string; isStaple?: boolean }) {
  return render(<ShoppingRow {...props} onCheckOff={() => {}} />)
}

const meta = (container: Element) => container.querySelector('.bb-shop__meta')?.textContent ?? null

describe('ShoppingRow detail line', () => {
  it('says what a zero-unlock brand builds toward through its parent', () => {
    const m = barWithout(I.laphroaig10)
    for (let id = 100; id < 111; id += 1) m.world.cocktails.push(islayRecipe(id))
    const { container } = renderRow({ ingredientId: I.laphroaig10, name: 'Laphroaig 10' })
    expect(meta(container)).toBe('In 12 drinks as Islay Scotch')
    expect(screen.queryByText(/Unlocks/)).toBeNull()
  })

  it('reads "In 1 drink as Islay Scotch" against the default bar', () => {
    barWithout(I.laphroaig10)
    const { container } = renderRow({ ingredientId: I.laphroaig10, name: 'Laphroaig 10' })
    expect(meta(container)).toBe('In 1 drink as Islay Scotch')
  })

  it('is singular for one drink and names no parent when the bottle is called itself', () => {
    // Espresso Martini calls coffee liqueur; vodka and espresso are not on the
    // shelf, so the bottle unlocks nothing yet.
    barWithout(I.coffeeLiqueur)
    const { container } = renderRow({ ingredientId: I.coffeeLiqueur, name: 'Coffee liqueur' })
    expect(meta(container)).toBe('In 1 drink')
  })

  it('shows the unlock count instead, and does not ask for reach, when the bottle unlocks a drink', () => {
    // Campari completes the Negroni, a spirit-forward drink, against the default shelf.
    barWithout(I.campari)
    const { container } = renderRow({ ingredientId: I.campari, name: 'Campari' })
    expect(meta(container)).toBe('Unlocks 1·1 spirit-forward drink')
    expect(state.reachAsked.every((r) => !r.enabled)).toBe(true)
  })

  it('attributes a staple, and does not ask for reach', () => {
    barWithout(I.clubSoda)
    const { container } = renderRow({ ingredientId: I.clubSoda, name: 'Club soda', isStaple: true })
    expect(meta(container)).toBe('Staple')
    expect(state.reachAsked.every((r) => !r.enabled)).toBe(true)
  })

  it('says nothing when neither the brand nor its parent is in a recipe', () => {
    const m = barWithout(I.laphroaig10)
    m.world.cocktails.splice(
      m.world.cocktails.findIndex((c) => c.id === C.penicillin),
      1,
    )
    const { container } = renderRow({ ingredientId: I.laphroaig10, name: 'Laphroaig 10' })
    expect(state.reachAsked.some((r) => r.enabled)).toBe(true)
    expect(screen.getByText('Laphroaig 10')).toBeTruthy()
    expect(meta(container)).toBeNull()
  })
})

/** A drink that pours once Espresso is on the default shelf, in the given family. */
function espressoDrink(id: number, tagId: number): CocktailSeed {
  return {
    id,
    name: `Espresso drink ${id}`,
    tagIds: [tagId],
    instructions: 'Shake with ice and strain.',
    lines: [
      { ingredientId: I.espresso, amount: 30, units: 'ml' },
      { ingredientId: I.simpleSyrup, amount: 10, units: 'ml' },
    ],
  }
}

const FAMILY_TAGS = [T.sour, T.spiritForward, T.highball, T.tiki, T.dessert]

describe('ShoppingRow families', () => {
  it('names the family of what it unlocks after the count, the untagged counted but not named', () => {
    // Scotch whisky opens the Rob Roy (spirit-forward) and the Bobby Burns (no family tag).
    barWithout(I.scotch)
    const { container } = renderRow({ ingredientId: I.scotch, name: 'Scotch whisky' })
    expect(meta(container)).toBe('Unlocks 2·1 spirit-forward drink')
  })

  it('states the count alone until the tags of its drinks are read', () => {
    barWithout(I.scotch)
    state.tagsRead = false
    const { container } = renderRow({ ingredientId: I.scotch, name: 'Scotch whisky' })
    expect(meta(container)).toBe('Unlocks 2')
  })

  it('states the count alone when none of its drinks has a family', () => {
    const m = barWithout(I.scotch)
    const robRoy = m.world.cocktails.find((c) => c.id === C.robRoy)
    if (robRoy) robRoy.tagIds = [T.classic]
    const { container } = renderRow({ ingredientId: I.scotch, name: 'Scotch whisky' })
    expect(meta(container)).toBe('Unlocks 2')
  })

  it('names one drink of each family in the singular, ties in declared order', () => {
    const m = barWithout(I.espresso)
    FAMILY_TAGS.forEach((tag, i) => m.world.cocktails.push(espressoDrink(100 + i, tag)))
    const { container } = renderRow({ ingredientId: I.espresso, name: 'Espresso' })
    // The Espresso Martini still wants vodka, so it is not among them.
    expect(meta(container)).toBe(
      'Unlocks 5·1 sour · 1 spirit-forward drink · 1 highball · 1 tiki drink · 1 dessert drink',
    )
  })

  it('names two of each in the plural, the family with the most first', () => {
    const m = barWithout(I.espresso)
    FAMILY_TAGS.forEach((tag, i) => {
      m.world.cocktails.push(espressoDrink(100 + i, tag), espressoDrink(200 + i, tag))
    })
    m.world.cocktails.push(espressoDrink(300, T.tiki))
    const { container } = renderRow({ ingredientId: I.espresso, name: 'Espresso' })
    expect(meta(container)).toBe(
      'Unlocks 11·3 tiki drinks · 2 sours · 2 spirit-forward drinks · 2 highballs · 2 dessert drinks',
    )
  })

  it('keeps a staple’s attribution after the families', () => {
    // Lime juice opens the Daiquiri and the Gimlet, both sours.
    barWithout(I.limeJuice)
    const { container } = renderRow({ ingredientId: I.limeJuice, name: 'Lime juice', isStaple: true })
    expect(meta(container)).toBe('Unlocks 2·2 sours · Staple')
    expect(state.reachAsked.every((r) => !r.enabled)).toBe(true)
  })
})

describe('familiesDetail', () => {
  it('says nothing when no unlocked drink has a family', () => {
    expect(familiesDetail([])).toBeUndefined()
  })

  it('names every declared family by its own plural, and one drink by its singular', () => {
    for (const family of FAMILIES) {
      expect(familiesDetail([{ family, count: 2 }])).toBe(`2 ${family.plural}`)
      expect(familiesDetail([{ family, count: 1 }])).toBe(`1 ${singular(family.plural)}`)
    }
  })
})

describe('singular', () => {
  it('reads the plurals a family can carry', () => {
    // The declared families (families.ts) and family names a curated
    // taxonomy may use (frontend-spec §8): the plural is the content, and
    // the singular must follow it.
    expect(
      Object.fromEntries(
        [
          'sours',
          'spirit-forward drinks',
          'highballs',
          'tiki drinks',
          'dessert drinks',
          'fizzes',
          'punches',
          'smashes',
          'fixes',
          'collinses',
          'toddies',
          'daisies',
          'rickeys',
          'juleps',
          'swizzles',
          'sangarees',
          'flips',
        ].map((p) => [p, singular(p)]),
      ),
    ).toEqual({
      sours: 'sour',
      'spirit-forward drinks': 'spirit-forward drink',
      highballs: 'highball',
      'tiki drinks': 'tiki drink',
      'dessert drinks': 'dessert drink',
      fizzes: 'fizz',
      punches: 'punch',
      smashes: 'smash',
      fixes: 'fix',
      collinses: 'collins',
      toddies: 'toddy',
      daisies: 'daisy',
      rickeys: 'rickey',
      juleps: 'julep',
      swizzles: 'swizzle',
      sangarees: 'sangaree',
      flips: 'flip',
    })
  })

  it('leaves a name with no plural ending as it is', () => {
    expect(singular('tiki')).toBe('tiki')
  })
})
