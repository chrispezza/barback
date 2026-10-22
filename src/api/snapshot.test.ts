import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { BarModel } from '../../test/fixtures/upstream'
import { BAR_ID, I, USER_ID, defaultWorld } from '../../test/fixtures/world'
import {
  LIST_SNAPSHOT_KEY,
  readListSnapshot,
  shoppingListOptions,
  snapshotOf,
  writeListSnapshot,
  type ListSnapshot,
} from './queries'
import type { ListResponse, ShoppingListItem } from './types'

// The offline list (ADR-007 Decision): "The last successful shopping-list
// response is stamped into localStorage and rendered read-only ('Offline — the
// list as it stood …') when the API is unreachable." These tests pin the stamp:
// what is kept, when it is written, and that it can never cost the live list.
// The list query is driven through TanStack's own QueryObserver — what useQuery
// wraps — because @tanstack/react-query is externalised by Vitest and cannot
// render under Preact here. Tonight's rendering of the snapshot is driven end
// to end in e2e/offline-snapshot.spec.ts.

/**
 * GET /users/{id}/shopping-list as Bar Assistant v5.15.3 answers it:
 * UserShoppingListResource rows (ingredient id, slug, name; quantity), sorted
 * by ingredient name with PHP's string comparison, byte-wise for these names
 * (ShoppingListController.php:38), not paginated.
 */
function listResponse(m: BarModel, ids: number[]): ListResponse<ShoppingListItem> {
  const data = ids
    .map((id) => ({ ingredient: m.basic(id), quantity: 1 }))
    .sort((a, b) => (a.ingredient.name < b.ingredient.name ? -1 : 1))
  return { data }
}

const SERVED = new Date('2026-10-07T21:40:00.000Z')
const LATER = new Date('2026-10-21T09:15:00.000Z')

let m: BarModel

beforeEach(() => {
  m = new BarModel(defaultWorld())
  localStorage.clear()
})

describe('snapshotOf', () => {
  it('keeps the names, sorted, whatever order the rows arrive in', () => {
    const items = [I.tonic, I.campari, I.limeJuice, I.cointreau].map((id) => ({
      ingredient: m.basic(id),
      quantity: 1,
    }))
    expect(snapshotOf(items, SERVED).names).toEqual(['Campari', 'Cointreau', 'Lime juice', 'Tonic'])
    // The rows themselves are left in the order they came.
    expect(items.map((i) => i.ingredient.name)).toEqual(['Tonic', 'Campari', 'Lime juice', 'Cointreau'])
  })

  it('stamps the time it is given as an ISO 8601 instant', () => {
    const snapshot = snapshotOf(listResponse(m, [I.campari]).data, SERVED)
    expect(snapshot.at).toBe('2026-10-07T21:40:00.000Z')
    expect(new Date(snapshot.at).getTime()).toBe(SERVED.getTime())
  })

  it('stamps an empty list too: nothing to buy is what the list said', () => {
    expect(snapshotOf([], SERVED)).toEqual({ at: '2026-10-07T21:40:00.000Z', names: [] })
  })
})

describe('writeListSnapshot and readListSnapshot', () => {
  it('round-trips the names and the stamp', () => {
    const items = listResponse(m, [I.tonic, I.campari, I.cointreau]).data
    writeListSnapshot(items, SERVED)
    expect(readListSnapshot()).toEqual({
      at: '2026-10-07T21:40:00.000Z',
      names: ['Campari', 'Cointreau', 'Tonic'],
    })
  })

  it('replaces the last snapshot with the newer one, even an emptier list', () => {
    writeListSnapshot(listResponse(m, [I.tonic, I.campari]).data, SERVED)
    writeListSnapshot(listResponse(m, [I.campari]).data, LATER)
    expect(readListSnapshot()).toEqual({ at: '2026-10-21T09:15:00.000Z', names: ['Campari'] })
    writeListSnapshot([], LATER)
    expect(readListSnapshot()).toEqual({ at: '2026-10-21T09:15:00.000Z', names: [] })
  })

  it('reads null when nothing has been stamped', () => {
    expect(readListSnapshot()).toBeNull()
  })

  it('reads null when the stored value is not JSON', () => {
    localStorage.setItem(LIST_SNAPSHOT_KEY, '{"at":"2026-10-07T21:40:00.000Z","names":["Camp')
    expect(readListSnapshot()).toBeNull()
  })

  it('reads null when storage cannot be read', () => {
    writeListSnapshot(listResponse(m, [I.campari]).data, SERVED)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    })
    expect(readListSnapshot()).toBeNull()
  })

  it('never throws when storage refuses the write, and keeps the last snapshot', () => {
    writeListSnapshot(listResponse(m, [I.campari]).data, SERVED)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })
    expect(() => writeListSnapshot(listResponse(m, [I.tonic]).data, LATER)).not.toThrow()
    expect(readListSnapshot()).toEqual({ at: '2026-10-07T21:40:00.000Z', names: ['Campari'] })
  })
})

describe('the list query', () => {
  /** When the stub last answered with a list (epoch ms). */
  let servedAt = 0

  /** Answer GET /users/{id}/shopping-list from the model, or drop the connection. */
  function serveList(answer: () => ListResponse<ShoppingListItem> | 'down') {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => {
      const body = answer()
      if (body === 'down') throw new TypeError('Failed to fetch')
      servedAt = Date.now()
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  /** Run the list query once, as Tonight's useShoppingList would, and settle. */
  async function runListQuery(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
    const observer = new QueryObserver(client, shoppingListOptions(BAR_ID, USER_ID))
    const unsubscribe = observer.subscribe(() => {})
    await vi.waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(false))
    const result = observer.getCurrentResult()
    unsubscribe()
    return { client, result }
  }

  it('stamps each response it is served, at the time it is served', async () => {
    m.list.set(I.tonic, 1).set(I.campari, 1)
    const fetch = serveList(() => listResponse(m, [...m.list.keys()]))

    const { result } = await runListQuery()
    const settledAt = Date.now()

    expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toBe(`/api/users/${USER_ID}/shopping-list`)
    expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'Bar-Assistant-Bar-Id': String(BAR_ID) })
    expect(result.isError).toBe(false)
    const snapshot = readListSnapshot()
    expect(snapshot?.names).toEqual(['Campari', 'Tonic'])
    const at = Date.parse(snapshot?.at ?? '')
    expect(snapshot?.at).toBe(new Date(at).toISOString())
    expect(at).toBeGreaterThanOrEqual(servedAt)
    expect(at).toBeLessThanOrEqual(settledAt)
  })

  it('stamps an emptied list over the fuller one before it', async () => {
    m.list.set(I.tonic, 1).set(I.campari, 1)
    serveList(() => listResponse(m, [...m.list.keys()]))
    const { client } = await runListQuery()
    const first = readListSnapshot()
    expect(first?.names).toEqual(['Campari', 'Tonic'])

    // Both bottles bought and checked off at home: the API now serves an empty
    // list, and the aisle must not show them again. The pause keeps the two
    // stamps out of the same millisecond.
    m.list.clear()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await client.invalidateQueries({ queryKey: ['shopping-list'] })
    const { result } = await runListQuery(client)
    const settledAt = Date.now()

    expect(result.isError).toBe(false)
    expect(result.data?.data).toEqual([])
    const snapshot = readListSnapshot()
    expect(snapshot).toEqual({ at: expect.any(String), names: [] })
    const at = Date.parse(snapshot?.at ?? '')
    expect(snapshot?.at).toBe(new Date(at).toISOString())
    expect(at).toBeGreaterThan(Date.parse(first?.at ?? ''))
    expect(at).toBeGreaterThanOrEqual(servedAt)
    expect(at).toBeLessThanOrEqual(settledAt)
  })

  it('serves the live list when storage refuses the snapshot', async () => {
    m.list.set(I.tonic, 1).set(I.campari, 1)
    serveList(() => listResponse(m, [...m.list.keys()]))
    writeListSnapshot(listResponse(m, [I.cointreau]).data, SERVED)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })

    const { result } = await runListQuery()

    expect(result.isError).toBe(false)
    expect(result.data?.data.map((i) => i.ingredient.name)).toEqual(['Campari', 'Tonic'])
    expect(readListSnapshot()).toEqual({ at: '2026-10-07T21:40:00.000Z', names: ['Cointreau'] })
  })

  it('leaves the last stamped list in place when the API cannot be reached', async () => {
    let down = false
    m.list.set(I.tonic, 1).set(I.campari, 1)
    const fetch = serveList(() => (down ? 'down' : listResponse(m, [...m.list.keys()])))
    const { client } = await runListQuery()
    const stamped: ListSnapshot | null = readListSnapshot()
    expect(stamped?.names).toEqual(['Campari', 'Tonic'])

    // The store aisle: the list changed at home, but the API is out of reach.
    m.list.delete(I.tonic)
    down = true
    await client.invalidateQueries({ queryKey: ['shopping-list'] })
    const { result } = await runListQuery(client)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result.isError).toBe(true)
    expect(readListSnapshot()).toEqual(stamped)
  })
})
