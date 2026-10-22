import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { BarModel } from '../../test/fixtures/upstream'
import { C, I, defaultWorld, type CocktailSeed } from '../../test/fixtures/world'
import { ShoppingRow } from './ShoppingRow'

// The list row's detail line (frontend-spec §9, "Hierarchy-aware brands"): a
// bottle that unlocks nothing says what it builds toward.
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

beforeEach(() => {
  state.reachAsked = []
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
    // Campari completes the Negroni against the default shelf.
    barWithout(I.campari)
    const { container } = renderRow({ ingredientId: I.campari, name: 'Campari' })
    expect(meta(container)).toBe('Unlocks 1')
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
