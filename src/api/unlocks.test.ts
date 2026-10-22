import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { BarModel, cocktailResource, sqliteBinaryCompare } from '../../test/fixtures/upstream'
import { BAR_ID, C, I, T, defaultWorld } from '../../test/fixtures/world'
import { familyByTag } from '../data/families'
import {
  answeredCounts,
  drinkTagsOptions,
  familyDrinksOf,
  familyPageOptions,
  indexPageOptions,
  laterPages,
  unlockFamilies,
  unlockedDrinksOptions,
  unlocksByFamily,
  unlocksOptions,
  unlessFailed,
  type ExtraCocktail,
  type FamilyPageRead,
  type TaggedDrink,
} from './unlocks'
import type { CocktailFilters } from './queries'
import type { Cocktail, ListResponse } from './types'

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

  // ADR-007 Consequences: "No stock answer is ever served stale." A count
  // whose read again failed was worked out against the shelf as it stood
  // then; the row states none (ShoppingRow), and the order holds none.
  it('leaves out a count that could not be read, and one whose read again failed, as its row states none', async () => {
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
    // TanStack Query keeps the last answer beside the error; it is not a count.
    expect(campari.getCurrentResult().data).toBe(1)
    expect(counts([I.campari, I.scotch], [campari, scotch])).toEqual(new Map())
  })
})

describe('what a read answers (unlessFailed)', () => {
  it('is its data while it has not failed, a 0 included', () => {
    expect(unlessFailed({ data: 3, isError: false })).toBe(3)
    expect(unlessFailed({ data: 0, isError: false })).toBe(0)
    expect(unlessFailed({ data: undefined, isError: false })).toBeUndefined()
  })

  it('is nothing once it has failed, the last answer in hand included', () => {
    expect(unlessFailed({ data: 3, isError: true })).toBeUndefined()
    expect(unlessFailed({ data: [C.negroni], isError: true })).toBeUndefined()
    expect(unlessFailed({ data: undefined, isError: true })).toBeUndefined()
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
        .sort((a, b) => sqliteBinaryCompare(a.name, b.name))
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

  /** The cache's entry for the tags of these drinks, as drinkTagsOptions keys it. */
  const tagsQuery = (barId: number | undefined, ids: number[]) =>
    client.getQueryCache().find({ queryKey: drinkTagsOptions(barId, ids).queryKey, exact: true })

  it('is not asked for no drinks, nor before the bar is known', async () => {
    const fetch = serveIndex()
    const none = observeTags(BAR_ID, [])
    const early = observeTags(undefined, [C.daiquiri])
    // A subscribing observer that may fetch starts at once, so neither entry
    // being idle now is no accident of timing.
    expect(tagsQuery(BAR_ID, [])?.state.fetchStatus).toBe('idle')
    expect(tagsQuery(undefined, [C.daiquiri])?.state.fetchStatus).toBe('idle')
    // refetchQueries asks again every entry not disabled and resolves once
    // they answer: neither is asked.
    await client.refetchQueries({ queryKey: ['drink-tags'] })
    expect(fetch).not.toHaveBeenCalled()
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
    const answered = tagsQuery(BAR_ID, [C.daiquiri])?.state.dataUpdatedAt
    // useCheckOff invalidates ['ingredient-extra'], among the shelf-derived reads.
    await client.invalidateQueries({ queryKey: ['ingredient-extra'] })
    // invalidateQueries resolves once every read it asks again has answered,
    // so these need no wait: the tags read was neither marked stale nor asked
    // again, and holds the answer it had.
    const after = tagsQuery(BAR_ID, [C.daiquiri])?.state
    expect(after?.isInvalidated).toBe(false)
    expect(after?.fetchStatus).toBe('idle')
    expect(after?.dataUpdatedAt).toBe(answered)
    expect(fetch).toHaveBeenCalledTimes(1)
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

describe('the Index list page (indexPageOptions)', () => {
  /**
   * GET /cocktails as the index answers it (CocktailController::index, a
   * LengthAwarePaginator): filter[tag_id] and filter[favorites], by name,
   * one page of per_page; never the network (ADR-011). Each answer waits on
   * `gate` (open by default).
   */
  let gate: Promise<void> = Promise.resolve()
  function serveIndex() {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
      const u = new URL(url)
      if (u.pathname !== '/api/cocktails') throw new Error(`unexpected ${u.pathname}`)
      await gate
      const tagId = u.searchParams.get('filter[tag_id]')
      const perPage = Number(u.searchParams.get('per_page') ?? 25)
      const page = Number(u.searchParams.get('page') ?? 1)
      const items = m.world.cocktails
        .filter((c) => tagId === null || (c.tagIds ?? []).includes(Number(tagId)))
        .filter((c) => u.searchParams.get('filter[favorites]') !== 'true' || m.favorites.has(c.id))
        .sort((a, b) => sqliteBinaryCompare(a.name, b.name))
      const body = {
        data: items.slice((page - 1) * perPage, page * perPage).map((c) => cocktailResource(m, c, 'index')),
        meta: { total: items.length, current_page: page, last_page: Math.max(1, Math.ceil(items.length / perPage)) },
      }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  /** Hold every answer from now until the returned function is called. */
  function hold(): () => void {
    let open = () => {}
    gate = new Promise<void>((resolve) => (open = resolve))
    return open
  }

  beforeEach(() => {
    gate = Promise.resolve()
  })

  /** Observe the list as Drinks does, two drinks to a page, and move it as the URL moves. */
  function observeIndex(filters: CocktailFilters, page: number, enabled = true) {
    const observer = new QueryObserver(client, indexPageOptions(BAR_ID, filters, 2, page, enabled))
    unsubscribes.push(observer.subscribe(() => {}))
    return {
      observer,
      moveTo: (next: CocktailFilters, nextPage: number) =>
        observer.setOptions(indexPageOptions(BAR_ID, next, 2, nextPage, true)),
      names: () => observer.getCurrentResult().data?.data.map((c) => c.name),
    }
  }

  const SOUR = { tag_id: T.sour }

  it('is read under the key useCocktails reads a page by, sent with its filters and page as useCocktails sends them', async () => {
    const fetch = serveIndex()
    // useCocktails (queries.ts) keys a page ['cocktails', barId, filters, perPage, page];
    // a shelf toggle, a check-off or a favourite invalidates ['cocktails'].
    expect(indexPageOptions(BAR_ID, SOUR, 50, 2, true).queryKey).toEqual(['cocktails', BAR_ID, SOUR, 50, 2])
    const { observer } = observeIndex({ ...SOUR, favorites: true }, 2)
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true))
    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/cocktails')
    expect([...url.searchParams]).toEqual([
      ['per_page', '2'],
      ['filter[tag_id]', String(T.sour)],
      ['filter[favorites]', 'true'],
      ['page', '2'],
    ])
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'Bar-Assistant-Bar-Id': String(BAR_ID) })
  })

  it('keeps the page in hand, with its total, while the next page of the same list is read', async () => {
    serveIndex()
    const sours = observeIndex(SOUR, 1)
    await vi.waitFor(() => expect(sours.names()).toEqual(['Daiquiri', 'Gimlet']))

    const open = hold()
    sours.moveTo(SOUR, 2)
    await vi.waitFor(() => expect(sours.observer.getCurrentResult().fetchStatus).toBe('fetching'))
    expect(sours.observer.getCurrentResult().isPlaceholderData).toBe(true)
    expect(sours.names()).toEqual(['Daiquiri', 'Gimlet'])
    expect(sours.observer.getCurrentResult().data?.meta?.total).toBe(5)

    open()
    await vi.waitFor(() => expect(sours.names()).toEqual(['Margarita', 'Penicillin']))
    expect(sours.observer.getCurrentResult().isPlaceholderData).toBe(false)
  })

  it('holds nothing across a change of family until the new family’s list lands', async () => {
    serveIndex()
    const index = observeIndex(SOUR, 2)
    await vi.waitFor(() => expect(index.names()).toEqual(['Margarita', 'Penicillin']))

    const open = hold()
    index.moveTo({ tag_id: T.highball }, 1)
    await vi.waitFor(() => expect(index.observer.getCurrentResult().fetchStatus).toBe('fetching'))
    expect(index.observer.getCurrentResult().isPending).toBe(true)
    expect(index.observer.getCurrentResult().isPlaceholderData).toBe(false)
    expect(index.observer.getCurrentResult().data).toBeUndefined()

    open()
    await vi.waitFor(() => expect(index.names()).toEqual(["Dark 'n' Stormy", 'Gin Tonic']))
    expect(index.observer.getCurrentResult().data?.meta?.total).toBe(3)
  })

  it('holds nothing when the favourites filter turns on, or off, until that list lands', async () => {
    serveIndex()
    m.favorites.add(C.daiquiri)
    const index = observeIndex(SOUR, 1)
    await vi.waitFor(() => expect(index.names()).toEqual(['Daiquiri', 'Gimlet']))

    let open = hold()
    index.moveTo({ ...SOUR, favorites: true }, 1)
    await vi.waitFor(() => expect(index.observer.getCurrentResult().fetchStatus).toBe('fetching'))
    expect(index.observer.getCurrentResult().data).toBeUndefined()
    open()
    await vi.waitFor(() => expect(index.observer.getCurrentResult().data?.meta?.total).toBe(1))

    // Off again, to a family list no longer in the cache.
    client.removeQueries({ queryKey: ['cocktails', BAR_ID, SOUR, 2, 1], exact: true })
    open = hold()
    index.moveTo(SOUR, 1)
    await vi.waitFor(() => expect(index.observer.getCurrentResult().fetchStatus).toBe('fetching'))
    expect(index.observer.getCurrentResult().data).toBeUndefined()
    open()
    await vi.waitFor(() => expect(index.observer.getCurrentResult().data?.meta?.total).toBe(5))
  })

  it('is not asked for while not enabled, as while the family’s tag is not yet known', async () => {
    const fetch = serveIndex()
    const { observer } = observeIndex(SOUR, 1, false)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(observer.getCurrentResult().fetchStatus).toBe('idle')
    expect(observer.getCurrentResult().data).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('a family’s drinks, for the gap its empty state names', () => {
  // useFamilyDrinks (chrispezza/barback#74; frontend-spec §6 Journey 2) reads
  // the family's drinks a page at a time as the Index lists them, and joins the
  // pages once all have answered. The hook is two useQuery calls; what it
  // returns is familyDrinksOf over their results, pinned here.

  it('is the Index’s own first page under the family: one read when both show', () => {
    expect(familyPageOptions(BAR_ID, T.sour, 1, true).queryKey).toEqual(
      indexPageOptions(BAR_ID, { tag_id: T.sour }, 50, 1, true).queryKey,
    )
    expect(familyPageOptions(BAR_ID, T.sour, 3, true).queryKey).toEqual(['cocktails', BAR_ID, { tag_id: T.sour }, 50, 3])
  })

  it('is asked for filtered by the family’s tag alone (ADR-002 filter parity), with the bar header', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => {
      const items = m.world.cocktails.filter((c) => c.tagIds?.includes(T.sour))
      return new Response(
        JSON.stringify({
          data: items.map((c) => cocktailResource(m, c, 'index')),
          meta: { total: items.length, current_page: 1, last_page: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetch)
    const observer = new QueryObserver(client, familyPageOptions(BAR_ID, T.sour, 1, true))
    unsubscribes.push(observer.subscribe(() => {}))
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true))
    const url = new URL(String(fetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/cocktails')
    expect([...url.searchParams]).toEqual([
      ['per_page', '50'],
      ['filter[tag_id]', String(T.sour)],
      ['page', '1'],
    ])
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'Bar-Assistant-Bar-Id': String(BAR_ID) })
  })

  it('is not read again when the Index’s list has just read the same page', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => {
      const items = m.world.cocktails.filter((c) => c.tagIds?.includes(T.dessert))
      return new Response(
        JSON.stringify({
          data: items.map((c) => cocktailResource(m, c, 'index')),
          meta: { total: items.length, current_page: 1, last_page: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetch)
    // The list mounts first (Drinks.tsx useIndexPage, 50 a page) and answers;
    // the family's read follows once the counts say nothing pours.
    const list = new QueryObserver(client, indexPageOptions(BAR_ID, { tag_id: T.dessert }, 50, 1, true))
    unsubscribes.push(list.subscribe(() => {}))
    await vi.waitFor(() => expect(list.getCurrentResult().isSuccess).toBe(true))
    const family = new QueryObserver(client, familyPageOptions(BAR_ID, T.dessert, 1, true))
    unsubscribes.push(family.subscribe(() => {}))
    expect(family.getCurrentResult().data?.data.map((c) => c.id)).toEqual([C.espressoMartini])
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetch).toHaveBeenCalledTimes(1)

    // A shelf write invalidates every cocktail read: the page is read again.
    await client.invalidateQueries({ queryKey: ['cocktails'] })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('is not asked for while not enabled', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const observer = new QueryObserver(client, familyPageOptions(BAR_ID, T.sour, 1, false))
    unsubscribes.push(observer.subscribe(() => {}))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(observer.getCurrentResult().fetchStatus).toBe('idle')
    expect(fetch).not.toHaveBeenCalled()
  })

  /** A page's read as the hook holds it: answered with these drinks, of `lastPage` pages. */
  function page(drinks: number[], lastPage: number, read: Partial<FamilyPageRead> = {}): FamilyPageRead {
    const data: ListResponse<Cocktail> = {
      data: drinks.map((id) => cocktailResource(m, m.cocktail(id)!, 'index')),
      meta: { total: drinks.length, current_page: 1, last_page: lastPage },
    }
    return { data, isError: false, isPlaceholderData: false, ...read }
  }
  const unread: FamilyPageRead = { data: undefined, isError: false, isPlaceholderData: false }
  const ids = (drinks: ReturnType<typeof familyDrinksOf>) => (typeof drinks === 'string' ? drinks : drinks.map((d) => d.id))

  it('asks for every page the first says there are, and none before it answers', () => {
    expect(laterPages(unread)).toEqual([])
    expect(laterPages(page([C.daiquiri], 1))).toEqual([])
    expect(laterPages(page([C.daiquiri], 3))).toEqual([2, 3])
    expect(laterPages(page([C.daiquiri], 3, { isPlaceholderData: true }))).toEqual([])
    expect(laterPages(page([C.daiquiri], 3, { isError: true }))).toEqual([])
  })

  it('is every page’s drinks, first page first, once all have answered', () => {
    const first = page([C.daiquiri, C.gimlet], 2)
    expect(ids(familyDrinksOf([]))).toBe('pending')
    expect(ids(familyDrinksOf([unread]))).toBe('pending')
    expect(ids(familyDrinksOf([first]))).toBe('pending')
    expect(ids(familyDrinksOf([first, unread]))).toBe('pending')
    expect(ids(familyDrinksOf([first, page([C.margarita], 2)]))).toEqual([C.daiquiri, C.gimlet, C.margarita])
    // A family that holds none answers with no drinks: a fact, not a wait.
    expect(ids(familyDrinksOf([page([], 1)]))).toEqual([])
  })

  it('is no answer from another question’s page held as a placeholder', () => {
    expect(ids(familyDrinksOf([page([C.ginTonic], 1, { isPlaceholderData: true })]))).toBe('pending')
  })

  it('fails whole when any page failed, with an older answer in hand or none', () => {
    expect(ids(familyDrinksOf([page([C.daiquiri], 1, { isError: true })]))).toBe('failed')
    expect(ids(familyDrinksOf([{ ...unread, isError: true }]))).toBe('failed')
    expect(ids(familyDrinksOf([page([C.daiquiri], 2), { ...unread, isError: true }]))).toBe('failed')
  })
})
