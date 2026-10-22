import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { BarModel } from '../../test/fixtures/upstream'
import { C, I, T, defaultWorld, type CocktailSeed } from '../../test/fixtures/world'
import { FAMILIES } from '../data/families'
import { ShoppingRow, familiesDetail } from './ShoppingRow'

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
  /**
   * Whether the count's last read failed. TanStack Query keeps the answer
   * before it beside the error, so the count is still in hand.
   */
  unlocksFailed: false,
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
      if (!m) return { data: undefined, isError: false }
      const before = m.canMake()
      const after = m.canMakeWith(new Set([...m.shelf, id]))
      return { data: [...after].filter((c) => !before.has(c)).length, isError: state.unlocksFailed }
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
  state.unlocksFailed = false
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
    expect(meta(container)).toBe('Unlocks 1· \u200A1\u00A0spirit-forward\u00A0drink')
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

// ADR-007 Consequences: "No stock answer is ever served stale." What a bottle
// unlocks is worked out against the user's shelf (IngredientController::extra,
// IngredientController.php 199-226 at v5.15.3), so a count whose read again
// failed is not known: the row says what it says before its first answer.
describe('ShoppingRow once its count could not be read again', () => {
  it('states no count, names no family and asks for no reach, with the last count in hand', () => {
    // Campari opened the Negroni when the count was last read.
    barWithout(I.campari)
    state.unlocksFailed = true
    const { container } = renderRow({ ingredientId: I.campari, name: 'Campari' })
    expect(screen.getByText('Campari')).toBeTruthy()
    expect(screen.queryByText(/Unlocks/)).toBeNull()
    expect(meta(container)).toBeNull()
    expect(state.reachAsked.every((r) => !r.enabled)).toBe(true)
  })

  it('does not say what a bottle builds toward from a count of 0 it could not read again', () => {
    barWithout(I.coffeeLiqueur)
    state.unlocksFailed = true
    const { container } = renderRow({ ingredientId: I.coffeeLiqueur, name: 'Coffee liqueur' })
    expect(meta(container)).toBeNull()
    expect(state.reachAsked.every((r) => !r.enabled)).toBe(true)
  })

  it('keeps a staple’s attribution alone', () => {
    // Lime juice opened the Daiquiri and the Gimlet when the count was last read.
    barWithout(I.limeJuice)
    state.unlocksFailed = true
    const { container } = renderRow({ ingredientId: I.limeJuice, name: 'Lime juice', isStaple: true })
    expect(meta(container)).toBe('Staple')
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
    expect(meta(container)).toBe('Unlocks 2· \u200A1\u00A0spirit-forward\u00A0drink')
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
      'Unlocks 5· \u200A1\u00A0sour\u00A0· 1\u00A0spirit-forward\u00A0drink\u00A0· 1\u00A0highball\u00A0· ' +
        '1\u00A0tiki\u00A0drink\u00A0· 1\u00A0dessert\u00A0drink',
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
      'Unlocks 11· \u200A3\u00A0tiki\u00A0drinks\u00A0· 2\u00A0sours\u00A0· 2\u00A0spirit-forward\u00A0drinks\u00A0· ' +
        '2\u00A0highballs\u00A0· 2\u00A0dessert\u00A0drinks',
    )
  })

  it('opens the detail with a hair space only beside a count, so assistive tech hears the two apart', () => {
    // The DS separator between them is aria-hidden and has no space either side.
    barWithout(I.scotch)
    const { container, unmount } = renderRow({ ingredientId: I.scotch, name: 'Scotch whisky' })
    const detail = container.querySelector('.bb-shop__meta > span:last-child')?.textContent
    expect(detail).toBe('\u200A1\u00A0spirit-forward\u00A0drink')
    unmount()

    // No count, no separator: the reach line and a lone staple stand as they are.
    barWithout(I.coffeeLiqueur)
    expect(meta(renderRow({ ingredientId: I.coffeeLiqueur, name: 'Coffee liqueur' }).container)).toBe('In 1 drink')
    cleanup()
    barWithout(I.clubSoda)
    expect(meta(renderRow({ ingredientId: I.clubSoda, name: 'Club soda', isStaple: true }).container)).toBe('Staple')
  })

  it('keeps a staple’s attribution after the families', () => {
    // Lime juice opens the Daiquiri and the Gimlet, both sours.
    barWithout(I.limeJuice)
    const { container } = renderRow({ ingredientId: I.limeJuice, name: 'Lime juice', isStaple: true })
    expect(meta(container)).toBe('Unlocks 2· \u200A2\u00A0sours\u00A0· Staple')
    expect(state.reachAsked.every((r) => !r.enabled)).toBe(true)
  })
})

describe('familiesDetail', () => {
  it('says nothing when no unlocked drink has a family', () => {
    expect(familiesDetail([])).toBeUndefined()
  })

  it('names every declared family by its own plural', () => {
    for (const family of FAMILIES) {
      expect(familiesDetail([{ family, count: 2 }])).toBe(`2\u00A0${family.plural.split(' ').join('\u00A0')}`)
    }
  })

  // A wrapped line breaks only where it may: never inside a family's phrase,
  // never before a "·" (e2e/b-unlocks-family.spec.ts lays one out).
  it('holds each phrase together: its count to its family, the family’s words to each other', () => {
    for (const family of FAMILIES) {
      for (const count of [1, 2, 12, 100]) {
        const phrase = familiesDetail([{ family, count }]) ?? ''
        expect(phrase.startsWith(`${count}\u00A0`), phrase).toBe(true)
        // No breakable space at all: the only spaces in it are no-break ones.
        expect(phrase.replace(/\u00A0/g, ''), phrase).not.toMatch(/\s/)
      }
    }
  })

  it('holds each "·" to the phrase before it, the space after it the only one a line may break at', () => {
    const every = FAMILIES.map((family) => ({ family, count: 2 }))
    const detail = familiesDetail(every) ?? ''
    expect(detail.split('\u00A0· ')).toEqual(every.map((f) => familiesDetail([f])))
    const breakable = [...detail.matchAll(/[^\S\u00A0]/g)].map((m) => detail.slice(m.index - 2, m.index + 1))
    expect(breakable).toEqual(every.slice(1).map(() => '\u00A0· '))
  })
})
