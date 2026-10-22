import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MutationObserver as QueryMutationObserver,
  QueryClient,
  QueryObserver,
  onlineManager,
} from '@tanstack/react-query'
import { BarModel, ingredientResource, orderByName } from '../../test/fixtures/upstream'
import { BAR_ID, I, USER_ID, defaultWorld } from '../../test/fixtures/world'
import type { ToastMessage } from '../components/toasts'
import { isPlaced } from '../data/hierarchy'
import {
  checkOffOptions,
  ingredientNamesOptions,
  isShelfTogglePending,
  shelfToggleOptions,
  toggleShelf,
  type ShelfToggle,
} from './queries'
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
 *  resources in SQL name order (IngredientQueryFilter defaultSort('name');
 *  orderByName). */
function shelfList(m: BarModel): ListResponse<Ingredient> {
  const data = orderByName([...m.shelf].map((id) => ingredientResource(m, id, 'index')))
  return { data, meta: { total: data.length, current_page: 1, last_page: 1 } }
}

function setup(opts: { loaded?: boolean } = {}) {
  const m = new BarModel(defaultWorld())
  const client = new QueryClient()
  const before = shelfList(m)
  if (opts.loaded !== false) client.setQueryData(SHELF_KEY, before)
  const observer = new QueryMutationObserver(client, shelfToggleOptions(client, BAR_ID, USER_ID))
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
      ['similar'],
      ['ingredient-extra'],
      ['ingredient-reach'],
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
      ['similar'],
      ['ingredient-extra'],
      ['ingredient-reach'],
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
      ['similar'],
      ['ingredient-extra'],
      ['ingredient-reach'],
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

describe('toggleShelf', () => {
  it('drops a second toggle for a bottle still in flight, and lets every other bottle through', async () => {
    const { m, client, ids } = setup()
    const fire = (id: number, action: ShelfToggle['action']) =>
      toggleShelf(client, BAR_ID, USER_ID, { ingredient: m.basic(id), action })

    fire(I.cointreau, 'add')
    const wCointreau = await written(1)
    fire(I.cointreau, 'remove')
    fire(I.campari, 'add')
    const wCampari = await written(2)
    expect(writes.map((w) => w.body)).toEqual([{ ingredients: [I.cointreau] }, { ingredients: [I.campari] }])
    expect(ids()).toContain(I.cointreau)

    wCointreau.answer(204)
    wCampari.answer(204)
    await vi.waitFor(() => expect(client.isMutating()).toBe(0))
    // Settled, the bottle takes a new toggle.
    fire(I.cointreau, 'remove')
    const wAgain = await written(3)
    expect(wAgain.path).toBe(`/api/users/${USER_ID}/ingredients/batch-delete`)
    wAgain.answer(204)
  })
})

// Check-off (frontend-spec §5): "run batch-store first, and on success
// batch-delete from the list … Never the reverse order (item vanishing
// entirely is data loss from the user's view)". Its Undo is the reverse move
// and keeps the same rule: the list takes the bottle back before the shelf
// gives it up. Upstream's shelf batch-delete leaves the list alone
// (ShelfController::batchDelete at v5.15.3), so a refused second step leaves
// the bottle in both places. Both read back the same queries, the unlock and
// reach lines included (§6 journey 3, "refreshes all counts"). The screen is
// driven end to end in e2e/a-checkoff-undo.spec.ts.
describe('a check-off', () => {
  const READ_BACK = [
    ['shelf'],
    ['shopping-list'],
    ['cocktails'],
    ['similar'],
    ['ingredient-extra'],
    ['ingredient-reach'],
    ['recommend'],
    ['staples'],
  ]

  function checkOffSetup() {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const observer = new QueryMutationObserver(client, checkOffOptions(client, BAR_ID, USER_ID))
    /** Check a bottle off as its list row does; resolves 'taken' or 'refused'. */
    const checkOff = (id: number) =>
      observer.mutate({ ingredientId: id }).then(
        () => 'taken',
        () => 'refused',
      )
    const readBack = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    /** What Tonight's row guard reads (checkOff.isPending). */
    const pending = () => observer.getCurrentResult().isPending
    return { client, checkOff, readBack, pending }
  }

  /** A list read the test answers by hand. */
  interface ListRead {
    answer: () => void
    fail: () => void
  }

  /**
   * The list as Tonight's rail shows it: observed, so a read-back refetches it,
   * read once already, and every later read held until the test answers it. Its
   * reads are not fetch calls, so `writes` stays the check-off's own.
   */
  async function shownList(client: QueryClient): Promise<ListRead[]> {
    const reads: ListRead[] = []
    const observer = new QueryObserver(client, {
      queryKey: ['shopping-list', BAR_ID],
      queryFn: () =>
        new Promise<ListResponse<never>>((resolve, reject) => {
          reads.push({
            answer: () => resolve({ data: [], meta: { total: 0, current_page: 1, last_page: 1 } }),
            fail: () => reject(new Error('API 500 on /users/1/shopping-list')),
          })
        }),
      retry: false,
    })
    observer.subscribe(() => {})
    await vi.waitFor(() => expect(reads).toHaveLength(1))
    reads[0]?.answer()
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true))
    return reads
  }

  /** The list read numbered `n` (1 is the read the rail opened with). */
  async function listRead(reads: ListRead[], n: number): Promise<ListRead> {
    await vi.waitFor(() => expect(reads.length).toBeGreaterThan(n))
    const r = reads[n]
    if (!r) throw new Error(`no list read ${n}`)
    return r
  }

  /** Let any write that would follow go out, so its absence means something. */
  const quiet = () => new Promise((resolve) => setTimeout(resolve, 20))

  /** Check Campari off, let both writes take, and return the toast's Undo. */
  async function checkOffCampari(s: ReturnType<typeof checkOffSetup>) {
    const done = s.checkOff(I.campari)
    ;(await written(1)).answer(204)
    ;(await written(2)).answer(204)
    expect(await done).toBe('taken')
    const toast = toasts.shown[0]
    expect([toast?.message, toast?.actionLabel]).toEqual(['Moved to the shelf.', 'Undo'])
    return () => toast?.onAction?.()
  }

  it('shelves the bottle first, and takes it off the list only once the shelf has it', async () => {
    const s = checkOffSetup()
    const done = s.checkOff(I.campari)
    const store = await written(1)
    expect([store.path, store.body]).toEqual([
      `/api/users/${USER_ID}/ingredients/batch-store`,
      { ingredients: [I.campari] },
    ])
    await quiet()
    expect(writes).toHaveLength(1)

    store.answer(204)
    const remove = await written(2)
    expect([remove.path, remove.body]).toEqual([
      `/api/users/${USER_ID}/shopping-list/batch-delete`,
      { ingredients: [{ id: I.campari }] },
    ])
    remove.answer(204)
    expect(await done).toBe('taken')
    expect(s.readBack()).toEqual(READ_BACK)
  })

  it('never takes the bottle off the list when the shelf refuses it, and says so', async () => {
    const s = checkOffSetup()
    const done = s.checkOff(I.campari)
    ;(await written(1)).answer(500)

    expect(await done).toBe('refused')
    await quiet()
    expect(writes).toHaveLength(1)
    expect(toasts.shown.map((t) => t.message)).toEqual([
      'That didn’t move — the bottle is still on the list.',
    ])
    expect(s.readBack()).toEqual(READ_BACK)
  })

  // chrispezza/barback#142: the row leaves the rail only when the list read the
  // check-off starts has landed, and until then it takes a tap. The check-off
  // holds the row (Tonight's guard is checkOff.isPending) until that read has
  // landed, not only until its writes have answered. The screen is driven in
  // e2e/t5t-checkoff-double-tap.spec.ts.
  describe('while its list is read back', () => {
    it('stays pending until the list read it started has landed', async () => {
      const s = checkOffSetup()
      const reads = await shownList(s.client)
      let settled = false
      const done = s.checkOff(I.campari).then((outcome) => {
        settled = true
        return outcome
      })
      ;(await written(1)).answer(204)
      ;(await written(2)).answer(204)
      const read = await listRead(reads, 1)
      // The receipt is shown once the writes have answered; the hold is the row's.
      await vi.waitFor(() => expect(toasts.shown.map((t) => t.message)).toEqual(['Moved to the shelf.']))
      await quiet()
      expect([s.pending(), settled]).toEqual([true, false])

      read.answer()
      expect(await done).toBe('taken')
      expect(s.pending()).toBe(false)
    })

    it('stays pending through list reads that replaced its own, until the last one lands', async () => {
      const s = checkOffSetup()
      const reads = await shownList(s.client)
      let settled = false
      const done = s.checkOff(I.campari).then((outcome) => {
        settled = true
        return outcome
      })
      ;(await written(1)).answer(204)
      ;(await written(2)).answer(204)
      const own = await listRead(reads, 1)
      // A list write's read-back, then an Undo's, while this one is out: each
      // cancels the read under way and starts one of its own. A cancelled
      // read's promise follows the read that replaced it, but not a second
      // (Query.fetch on a silent cancel, query-core 5.101.4), so two
      // replacements tell a hold on the list from a hold on one read.
      void s.client.invalidateQueries({ queryKey: ['shopping-list'] })
      const second = await listRead(reads, 2)
      void s.client.invalidateQueries({ queryKey: ['shopping-list'] })
      const last = await listRead(reads, 3)
      own.answer()
      second.answer()
      await quiet()
      expect([s.pending(), settled]).toEqual([true, false])

      last.answer()
      expect(await done).toBe('taken')
      expect(s.pending()).toBe(false)
    })

    it('is freed by a list read that fails, and still says the bottle moved', async () => {
      const s = checkOffSetup()
      const reads = await shownList(s.client)
      const done = s.checkOff(I.campari)
      ;(await written(1)).answer(204)
      ;(await written(2)).answer(204)
      const read = await listRead(reads, 1)
      await quiet()
      expect(s.pending()).toBe(true)

      read.fail()
      expect(await done).toBe('taken')
      expect(s.pending()).toBe(false)
      expect(toasts.shown.map((t) => t.message)).toEqual(['Moved to the shelf.'])
    })

    it('holds a refused check-off too, until the list it left the bottle on is read back', async () => {
      const s = checkOffSetup()
      const reads = await shownList(s.client)
      const done = s.checkOff(I.campari)
      ;(await written(1)).answer(500)
      const read = await listRead(reads, 1)
      await quiet()
      expect(s.pending()).toBe(true)

      read.answer()
      expect(await done).toBe('refused')
      expect(s.pending()).toBe(false)
      expect(toasts.shown.map((t) => t.message)).toEqual([
        'That didn’t move — the bottle is still on the list.',
      ])
    })
  })

  describe('its Undo', () => {
    it('puts the bottle back on the list before it takes it off the shelf, then reads back what the check-off did', async () => {
      const s = checkOffSetup()
      const undo = await checkOffCampari(s)
      const afterCheckOff = s.readBack()

      undo()
      const store = await written(3)
      expect([store.path, store.body]).toEqual([
        `/api/users/${USER_ID}/shopping-list/batch-store`,
        { ingredients: [{ id: I.campari }] },
      ])
      await quiet()
      expect(writes).toHaveLength(3)
      expect(s.readBack()).toEqual(afterCheckOff)

      store.answer(204)
      const remove = await written(4)
      expect([remove.path, remove.body]).toEqual([
        `/api/users/${USER_ID}/ingredients/batch-delete`,
        { ingredients: [I.campari] },
      ])
      remove.answer(204)
      await vi.waitFor(() => expect(s.readBack()).toEqual([...READ_BACK, ...READ_BACK]))
      // Taken back, nothing more to say.
      expect(toasts.shown).toHaveLength(1)
    })

    it('leaves the shelf alone when the list refuses the bottle, and says it is still on the shelf', async () => {
      const s = checkOffSetup()
      const undo = await checkOffCampari(s)

      undo()
      ;(await written(3)).drop()
      await vi.waitFor(() => expect(toasts.shown).toHaveLength(2))
      expect(toasts.shown[1]?.message).toBe('The undo didn’t take — the bottle is still on the shelf.')
      await quiet()
      expect(writes).toHaveLength(3)
      expect(s.readBack()).toEqual([...READ_BACK, ...READ_BACK])
    })

    it('says the bottle is in both places when the shelf refuses to give it up', async () => {
      const s = checkOffSetup()
      const undo = await checkOffCampari(s)

      undo()
      ;(await written(3)).answer(204)
      ;(await written(4)).answer(500)
      await vi.waitFor(() => expect(toasts.shown).toHaveLength(2))
      expect(toasts.shown[1]?.message).toBe(
        'The undo didn’t take — the bottle is on the list and still on the shelf.',
      )
      expect(s.readBack()).toEqual([...READ_BACK, ...READ_BACK])
    })
  })
})

// frontend-spec §4: "can-make and near-miss are server-derived from shelf
// state, so they must refetch after any shelf change"; §6 journey 3, "refreshes
// all counts". A list row's "Unlocks N" (GET /ingredients/{id}/extra) is
// computed upstream against the user's shelf (IngredientController::extra,
// app/Http/Controllers/IngredientController.php 209-211 at v5.15.3), and the
// shelf's batch-store takes the bottle off the list (ShelfController::batchStore,
// ShelfController.php 140-142), so a chip, a Remove and its Undo change the same
// counts a check-off does, and read the same ones back.
describe('what a shelf toggle reads back', () => {
  /** The keys a settled check-off invalidates, then a clean slate for the toggle. */
  async function checkOffReadBack(): Promise<unknown[]> {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const observer = new QueryMutationObserver(client, checkOffOptions(client, BAR_ID, USER_ID))
    const done = observer.mutate({ ingredientId: I.campari })
    ;(await written(1)).answer(204)
    ;(await written(2)).answer(204)
    await done
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    writes = []
    toasts.shown = []
    return keys
  }

  it('is what a check-off reads back, the unlock lines included, for a chip', async () => {
    const expected = await checkOffReadBack()
    expect(expected).toEqual(expect.arrayContaining([['ingredient-extra'], ['ingredient-reach']]))
    const { client, toggle } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const done = toggle(I.cointreau, 'add')
    ;(await written(1)).answer(204)
    expect(await done).toBe('taken')
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual(expected)
  })

  it('is what a check-off reads back for a Remove, and again for its Undo', async () => {
    const expected = await checkOffReadBack()
    const { client, toggle } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const readBack = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey)

    const removed = toggle(I.gin, 'remove')
    ;(await written(1)).answer(204)
    expect(await removed).toBe('taken')
    expect(readBack()).toEqual(expected)

    toasts.shown[0]?.onAction?.()
    ;(await written(2)).answer(204)
    await vi.waitFor(() => expect(isShelfTogglePending(client, BAR_ID, I.gin)).toBe(false))
    expect(readBack()).toEqual([...expected, ...expected])
  })
})

// The shelf ledger's group headers (frontend-spec §9; Visual foundations: no
// layout motion). A write that opens or empties a group changes the set of
// roots the lookup asks for, and its key. The names already read hold while
// the new set is out, whichever lookup read them, and the result says it is a
// stand-in until the answer lands, so the ledger can hold back a bottle whose
// group is not yet named instead of reading flat. Driven through TanStack's
// own QueryObserver, what useQuery wraps (see the note at the top). The screen
// is driven end to end in e2e/a-ledger-groups.spec.ts.
describe('the ledger’s root names', () => {
  const m = new BarModel(defaultWorld())

  /** A name lookup the test answers by hand: GET /ingredients?filter[id]=…. */
  interface Lookup {
    ids: string
    answer: () => void
  }
  let lookups: Lookup[] = []

  beforeEach(() => {
    lookups = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string) =>
          new Promise<Response>((resolve) => {
            const ids = new URL(url).searchParams.get('filter[id]') ?? ''
            lookups.push({
              ids,
              // IngredientController::index over filter[id], index resources.
              answer: () =>
                resolve(
                  new Response(
                    JSON.stringify({
                      data: ids.split(',').map((id) => ingredientResource(m, Number(id), 'index')),
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                  ),
                ),
            })
          }),
      ),
    )
  })

  const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',')

  /** What the Shelf would see, as useQuery would see it, for these roots. */
  function watch(client: QueryClient, ids: number[], barId = BAR_ID) {
    const observer = new QueryObserver(client, ingredientNamesOptions(client, barId, ids))
    const stop = observer.subscribe(() => {})
    const result = () => observer.getCurrentResult()
    /** The Shelf re-rendered over a new set of roots. */
    const rootsBecome = (next: number[]) => observer.setOptions(ingredientNamesOptions(client, barId, next))
    return { result, rootsBecome, stop }
  }

  /** Wait for the lookup for exactly these ids, then answer it. */
  async function answer(ids: number[]): Promise<void> {
    await vi.waitFor(() => expect(lookups.map((l) => l.ids)).toContain(sorted(ids)))
    lookups.find((l) => l.ids === sorted(ids))?.answer()
  }

  const six = [I.spirits, I.wines, I.juices, I.syrups, I.bitters, I.beverages]

  it('keeps every name it holds while a set with a new root is read, and says it stands in', async () => {
    const client = new QueryClient()
    const names = watch(client, six)
    await answer(six)
    await vi.waitFor(() => expect(names.result().data?.size).toBe(6))

    // The first Liqueurs bottle is read back onto the shelf.
    names.rootsBecome([...six, I.liqueurs])
    expect(names.result().isPlaceholderData).toBe(true)
    expect([...(names.result().data?.keys() ?? [])].sort((a, b) => a - b)).toEqual(
      [...six].sort((a, b) => a - b),
    )
    expect(names.result().data?.get(I.spirits)).toBe('Spirits')
    expect(names.result().data?.has(I.liqueurs)).toBe(false)

    await answer([...six, I.liqueurs])
    await vi.waitFor(() => expect(names.result().isPlaceholderData).toBe(false))
    expect(names.result().data?.get(I.liqueurs)).toBe('Liqueurs')
    expect(names.result().data?.size).toBe(7)
    names.stop()
  })

  it('names a set that lost a root at once, from the names it holds', async () => {
    const client = new QueryClient()
    const names = watch(client, six)
    await answer(six)
    await vi.waitFor(() => expect(names.result().data?.size).toBe(6))

    // The last bitters bottle comes off the shelf.
    const five = six.filter((id) => id !== I.bitters)
    names.rootsBecome(five)
    expect(names.result().isPlaceholderData).toBe(true)
    expect(names.result().data).toEqual(new Map(five.map((id) => [id, ingredientResource(m, id, 'index').name])))

    await answer(five)
    await vi.waitFor(() => expect(names.result().isPlaceholderData).toBe(false))
    expect(names.result().data?.size).toBe(5)
    names.stop()
  })

  it('starts a reader on another screen visit from every name the bar has read', async () => {
    const client = new QueryClient()
    // The Shelf read the six roots, then was left; a check-off on Tonight
    // opened Liqueurs, and the Shelf is opened again.
    const before = watch(client, six)
    await answer(six)
    await vi.waitFor(() => expect(before.result().data?.size).toBe(6))
    before.stop()

    const names = watch(client, [...six, I.liqueurs])
    expect(names.result().isPlaceholderData).toBe(true)
    expect(names.result().data?.size).toBe(6)
    expect(names.result().data?.has(I.liqueurs)).toBe(false)
    await answer([...six, I.liqueurs])
    await vi.waitFor(() => expect(names.result().data?.get(I.liqueurs)).toBe('Liqueurs'))
    names.stop()
  })

  it('has no stand-in for a first read, nor names read for another bar', async () => {
    const client = new QueryClient()
    const first = watch(client, six)
    expect(first.result().data).toBeUndefined()
    expect(first.result().isPlaceholderData).toBe(false)
    await answer(six)
    await vi.waitFor(() => expect(first.result().data?.size).toBe(6))
    first.stop()

    const otherBar = watch(client, six, BAR_ID + 1)
    expect(otherBar.result().data).toBeUndefined()
    expect(otherBar.result().isPlaceholderData).toBe(false)
    otherBar.stop()
  })

  // useQuery builds the options afresh on every render of the Shelf, reads the
  // observer's optimistic result during the render, and hands the options to
  // setOptions in an effect after it (useBaseQuery). TanStack keeps a stand-in
  // from one render to the next only while placeholderData is the same function
  // (QueryObserver.createResult). A new stand-in on every render is a new map,
  // an update, and another render, for as long as the lookup is out.
  it('holds one stand-in for a set of roots, render after render, while its lookup is out', async () => {
    const client = new QueryClient()
    const updates = vi.fn()
    /** The options one render of the Shelf hands useQuery, defaulted as useQuery defaults them. */
    const built = (ids: number[]) => {
      const options = client.defaultQueryOptions(ingredientNamesOptions(client, BAR_ID, ids))
      options._optimisticResults = 'optimistic'
      return options
    }
    const observer = new QueryObserver(client, built(six))
    /** One render of the Shelf over these roots, as useQuery runs it; what the render saw. */
    const render = (ids: number[]) => {
      const options = built(ids)
      const seen = observer.getOptimisticResult(options)
      if (!observer.hasListeners()) observer.subscribe(updates)
      observer.setOptions(options)
      return seen
    }
    const current = () => observer.getCurrentResult()

    render(six)
    await answer(six)
    await vi.waitFor(() => expect(current().data?.size).toBe(6))

    // The render that brings in the first Liqueurs bottle: one update, to the stand-in.
    const seven = [...six, I.liqueurs]
    render(seven)
    const standIn = current()
    expect(standIn.isPlaceholderData).toBe(true)
    expect(standIn.fetchStatus).toBe('fetching')
    expect(standIn.data?.size).toBe(6)
    updates.mockClear()

    // Every render after it, while the lookup is out, sees the same names and starts no update.
    const next = render(seven)
    const after = render(seven)
    expect(updates).not.toHaveBeenCalled()
    expect(next.data).toBe(standIn.data)
    expect(after.data).toBe(standIn.data)
    expect(current().data).toBe(standIn.data)
    expect(lookups.filter((l) => l.ids === sorted(seven))).toHaveLength(1)

    await answer(seven)
    await vi.waitFor(() => expect(current().isPlaceholderData).toBe(false))
    expect(current().data?.get(I.liqueurs)).toBe('Liqueurs')
    observer.destroy()
  })
})
