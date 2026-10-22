import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { BarModel, shoppingListResource } from '../../test/fixtures/upstream'
import { BAR_ID, I, USER_ID, defaultWorld } from '../../test/fixtures/world'
import {
  LIST_SNAPSHOT_KEY,
  readListSnapshot,
  shoppingListOptions,
  snapshotOf,
  snapshotStamp,
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
 * GET /users/{id}/shopping-list as Bar Assistant v5.15.3 answers it with these
 * ids listed once each: the fixture's own model of
 * ShoppingListController::index (shoppingListResource, the rows the e2e fake
 * serves), not paginated. A model of its own holds the ids, so `m` is left as
 * it is.
 */
function listResponse(m: BarModel, ids: number[]): ListResponse<ShoppingListItem> {
  return { data: shoppingListResource(new BarModel({ ...m.world, list: ids })) }
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

describe('snapshotStamp', () => {
  // What Tonight prints after "Offline — the list as it stood". ADR-007 asks
  // for a list "clearly stamped", because trust in stock data is the driver: a
  // weekday alone reads as this week, so once the weekday could have come
  // round again the stamp names its date. Days are counted on the reader's
  // calendar: six days back no weekday has repeated yet, seven days back
  // today's has.
  //
  // Times are built with the local-time Date constructor and the locale is
  // passed in, so neither the machine's time zone nor its locale moves an
  // expectation. Whitespace is flattened because ICU puts U+202F before
  // AM/PM in some versions and an ordinary space in others.
  const flat = (s: string) => s.replace(/\s/gu, ' ')
  const stamp = (at: Date, now: Date, locale = 'en-US') => flat(snapshotStamp(at, now, locale))

  /** Wednesday 21 October 2026, 7:53 PM: the reader is in the aisle. */
  const NOW = new Date(2026, 9, 21, 19, 53)

  it('names the weekday and time for a list stamped earlier today', () => {
    expect(stamp(new Date(2026, 9, 21, 9, 15), NOW)).toBe('Wednesday 9:15 AM')
  })

  it('names the weekday and time up to six days back, before any weekday comes round again', () => {
    expect(stamp(new Date(2026, 9, 19, 9, 5), NOW)).toBe('Monday 9:05 AM')
    expect(stamp(new Date(2026, 9, 15, 21, 40), NOW)).toBe('Thursday 9:40 PM')
    // Six calendar days back, though nearly seven days have passed.
    expect(stamp(new Date(2026, 9, 15, 0, 10), new Date(2026, 9, 21, 23, 50))).toBe('Thursday 12:10 AM')
  })

  it('names the date for a list stamped two weeks ago', () => {
    // The defect: this read "Wednesday 5:40 PM", the same as a list stamped
    // today at 5:40 PM.
    expect(stamp(new Date(2026, 9, 7, 17, 40), NOW)).toBe('Wednesday 7 October, 5:40 PM')
  })

  it('names the date seven calendar days back, where the weekday alone would read as today', () => {
    // Less than seven days have passed, but "Wednesday" is today's name.
    expect(stamp(new Date(2026, 9, 14, 21, 40), NOW)).toBe('Wednesday 14 October, 9:40 PM')
    expect(stamp(new Date(2026, 9, 14, 23, 50), new Date(2026, 9, 21, 0, 10))).toBe(
      'Wednesday 14 October, 11:50 PM',
    )
  })

  it('names the year for a list stamped in an earlier year', () => {
    expect(stamp(new Date(2025, 9, 21, 17, 40), NOW)).toBe('Tuesday 21 October 2025, 5:40 PM')
    expect(stamp(new Date(2025, 11, 30, 18, 0), new Date(2026, 0, 9, 12, 0))).toBe(
      'Tuesday 30 December 2025, 6:00 PM',
    )
  })

  it('names the date for a stamp ahead of the clock, which no weekday this week can describe', () => {
    // The device clock was set back after the list was served.
    expect(stamp(new Date(2026, 9, 23, 21, 40), NOW)).toBe('Friday 23 October, 9:40 PM')
  })

  it('takes its names and its clock from the locale it is given', () => {
    expect(stamp(new Date(2026, 9, 7, 17, 40), NOW, 'en-GB')).toBe('Wednesday 7 October, 17:40')
    expect(stamp(new Date(2026, 9, 15, 21, 40), NOW, 'en-GB')).toBe('Thursday 21:40')
  })

  it('words a stamp up to six days back exactly as Tonight did before the date was named', () => {
    // The formatter Tonight used before chrispezza/barback#64, written out as
    // it was. Up to six days back the brief keeps that wording, in every
    // locale: an en-GB morning reads "Monday 09:05", not "Monday 9:05".
    const before = (at: Date, locale: string) =>
      flat(at.toLocaleString(locale, { weekday: 'long', hour: 'numeric', minute: '2-digit' }))
    const monday = new Date(2026, 9, 19, 9, 5)
    expect(stamp(monday, NOW, 'en-GB')).toBe('Monday 09:05')
    for (const locale of ['en-US', 'en-GB', 'en-AU', 'de-DE', 'fr-FR', 'ja-JP', 'ko-KR']) {
      for (const at of [new Date(2026, 9, 21, 9, 15), monday, new Date(2026, 9, 15, 21, 40)]) {
        expect(stamp(at, NOW, locale), `${locale} ${at.toString()}`).toBe(before(at, locale))
      }
    }
  })

  it('writes the time the same way either side of the six-day line', () => {
    // Six days back an en-GB morning reads "Monday 09:05" (above); once the
    // date is named the time keeps its leading zero.
    expect(stamp(new Date(2026, 9, 7, 9, 5), NOW, 'en-GB')).toBe('Wednesday 7 October, 09:05')
    expect(stamp(new Date(2026, 9, 7, 9, 5), NOW)).toBe('Wednesday 7 October, 9:05 AM')
  })

  it('reads the stamp snapshotOf writes', () => {
    const at = new Date(2026, 9, 7, 17, 40)
    const snapshot = snapshotOf(listResponse(m, [I.campari]).data, at)
    expect(stamp(new Date(snapshot.at), NOW)).toBe('Wednesday 7 October, 5:40 PM')
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

  // Tonight states when the snapshot was served (ADR-007: "clearly stamped").
  // A stored stamp that is not a time cannot say that, and stored names that
  // are not a list cannot be listed: either way there is no snapshot to show.
  it('reads null when the stored stamp is not a time', () => {
    localStorage.setItem(LIST_SNAPSHOT_KEY, JSON.stringify({ at: 'Wednesday', names: ['Campari'] }))
    expect(readListSnapshot()).toBeNull()
    localStorage.setItem(LIST_SNAPSHOT_KEY, JSON.stringify({ names: ['Campari'] }))
    expect(readListSnapshot()).toBeNull()
  })

  it('reads null when the stored names are not a list of names', () => {
    localStorage.setItem(LIST_SNAPSHOT_KEY, JSON.stringify({ at: '2026-10-07T21:40:00.000Z', names: 'Campari' }))
    expect(readListSnapshot()).toBeNull()
    localStorage.setItem(LIST_SNAPSHOT_KEY, JSON.stringify({ at: '2026-10-07T21:40:00.000Z', names: [7] }))
    expect(readListSnapshot()).toBeNull()
    localStorage.setItem(LIST_SNAPSHOT_KEY, 'null')
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
