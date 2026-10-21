import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MutationObserver as ShelfToggleObserver, QueryClient } from '@tanstack/react-query'
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
        new Promise<Response>((resolve) => {
          writes.push({
            path: new URL(url).pathname,
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
            answer: (status) => resolve(new Response(null, { status })),
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
