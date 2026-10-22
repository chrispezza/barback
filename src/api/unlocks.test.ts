import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { BarModel, cocktailResource } from '../../test/fixtures/upstream'
import { BAR_ID, C, I, T, defaultWorld } from '../../test/fixtures/world'
import { familyByTag } from '../data/families'
import {
  answeredCounts,
  drinkTagsOptions,
  unlockFamilies,
  unlockedDrinksOptions,
  unlocksByFamily,
  unlocksOptions,
  type ExtraCocktail,
  type TaggedDrink,
} from './unlocks'
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

/**
 * Never the network (ADR-011): every call is answered from the model, once
 * `gate` lets it through (at once, by default).
 */
function serve(gate: () => Promise<void> = async () => {}) {
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
    const id = Number(new URL(url).pathname.match(/^\/api\/ingredients\/(\d+)\/extra$/)?.[1])
    await gate()
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

describe('the counts To buy is ordered on (answeredCounts)', () => {
  const counts = (ids: number[], observers: ReturnType<typeof observe>[]) =>
    answeredCounts(
      ids,
      observers.map((o) => o.getCurrentResult()),
    )

  it('holds each bottle’s count once its read answers, a 0 included, and none before', async () => {
    let open = () => {}
    const gate = new Promise<void>((resolve) => (open = resolve))
    serve(() => gate)
    const ids = [I.campari, I.cointreau]
    const reads = ids.map((id) => observe(BAR_ID, id))
    await vi.waitFor(() => expect(reads.every((r) => r.getCurrentResult().fetchStatus === 'fetching')).toBe(true))
    expect(counts(ids, reads)).toEqual(new Map())

    open()
    await vi.waitFor(() => expect(counts(ids, reads)).toEqual(new Map([[I.campari, 1], [I.cointreau, 0]])))
  })

  it('leaves a count out while it is read again, though the row still states the last one', async () => {
    let gate = Promise.resolve()
    serve(() => gate)
    const ids = [I.campari, I.mint]
    const reads = ids.map((id) => observe(BAR_ID, id))
    await vi.waitFor(() => expect(counts(ids, reads)).toEqual(new Map([[I.campari, 1], [I.mint, 1]])))

    // A check-off elsewhere takes Gin off the shelf's reckoning, and every
    // count is asked for again (useCheckOff invalidates ['ingredient-extra']).
    let open = () => {}
    gate = new Promise<void>((resolve) => (open = resolve))
    m.shelf.delete(I.gin)
    void client.invalidateQueries({ queryKey: ['ingredient-extra'] })
    await vi.waitFor(() => expect(reads.every((r) => r.getCurrentResult().fetchStatus === 'fetching')).toBe(true))
    expect(reads.map((r) => r.getCurrentResult().data)).toEqual([1, 1])
    expect(counts(ids, reads)).toEqual(new Map())

    open()
    await vi.waitFor(() => expect(counts(ids, reads)).toEqual(new Map([[I.campari, 0], [I.mint, 1]])))
  })

  it('leaves out a count that could not be read, and keeps one whose read again failed, as its row does', async () => {
    let fail = false
    const fetch = vi.fn(async (url: string) => {
      if (fail) return new Response(JSON.stringify({ message: 'Server Error' }), { status: 500 })
      const id = Number(new URL(url).pathname.match(/^\/api\/ingredients\/(\d+)\/extra$/)?.[1])
      return new Response(JSON.stringify(extra(id)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetch)
    const campari = observe(BAR_ID, I.campari)
    await vi.waitFor(() => expect(campari.getCurrentResult().isSuccess).toBe(true))

    fail = true
    const scotch = observe(BAR_ID, I.scotch)
    await vi.waitFor(() => expect(scotch.getCurrentResult().isError).toBe(true))
    expect(counts([I.campari, I.scotch], [campari, scotch])).toEqual(new Map([[I.campari, 1]]))

    await client.invalidateQueries({ queryKey: ['ingredient-extra', BAR_ID, I.campari] })
    await vi.waitFor(() => expect(campari.getCurrentResult().isError).toBe(true))
    expect(campari.getCurrentResult().fetchStatus).toBe('idle')
    expect(counts([I.campari, I.scotch], [campari, scotch])).toEqual(new Map([[I.campari, 1]]))
  })
})

/** The index's answer for these drinks with include=tags (CocktailResource.php:106-111). */
function tagged(ids: number[]): TaggedDrink[] {
  return ids.flatMap((id) => {
    const seed = m.cocktail(id)
    return seed ? [cocktailResource(m, seed, 'index', { includeTags: true })] : []
  })
}

const family = (tag: string) => {
  const f = familyByTag(tag)
  if (!f) throw new Error(`families.ts declares no ${tag}`)
  return f
}

describe('the drinks a bottle unlocks, by family (unlocksByFamily)', () => {
  it('counts each family tag, the family with the most first, ties in declared order', () => {
    const ids = [C.daiquiri, C.ginTonic, C.negroni, C.gimlet, C.martini, C.bobbyBurns]
    expect(unlocksByFamily(ids, tagged(ids))).toEqual([
      { family: family('family:sour'), count: 2 },
      { family: family('family:spirit-forward'), count: 2 },
      { family: family('family:highball'), count: 1 },
    ])
  })

  it('puts more drinks ahead of declared order', () => {
    const ids = [C.daiquiri, C.ginTonic, C.mojito]
    expect(unlocksByFamily(ids, tagged(ids))).toEqual([
      { family: family('family:highball'), count: 2 },
      { family: family('family:sour'), count: 1 },
    ])
  })

  it('names no family for a drink whose only tag is no family, or one families.ts does not declare', () => {
    // The Bobby Burns carries no tag; the Daiquiri is a sour and a Classic.
    m.world.tags.push({ id: 120, name: 'family:fizz' })
    const robRoy = m.cocktail(C.robRoy)
    if (robRoy) robRoy.tagIds = [T.classic, 120]
    const ids = [C.daiquiri, C.robRoy, C.bobbyBurns]
    expect(unlocksByFamily(ids, tagged(ids))).toEqual([{ family: family('family:sour'), count: 1 }])
  })

  it('counts a drink carrying two families once, under the first declared', () => {
    const daiquiri = m.cocktail(C.daiquiri)
    if (daiquiri) daiquiri.tagIds = [T.tiki, T.classic, T.sour]
    const ids = [C.daiquiri]
    expect(unlocksByFamily(ids, tagged(ids))).toEqual([{ family: family('family:sour'), count: 1 }])
  })

  it('names no family for a drink the answer leaves out, and counts a drink named twice once', () => {
    expect(unlocksByFamily([C.daiquiri, C.daiquiri, C.gimlet], tagged([C.daiquiri]))).toEqual([
      { family: family('family:sour'), count: 1 },
    ])
  })
})

describe('what a row can say of its drinks’ families (unlockFamilies)', () => {
  it('is unknown until /extra has answered', () => {
    expect(unlockFamilies(undefined, undefined)).toBeUndefined()
    expect(unlockFamilies(undefined, tagged([C.daiquiri]))).toBeUndefined()
  })

  it('names none for a bottle that opens nothing, with no tags to wait for', () => {
    expect(unlockFamilies([], undefined)).toEqual([])
  })

  it('is unknown until the tags of those drinks are read, then groups them', () => {
    const ids = [C.robRoy, C.bobbyBurns]
    expect(unlockFamilies(ids, undefined)).toBeUndefined()
    expect(unlockFamilies(ids, tagged(ids))).toEqual([{ family: family('family:spirit-forward'), count: 1 }])
  })
})

describe('the tags of the drinks a bottle unlocks (drinkTagsOptions)', () => {
  /**
   * GET /cocktails as the index answers it (CocktailController::index): exact
   * filter[id] over a comma list (CocktailQueryFilter.php:28), `tags` only
   * with include=tags, paged at per_page; never the network (ADR-011).
   */
  function serveIndex() {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
      const u = new URL(url)
      if (u.pathname !== '/api/cocktails') throw new Error(`unexpected ${u.pathname}`)
      const ids = new Set((u.searchParams.get('filter[id]') ?? '').split(',').map(Number))
      const includeTags = (u.searchParams.get('include') ?? '').split(',').includes('tags')
      const perPage = Number(u.searchParams.get('per_page') ?? 25)
      const data = m.world.cocktails
        .filter((c) => ids.has(c.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, perPage)
        .map((c) => cocktailResource(m, c, 'index', { includeTags }))
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  function observeTags(barId: number | undefined, ids: number[]) {
    const observer = new QueryObserver(client, drinkTagsOptions(barId, ids))
    unsubscribes.push(observer.subscribe(() => {}))
    return observer
  }

  it('asks the index for exactly those drinks, with their tags, on one page, with the bar header', async () => {
    const fetch = serveIndex()
    const tags = observeTags(BAR_ID, [C.bobbyBurns, C.robRoy, C.bobbyBurns])
    await vi.waitFor(() => expect(tags.getCurrentResult().isSuccess).toBe(true))

    expect(fetch).toHaveBeenCalledTimes(1)
    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/cocktails')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      'filter[id]': `${C.robRoy},${C.bobbyBurns}`,
      include: 'tags',
      per_page: '2',
    })
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'Bar-Assistant-Bar-Id': String(BAR_ID) })
    expect(tags.getCurrentResult().data?.map((d) => [d.id, d.tags?.map((t) => t.name)])).toEqual([
      [C.bobbyBurns, []],
      [C.robRoy, ['family:spirit-forward']],
    ])
  })

  it('is one read for one set of drinks, in whatever order they are named', async () => {
    const fetch = serveIndex()
    const one = observeTags(BAR_ID, [C.daiquiri, C.gimlet])
    const other = observeTags(BAR_ID, [C.gimlet, C.daiquiri])
    await vi.waitFor(() => expect(other.getCurrentResult().isSuccess).toBe(true))
    expect(one.getCurrentResult().isSuccess).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(drinkTagsOptions(BAR_ID, [C.gimlet, C.daiquiri]).queryKey).toEqual([
      'drink-tags',
      BAR_ID,
      `${C.daiquiri},${C.gimlet}`,
    ])
  })

  it('is not asked for no drinks, nor before the bar is known', async () => {
    const fetch = serveIndex()
    const none = observeTags(BAR_ID, [])
    const early = observeTags(undefined, [C.daiquiri])
    await new Promise((resolve) => setTimeout(resolve, 10))
    for (const o of [none, early]) {
      expect(o.getCurrentResult().fetchStatus).toBe('idle')
      expect(o.getCurrentResult().data).toBeUndefined()
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is not asked again when a check-off refreshes every count', async () => {
    const fetch = serveIndex()
    const tags = observeTags(BAR_ID, [C.daiquiri])
    await vi.waitFor(() => expect(tags.getCurrentResult().isSuccess).toBe(true))
    // useCheckOff invalidates ['ingredient-extra'], among the shelf-derived reads.
    await client.invalidateQueries({ queryKey: ['ingredient-extra'] })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('the drinks a bottle unlocks (unlockedDrinksOptions)', () => {
  it('is the count’s own read, under its key, as the ids of the drinks /extra names', async () => {
    const fetch = serve()
    const count = observe(BAR_ID, I.scotch)
    const drinks = new QueryObserver(client, unlockedDrinksOptions(BAR_ID, I.scotch))
    unsubscribes.push(drinks.subscribe(() => {}))
    await vi.waitFor(() => expect(drinks.getCurrentResult().isSuccess).toBe(true))

    expect(unlockedDrinksOptions(BAR_ID, I.scotch).queryKey).toEqual(unlocksOptions(BAR_ID, I.scotch).queryKey)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(count.getCurrentResult().data).toBe(2)
    expect(drinks.getCurrentResult().data).toEqual([C.robRoy, C.bobbyBurns])
  })
})
