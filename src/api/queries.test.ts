import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MutationObserver as ShelfToggleObserver, QueryClient, onlineManager } from '@tanstack/react-query'
import { BarModel, ingredientResource } from '../../test/fixtures/upstream'
import { BAR_ID, I, USER_ID, defaultWorld } from '../../test/fixtures/world'
import type { ToastMessage } from '../components/toasts'
import { isPlaced } from '../data/hierarchy'
import { isShelfTogglePending, shelfToggleOptions, type ShelfToggle } from './queries'
import type { Ingredient, ListResponse } from './types'

// The shelf toggle (frontend-spec §5: "flip UI state immediately, fire
// batch-store / batch-delete, roll back on error"; ADR-003: "reflects in UI in
// < 50 ms (optimistic), reconciles with API in the background"). The mutation's
// options are driven through TanStack's own MutationObserver — what useMutation
// wraps — because @tanstack/react-query is externalised by Vitest and cannot
// render under Preact here (see components/ShoppingRow.test.tsx). The screen is
// driven end to end in e2e/shelf-optimistic.spec.ts.

const toasts = vi.hoisted(() => ({ shown: [] as ToastMessage[] }))

vi.mock('../components/toasts', () => ({
  showToast: (t: ToastMessage) => {
    toasts.shown.push(t)
  },
}))

/** A shelf write the test answers by hand. */
interface Write {
  path: string
  body: unknown
  answer: (status: number) => void
  /** Drop the connection: fetch rejects, as it does with no network. */
  drop: () => void
}

let writes: Write[] = []

beforeEach(() => {
  toasts.shown = []
  writes = []
  // Never the network (ADR-011): every call is held until the test answers it.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          writes.push({
            path: new URL(url).pathname,
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
            answer: (status) => resolve(new Response(null, { status })),
            drop: () => reject(new TypeError('Failed to fetch')),
          })
        }),
    ),
  )
})

const SHELF_KEY = ['shelf', BAR_ID]

/** GET /ingredients?filter[on_shelf]=true as upstream sends it: index
 *  resources in name order (IngredientQueryFilter defaultSort('name')). */
function shelfList(m: BarModel): ListResponse<Ingredient> {
  const data = [...m.shelf]
    .map((id) => ingredientResource(m, id, 'index'))
    .sort((a, b) => a.name.localeCompare(b.name))
  return { data, meta: { total: data.length, current_page: 1, last_page: 1 } }
}

function setup(opts: { loaded?: boolean } = {}) {
  const m = new BarModel(defaultWorld())
  const client = new QueryClient()
  const before = shelfList(m)
  if (opts.loaded !== false) client.setQueryData(SHELF_KEY, before)
  const observer = new ShelfToggleObserver(client, shelfToggleOptions(client, BAR_ID, USER_ID))
  /** Fire a toggle as the chip does; resolves 'taken' or 'refused'. */
  const toggle = (id: number, action: ShelfToggle['action']) =>
    observer.mutate({ ingredient: m.basic(id), action }).then(
      () => 'taken',
      () => 'refused',
    )
  const shelf = () => client.getQueryData<ListResponse<Ingredient>>(SHELF_KEY)
  const ids = () => shelf()?.data.map((i) => i.id)
  return { m, client, before, toggle, shelf, ids }
}

/** Wait until the toggle's write is out — onMutate has run by then. */
async function written(n: number): Promise<Write> {
  await vi.waitFor(() => expect(writes.length).toBeGreaterThanOrEqual(n))
  const w = writes[n - 1]
  if (!w) throw new Error(`no write ${n}`)
  return w
}

describe('a shelf toggle', () => {
  it('puts a pending entry on the shelf before the store answers', async () => {
    const { m, toggle, shelf, ids } = setup()
    const done = toggle(I.cointreau, 'add')
    const w = await written(1)

    expect(w.path).toBe(`/api/users/${USER_ID}/ingredients/batch-store`)
    expect(w.body).toEqual({ ingredients: [I.cointreau] })
    expect(ids()).toContain(I.cointreau)
    expect(shelf()?.meta?.total).toBe(12)
    const pending = shelf()?.data.find((i) => i.id === I.cointreau)
    expect(pending).toEqual({ ...m.basic(I.cointreau), strength: 0, in_shelf: true })
    // Not yet placed in the hierarchy: the ledger waits for the read-back.
    expect(pending && isPlaced(pending)).toBe(false)

    w.answer(204)
    expect(await done).toBe('taken')
    expect(toasts.shown).toEqual([])
  })

  it('takes the entry off before the delete answers, then offers Undo', async () => {
    const { toggle, shelf, ids } = setup()
    const done = toggle(I.gin, 'remove')
    const w = await written(1)

    expect(w.path).toBe(`/api/users/${USER_ID}/ingredients/batch-delete`)
    expect(w.body).toEqual({ ingredients: [I.gin] })
    expect(ids()).not.toContain(I.gin)
    expect(shelf()?.meta?.total).toBe(10)
    expect(toasts.shown).toEqual([])

    w.answer(204)
    expect(await done).toBe('taken')
    expect(toasts.shown.map((t) => [t.message, t.tone, t.actionLabel])).toEqual([
      ['Bottle removed from the shelf.', 'destructive', 'Undo'],
    ])
    toasts.shown[0]?.onAction?.()
    const undo = await written(2)
    expect(undo.path).toBe(`/api/users/${USER_ID}/ingredients/batch-store`)
    expect(undo.body).toEqual({ ingredients: [I.gin] })
    undo.answer(204)
  })

  it('takes a refused addition off again, and says so', async () => {
    const { before, toggle, shelf } = setup()
    const done = toggle(I.cointreau, 'add')
    ;(await written(1)).answer(500)

    expect(await done).toBe('refused')
    expect(shelf()).toEqual(before)
    expect(toasts.shown.map((t) => t.message)).toEqual(['The shelf didn’t take that change.'])
  })

  it('puts a refused removal back where it stood, and says so', async () => {
    const { before, toggle, shelf } = setup()
    const done = toggle(I.gin, 'remove')
    ;(await written(1)).answer(500)

    expect(await done).toBe('refused')
    expect(shelf()).toEqual(before)
    expect(toasts.shown.map((t) => t.message)).toEqual(['The shelf didn’t take that change.'])
  })

  it('undoes only the refused toggle while another is in flight', async () => {
    const { toggle, shelf, ids } = setup()
    const cointreau = toggle(I.cointreau, 'add')
    const gin = toggle(I.gin, 'remove')
    const campari = toggle(I.campari, 'add')
    const [wCointreau, wGin, wCampari] = [await written(1), await written(2), await written(3)]
    expect(shelf()?.meta?.total).toBe(12)

    wCointreau.answer(500)
    expect(await cointreau).toBe('refused')
    expect(ids()).not.toContain(I.cointreau)
    expect(ids()).toContain(I.campari)
    expect(ids()).not.toContain(I.gin)
    expect(shelf()?.meta?.total).toBe(11)

    wGin.answer(500)
    expect(await gin).toBe('refused')
    expect(ids()).toContain(I.gin)
    expect(ids()).toContain(I.campari)
    expect(shelf()?.meta?.total).toBe(12)

    wCampari.answer(204)
    expect(await campari).toBe('taken')
    expect(ids()).toContain(I.campari)
  })

  it('leaves a bottle already on the shelf where it is when its add is refused', async () => {
    const { before, toggle, shelf } = setup()
    const done = toggle(I.gin, 'add')
    const w = await written(1)
    expect(shelf()).toEqual(before)

    w.answer(500)
    expect(await done).toBe('refused')
    expect(shelf()).toEqual(before)
  })

  it('reads the shelf back, with what derives from it, once the last toggle has settled', async () => {
    const { client, toggle } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const first = toggle(I.cointreau, 'add')
    const second = toggle(I.campari, 'add')
    const [w1, w2] = [await written(1), await written(2)]

    w1.answer(204)
    await first
    // A read-back now could land on top of Campari's flip.
    expect(invalidate).not.toHaveBeenCalled()

    w2.answer(204)
    await second
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['shelf'],
      ['shopping-list'],
      ['cocktails'],
      ['recommend'],
      ['staples'],
    ])
  })

  it('still writes, and flips nothing, before the shelf has loaded', async () => {
    const { toggle, shelf } = setup({ loaded: false })
    const done = toggle(I.cointreau, 'add')
    const w = await written(1)
    expect(w.body).toEqual({ ingredients: [I.cointreau] })
    expect(shelf()).toBeUndefined()

    w.answer(204)
    expect(await done).toBe('taken')
    expect(shelf()).toBeUndefined()
  })
})

// ADR-007 Consequences: "Offline check-off is not supported; mutations require
// connectivity." TanStack pauses a mutation while it thinks the device is
// offline and replays it on reconnect; for a toggle that has already flipped
// the chip, that is a silent queued write nobody can take back.
describe('a shelf toggle made offline', () => {
  afterEach(() => {
    onlineManager.setOnline(true)
  })

  it('is attempted rather than queued, and rolls back and says so when it cannot go out', async () => {
    onlineManager.setOnline(false)
    const { client, before, toggle, shelf } = setup()
    const done = toggle(I.cointreau, 'add')
    const w = await written(1)
    expect(w.path).toBe(`/api/users/${USER_ID}/ingredients/batch-store`)
    expect(shelf()?.meta?.total).toBe(12)

    w.drop()
    expect(await done).toBe('refused')
    expect(shelf()).toEqual(before)
    expect(toasts.shown.map((t) => t.message)).toEqual(['The shelf didn’t take that change.'])
    // Nothing left pending, so the next tap is a new decision, not a double-tap.
    expect(isShelfTogglePending(client, BAR_ID, I.cointreau)).toBe(false)
  })
})

// The Undo a removal offers is the same toggle (frontend-spec §5): optimistic,
// rolled back with the same toast if refused, read back with everything that
// derives from the shelf, and never over another toggle still in flight.
describe('the Undo a removal offers', () => {
  /** Remove Gin, let the shelf take it, and return the toast's Undo. */
  async function removeGin(s: ReturnType<typeof setup>) {
    const removed = s.toggle(I.gin, 'remove')
    ;(await written(1)).answer(204)
    expect(await removed).toBe('taken')
    const toast = toasts.shown[0]
    expect(toast?.actionLabel).toBe('Undo')
    return () => toast?.onAction?.()
  }

  it('puts the bottle back where it stood before the store answers, then reads the shelf back', async () => {
    const s = setup()
    const undo = await removeGin(s)
    const invalidate = vi.spyOn(s.client, 'invalidateQueries')

    undo()
    const w = await written(2)
    expect(w.path).toBe(`/api/users/${USER_ID}/ingredients/batch-store`)
    expect(w.body).toEqual({ ingredients: [I.gin] })
    // The entry the removal took, in the place it held, and the count with it.
    expect(s.shelf()).toEqual(s.before)
    expect(isShelfTogglePending(s.client, BAR_ID, I.gin)).toBe(true)

    w.answer(204)
    await vi.waitFor(() => expect(isShelfTogglePending(s.client, BAR_ID, I.gin)).toBe(false))
    expect(s.shelf()).toEqual(s.before)
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['shelf'],
      ['shopping-list'],
      ['cocktails'],
      ['recommend'],
      ['staples'],
    ])
    // An addition is not a decision to take back: no second Undo.
    expect(toasts.shown).toHaveLength(1)
  })

  it('takes the bottle off again, and says so, when the shelf refuses the Undo', async () => {
    const s = setup()
    const undo = await removeGin(s)
    const afterRemoval = s.shelf()

    undo()
    const w = await written(2)
    expect(s.ids()).toContain(I.gin)

    w.answer(500)
    await vi.waitFor(() =>
      expect(toasts.shown.map((t) => t.message)).toEqual([
        'Bottle removed from the shelf.',
        'The shelf didn’t take that change.',
      ]),
    )
    expect(s.shelf()).toEqual(afterRemoval)
  })

  it('does not read the shelf back over a toggle still in flight', async () => {
    const s = setup()
    const undo = await removeGin(s)
    const invalidate = vi.spyOn(s.client, 'invalidateQueries')
    const cointreau = s.toggle(I.cointreau, 'add')
    const wCointreau = await written(2)

    undo()
    const wUndo = await written(3)
    expect(wUndo.body).toEqual({ ingredients: [I.gin] })
    wUndo.answer(204)
    await vi.waitFor(() => expect(isShelfTogglePending(s.client, BAR_ID, I.gin)).toBe(false))
    // Cointreau's store is still out: a read-back now would land on its flip.
    expect(invalidate).not.toHaveBeenCalled()
    expect(s.ids()).toContain(I.cointreau)
    expect(s.ids()).toContain(I.gin)

    wCointreau.answer(204)
    expect(await cointreau).toBe('taken')
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['shelf'],
      ['shopping-list'],
      ['cocktails'],
      ['recommend'],
      ['staples'],
    ])
  })
})

describe('isShelfTogglePending', () => {
  it('is true for a bottle while its toggle is in flight, and for no other', async () => {
    const { client, toggle } = setup()
    expect(isShelfTogglePending(client, BAR_ID, I.cointreau)).toBe(false)
    const done = toggle(I.cointreau, 'add')
    expect(isShelfTogglePending(client, BAR_ID, I.cointreau)).toBe(true)
    expect(isShelfTogglePending(client, BAR_ID, I.campari)).toBe(false)
    expect(isShelfTogglePending(client, BAR_ID + 1, I.cointreau)).toBe(false)

    ;(await written(1)).answer(204)
    await done
    expect(isShelfTogglePending(client, BAR_ID, I.cointreau)).toBe(false)
  })
})
