import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { BarModel } from '../../test/fixtures/upstream'
import { BAR_ID, I, defaultWorld } from '../../test/fixtures/world'
import { unlocksOptions, type ExtraCocktail } from './unlocks'
import type { ListResponse } from './types'

// The read To buy is ranked on (frontend-spec §6 Journey 3; §2 Tonight,
// "unlocks 4" per item). It is driven through TanStack's own QueryObserver —
// what useQueries wraps — because @tanstack/react-query is externalised by
// Vitest and cannot render under Preact here (see
// components/ShoppingRow.test.tsx). The screen is driven end to end in
// e2e/b-list-ranked.spec.ts.

let m: BarModel

/** IngredientController::extra (IngredientController.php:199-226 at v5.15.3):
 *  the drinks this bottle would add to what the user's shelf pours. */
function extra(id: number): ListResponse<ExtraCocktail> {
  const before = m.canMake()
  const added = [...m.canMakeWith(new Set([...m.shelf, id]))].filter((c) => !before.has(c))
  return {
    data: added.map((c) => {
      const seed = m.cocktail(c)
      return { id: c, slug: seed ? m.slugOfCocktail(seed) : '', name: seed?.name ?? '' }
    }),
  }
}

/** Never the network (ADR-011): every call is answered from the model. */
function serve() {
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
    const id = Number(new URL(url).pathname.match(/^\/api\/ingredients\/(\d+)\/extra$/)?.[1])
    return new Response(JSON.stringify(extra(id)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

let client: QueryClient
const unsubscribes: (() => void)[] = []

/** Observe one bottle's count as a To buy row and the list's order both do. */
function observe(barId: number | undefined, id: number) {
  const observer = new QueryObserver(client, unlocksOptions(barId, id))
  unsubscribes.push(observer.subscribe(() => {}))
  return observer
}

beforeEach(() => {
  m = new BarModel(defaultWorld())
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  for (const unsubscribe of unsubscribes.splice(0)) unsubscribe()
  client.clear()
})

describe('a bottle’s unlock count', () => {
  it('is read from its /extra, with the bar header, as the number of drinks it names', async () => {
    const fetch = serve()
    // Scotch whisky opens the Rob Roy and the Bobby Burns against the default shelf.
    const scotch = observe(BAR_ID, I.scotch)
    await vi.waitFor(() => expect(scotch.getCurrentResult().isSuccess).toBe(true))

    expect(scotch.getCurrentResult().data).toBe(2)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toBe(`/api/ingredients/${I.scotch}/extra`)
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'Bar-Assistant-Bar-Id': String(BAR_ID) })
  })

  it('counts a bottle that opens nothing as 0, not as unknown', async () => {
    serve()
    const cointreau = observe(BAR_ID, I.cointreau)
    await vi.waitFor(() => expect(cointreau.getCurrentResult().isSuccess).toBe(true))
    expect(cointreau.getCurrentResult().data).toBe(0)
  })

  it('is one read under the key a To buy row reads it by, which a check-off refreshes', async () => {
    const fetch = serve()
    // useIngredientUnlocks (queries.ts) reads ['ingredient-extra', barId, id];
    // useCheckOff invalidates ['ingredient-extra'].
    expect(unlocksOptions(BAR_ID, I.campari).queryKey).toEqual(['ingredient-extra', BAR_ID, I.campari])
    const row = observe(BAR_ID, I.campari)
    const order = observe(BAR_ID, I.campari)
    await vi.waitFor(() => expect(order.getCurrentResult().isSuccess).toBe(true))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect([row.getCurrentResult().data, order.getCurrentResult().data]).toEqual([1, 1])

    // Gin off the shelf: the Negroni no longer opens on Campari alone.
    m.shelf.delete(I.gin)
    await client.invalidateQueries({ queryKey: ['ingredient-extra'] })
    await vi.waitFor(() => expect(order.getCurrentResult().data).toBe(0))
    expect(row.getCurrentResult().data).toBe(0)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('is not asked for before the bar is known', async () => {
    const fetch = serve()
    const early = observe(undefined, I.scotch)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(early.getCurrentResult().fetchStatus).toBe('idle')
    expect(early.getCurrentResult().data).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })
})
