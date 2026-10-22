import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BarModel, cocktailResource, ingredientResource } from '../../test/fixtures/upstream'
import { BAR_ID, defaultWorld } from '../../test/fixtures/world'
import { isApiError } from './client'
import { useFirstPours, useStaples } from './queries'
import type { Cocktail, Ingredient } from './types'

// The two curated slug lists the client resolves against the bar: the Classics
// roster (useFirstPours, data/first-pours.ts) and the par-level staples
// (useStaples, data/staples.ts). A slug the bar does not hold is dropped:
// upstream answers it 404 (firstOrFail in CocktailController::show,
// CocktailController.php 97-100, and IngredientController::show,
// IngredientController.php 79-94; app/Exceptions/Handler.php 64-67 renders it,
// at v5.15.3). Any other failure, a 403 from the same show actions included, is
// the bar not answering, not the bar lacking the drink: the read fails so the
// screen can say so in the error voice (ADR-007; chrispezza/barback#68).
//
// @tanstack/react-query is externalised by Vitest and cannot render under
// Preact here (see components/ShoppingRow.test.tsx), so useQuery is replaced by
// one that hands back the options each hook builds; the test runs the hook's
// own queryFn against a stubbed fetch (ADR-011: never the network).

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: (options: unknown) => options,
}))

/** What a hook handed to useQuery. */
interface Built<T> {
  queryKey: unknown[]
  enabled?: boolean
  queryFn: () => Promise<T>
}

const built = <T>(hookResult: unknown) => hookResult as Built<T>

/** How the stubbed bar answers one path: a status, or a dropped connection. */
type Answer = number | 'drop'

let m: BarModel
let answers: Map<string, Answer>
let asked: string[]

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  m = new BarModel(defaultWorld())
  answers = new Map()
  asked = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname.replace(/^\/api/, '')
      asked.push(path)
      const answer = answers.get(path)
      if (answer === 'drop') throw new TypeError('Failed to fetch')
      if (answer !== undefined) return json(answer, { message: 'Server Error' })
      let match: RegExpMatchArray | null
      if ((match = path.match(/^\/cocktails\/([^/]+)$/))) {
        const c = m.findCocktail(match[1] ?? '')
        return c
          ? json(200, { data: cocktailResource(m, c, 'show') })
          : json(404, { type: 'api_error', message: 'Resource not found.' })
      }
      if ((match = path.match(/^\/ingredients\/([^/]+)$/))) {
        const i = m.findIngredient(match[1] ?? '')
        return i
          ? json(200, { data: ingredientResource(m, i.id, 'show') })
          : json(404, { type: 'api_error', message: 'Resource not found.' })
      }
      return json(501, { message: `stub does not answer ${path}` })
    }),
  )
})

/** Settle a read: what it resolved to, or the error it failed with. */
async function settle<T extends { name: string }>(read: Promise<T[]>): Promise<{ names?: string[]; error?: unknown }> {
  try {
    return { names: (await read).map((r) => r.name) }
  } catch (error) {
    return { error }
  }
}

describe('useFirstPours, the Classics roster', () => {
  const roster = () => built<Cocktail[]>(useFirstPours(BAR_ID, ['daiquiri', 'not-a-drink', 'negroni']))

  it('drops a slug the bar answers 404, and keeps the rest in roster order', async () => {
    const drinks = await roster().queryFn()
    expect(asked).toEqual(['/cocktails/daiquiri-1', '/cocktails/not-a-drink-1', '/cocktails/negroni-1'])
    expect(drinks.map((c) => c.name)).toEqual(['Daiquiri', 'Negroni'])
  })

  it('fails when the bar answers a slug with a server error, rather than dropping the drink', async () => {
    answers.set('/cocktails/negroni-1', 500)
    const { names, error } = await settle(roster().queryFn())
    expect(names).toBeUndefined()
    expect(isApiError(error) && error.status).toBe(500)
  })

  it('fails when a slug read never reaches the bar', async () => {
    answers.set('/cocktails/daiquiri-1', 'drop')
    const { names, error } = await settle(roster().queryFn())
    expect(names).toBeUndefined()
    expect(error).toBeInstanceOf(TypeError)
  })

  it('fails on any answer but 404: a refusal is not an absence', async () => {
    answers.set('/cocktails/daiquiri-1', 403)
    const { names, error } = await settle(roster().queryFn())
    expect(names).toBeUndefined()
    expect(isApiError(error) && error.status).toBe(403)
  })
})

describe('useStaples, the standing orders', () => {
  const staples = () => built<Ingredient[]>(useStaples(BAR_ID, ['tonic', 'not-a-bottle', 'lime-juice']))

  it('drops a slug the bar answers 404, and keeps the rest in file order', async () => {
    const found = await staples().queryFn()
    expect(asked).toEqual(['/ingredients/tonic-1', '/ingredients/not-a-bottle-1', '/ingredients/lime-juice-1'])
    expect(found.map((i) => i.name)).toEqual(['Tonic', 'Lime juice'])
  })

  it('fails when the bar answers a slug with a server error, rather than resolving to fewer staples', async () => {
    answers.set('/ingredients/lime-juice-1', 500)
    const { names, error } = await settle(staples().queryFn())
    expect(names).toBeUndefined()
    expect(isApiError(error) && error.status).toBe(500)
  })

  it('fails when a slug read never reaches the bar', async () => {
    answers.set('/ingredients/tonic-1', 'drop')
    const { names, error } = await settle(staples().queryFn())
    expect(names).toBeUndefined()
    expect(error).toBeInstanceOf(TypeError)
  })

  it('fails on any answer but 404: a refusal is not an absence', async () => {
    answers.set('/ingredients/tonic-1', 403)
    const { names, error } = await settle(staples().queryFn())
    expect(names).toBeUndefined()
    expect(isApiError(error) && error.status).toBe(403)
  })
})
