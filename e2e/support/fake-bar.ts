import type { Page, Request, Route } from '@playwright/test'
import type { WorldSeed } from '../../test/fixtures/world'
import {
  BarModel,
  SEARCHABLE_ATTRIBUTES,
  cocktailDocument,
  cocktailResource,
  ingredientDocument,
  ingredientResource,
  orderByName,
  shoppingListResource,
} from '../../test/fixtures/upstream'

// A small, stateful fake of Bar Assistant v5.15.3 behind Playwright route
// interception (ADR-011). It answers what the client calls under /bar/api/
// (ADR-005 single origin) and the two Meilisearch indexes under /search/
// (ADR-004). Writes change later reads. Anything it does not recognise is
// recorded in `unhandled` and fails the spec; anything leaving the preview
// server is recorded in `escaped` and aborted.

export const ISSUED_TOKEN = 'e2e-token'
export const SEARCH_TOKEN = 'e2e-scoped-search-key'

export interface RecordedRequest {
  method: string
  /** Path below /bar/api or /search, e.g. "/cocktails". */
  path: string
  query: URLSearchParams
  body: unknown
  service: 'api' | 'search'
}

interface Failure {
  method?: string
  path: RegExp
  status?: number
  /** Drop the connection instead of answering (a network failure). */
  abort?: boolean
  times: number
}

const json = (status: number, body: unknown) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

export class FakeBar {
  readonly model: BarModel
  readonly requests: RecordedRequest[] = []
  readonly unhandled: string[] = []
  readonly escaped: string[] = []
  private failures: Failure[] = []
  private apiDown = false
  private searchDown = false
  private latency = 0

  constructor(world: WorldSeed) {
    this.model = new BarModel(world)
  }

  /** Make the next `times` matching requests fail (status, or a dropped connection). */
  fail(path: RegExp, opts: { method?: string; status?: number; abort?: boolean; times?: number } = {}): void {
    this.failures.push({ path, method: opts.method, status: opts.status, abort: opts.abort, times: opts.times ?? 1 })
  }

  /** The store aisle: every /bar/ request drops (ADR-007). */
  takeApiDown(): void {
    this.apiDown = true
  }

  /** Meilisearch unreachable while the API is up (ADR-004 consequence). */
  takeSearchDown(): void {
    this.searchDown = true
  }

  /** Hold every API answer this long, to observe optimistic UI. */
  slowDown(ms: number): void {
    this.latency = ms
  }

  /** Recorded API calls, optionally filtered by method and path. */
  calls(method?: string, path?: RegExp): RecordedRequest[] {
    return this.requests.filter(
      (r) => r.service === 'api' && (!method || r.method === method) && (!path || path.test(r.path)),
    )
  }

  async install(page: Page, baseURL: string): Promise<void> {
    const origin = new URL(baseURL).origin
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) {
        this.escaped.push(`${route.request().method()} ${url.href}`)
        return route.abort('blockedbyclient')
      }
      if (url.pathname.startsWith('/bar/')) return this.api(route, url)
      if (url.pathname.startsWith('/search/')) return this.search(route, url)
      return route.continue()
    })
  }

  private record(req: Request, url: URL, service: 'api' | 'search', path: string): RecordedRequest {
    let body: unknown = undefined
    const raw = req.postData()
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = raw
      }
    }
    const r = { method: req.method(), path, query: url.searchParams, body, service }
    this.requests.push(r)
    return r
  }

  private takeFailure(method: string, path: string): Failure | undefined {
    const f = this.failures.find((x) => x.times > 0 && (!x.method || x.method === method) && x.path.test(path))
    if (f) f.times -= 1
    return f
  }

  private async api(route: Route, url: URL): Promise<void> {
    const req = route.request()
    if (!url.pathname.startsWith('/bar/api/')) {
      this.unhandled.push(`${req.method()} ${url.pathname}`)
      return route.fulfill(json(404, { message: 'Not found' }))
    }
    const path = url.pathname.slice('/bar/api'.length)
    const r = this.record(req, url, 'api', path)
    if (this.apiDown) return route.abort('connectionrefused')
    const failure = this.takeFailure(r.method, path)
    if (failure?.abort) return route.abort('connectionrefused')
    if (failure) return route.fulfill(json(failure.status ?? 500, { message: 'Server Error' }))
    if (this.latency > 0) await new Promise((resolve) => setTimeout(resolve, this.latency))

    if (!(r.method === 'POST' && path === '/auth/login')) {
      if (req.headers()['authorization'] !== `Bearer ${ISSUED_TOKEN}`) {
        return route.fulfill(json(401, { message: 'Unauthenticated.' }))
      }
    }
    const answer = this.answer(r, req.headers())
    if (answer === undefined) {
      this.unhandled.push(`${r.method} ${path}?${url.searchParams.toString()}`)
      return route.fulfill(json(501, { message: `fixture does not answer ${r.method} ${path}` }))
    }
    return route.fulfill(answer)
  }

  /** Bar-scoped routes need Bar-Assistant-Bar-Id (the bar() helper upstream). */
  private needsBar(headers: Record<string, string>): boolean {
    return headers['bar-assistant-bar-id'] !== String(this.model.world.barId)
  }

  private answer(r: RecordedRequest, headers: Record<string, string>) {
    const m = this.model
    const w = m.world
    // TrimStrings + ConvertEmptyStringsToNull: a blank filter value is null,
    // and Spatie skips a null filter (AllowedFilter.php 44-46).
    const q = new URLSearchParams([...r.query].filter(([, v]) => v.trim() !== ''))
    const p = r.path
    const body = (r.body ?? {}) as Record<string, unknown>
    let match: RegExpMatchArray | null

    // Auth and bootstrap — no bar header (AuthController, ProfileController, BarController::index).
    if (r.method === 'POST' && p === '/auth/login') {
      // throttle:login — five attempts a minute per IP (routes/api.php:60).
      if (this.calls('POST', /^\/auth\/login$/).length > 5) return json(429, { message: 'Too Many Attempts.' })
      if (body['email'] === w.user.email && body['password'] === w.user.password) {
        return json(200, { data: { token: ISSUED_TOKEN } })
      }
      return json(400, { message: 'Unable to authenticate. Check your login credentials and try again.' })
    }
    if (r.method === 'GET' && p === '/profile') {
      return json(200, {
        data: {
          id: w.user.id,
          name: w.user.name,
          email: w.user.email,
          is_subscribed: false,
          memberships: [{ user_id: w.user.id, user_name: w.user.name, bar_id: w.barId, is_shelf_public: false }],
          oauth_credentials: [],
          settings: { language: null, theme: null },
        },
      })
    }
    if (r.method === 'GET' && p === '/bars') {
      return json(200, { data: [this.barResource()] })
    }
    if (r.method === 'GET' && (match = p.match(/^\/bars\/(\d+)\/ingredients\/recommend$/))) {
      // ShelfController::recommendBarIngredients ranks against the BAR shelf,
      // which Barback never writes — so it is empty here.
      return json(200, { data: m.recommendFor(new Set()) })
    }

    // EnsureRequestHasBarQuery (app/Http/Middleware) on the bar-scoped routes.
    if (/^\/(tags|ingredients|cocktails|users)(\/|$)/.test(p) && this.needsBar(headers)) {
      return json(400, {
        message: `Missing required bar reference while requesting 'api${p}'. Use 'Bar-Assistant-Bar-Id' header to specify bar id.`,
      })
    }
    // Route::pattern('id', '[0-9]+'): /users/undefined/... is a 404, as is any
    // call the client makes before the profile has loaded.
    if (/^\/users\/[^/]*[^0-9/][^/]*\//.test(p)) return notFound()

    if (r.method === 'GET' && p === '/tags') {
      // TagController::index — ORDER BY name (SQLite BINARY, byte order), with
      // cocktails_count, not paginated.
      const tags = orderByName(w.tags).map((t) => ({
        id: t.id,
        name: t.name,
        cocktails_count: w.cocktails.filter((c) => c.tagIds?.includes(t.id)).length,
      }))
      return json(200, { data: tags })
    }

    // Ingredients.
    if (r.method === 'GET' && p === '/ingredients') {
      let items = [...w.ingredients]
      if (q.get('filter[on_shelf]') === 'true') items = items.filter((i) => m.shelf.has(i.id))
      const ids = q.get('filter[id]')
      if (ids) {
        const set = new Set(ids.split(',').map(Number))
        items = items.filter((i) => set.has(i.id))
      }
      const name = q.get('filter[name]')
      if (name) items = items.filter((i) => nameMatches(name, i.name, m.slugOfIngredient(i)))
      // defaultSort('name'): SQLite BINARY, byte order.
      items = orderByName(items)
      return json(200, paginate(items.map((i) => ingredientResource(m, i.id, 'index')), q, 50, '/ingredients'))
    }
    if (r.method === 'GET' && (match = p.match(/^\/ingredients\/([^/]+)\/extra$/))) {
      const ing = m.findIngredient(match[1] ?? '')
      if (!ing) return notFound()
      const before = m.canMake()
      const after = m.canMakeWith(new Set([...m.shelf, ing.id]))
      const extra = [...after].filter((id) => !before.has(id))
      return json(200, {
        data: extra.map((id) => {
          const c = m.cocktail(id)
          return { id, slug: c ? m.slugOfCocktail(c) : '', name: c?.name ?? '' }
        }),
      })
    }
    if (r.method === 'GET' && (match = p.match(/^\/ingredients\/([^/]+)$/))) {
      const ing = m.findIngredient(match[1] ?? '')
      if (!ing) return notFound()
      return json(200, { data: ingredientResource(m, ing.id, 'show') })
    }

    // Cocktails.
    if (r.method === 'GET' && p === '/cocktails') {
      let items = [...w.cocktails]
      const includeTags = (q.get('include') ?? '').split(',').includes('tags')
      const ids = q.get('filter[id]')
      if (ids) {
        const set = new Set(ids.split(',').map(Number))
        items = items.filter((c) => set.has(c.id))
      }
      const name = q.get('filter[name]')
      if (name) items = items.filter((c) => nameMatches(name, c.name, m.slugOfCocktail(c)))
      const tagId = q.get('filter[tag_id]')
      if (tagId) items = items.filter((c) => c.tagIds?.includes(Number(tagId)))
      if (q.get('filter[favorites]') === 'true') items = items.filter((c) => m.favorites.has(c.id))
      if (q.get('filter[on_shelf]') === 'true') {
        const can = m.canMake()
        items = items.filter((c) => can.has(c.id))
      }
      const missing = q.get('filter[missing_ingredients]')
      if (missing !== null) {
        const n = Number(missing)
        items = items.filter((c) => (n >= 3 ? m.missingIngredients(c) >= n : m.missingIngredients(c) === n))
      }
      // defaultSort('name'): SQLite BINARY, byte order.
      items = orderByName(items)
      return json(
        200,
        paginate(items.map((c) => cocktailResource(m, c, 'index', { includeTags })), q, 25, '/cocktails'),
      )
    }
    if (r.method === 'POST' && (match = p.match(/^\/cocktails\/(\d+)\/toggle-favorite$/))) {
      const id = Number(match[1])
      // CocktailService::toggleFavorite starts with Cocktail::findOrFail
      // (app/Services/CocktailService.php:228): a drink the bar does not have
      // is a 404, and nothing is favourited.
      if (!m.cocktail(id)) return notFound()
      if (m.favorites.has(id)) m.favorites.delete(id)
      else m.favorites.add(id)
      return json(200, { data: { id, is_favorited: m.favorites.has(id) } })
    }
    if (r.method === 'GET' && (match = p.match(/^\/cocktails\/([^/]+)\/similar$/))) {
      const c = m.findCocktail(match[1] ?? '')
      if (!c) return notFound()
      const limit = Number(q.get('limit') ?? 5)
      return json(200, { data: similar(m, c.id, limit).map((id) => cocktailResource(m, m.cocktail(id)!, 'index')) })
    }
    if (r.method === 'GET' && (match = p.match(/^\/cocktails\/([^/]+)$/))) {
      const c = m.findCocktail(match[1] ?? '')
      if (!c) return notFound()
      return json(200, { data: cocktailResource(m, c, 'show') })
    }

    // The user's shelf, list and recommendations.
    if ((match = p.match(/^\/users\/(\d+)\/(.+)$/))) {
      if (Number(match[1]) !== w.user.id) return forbidden()
      const rest = match[2]
      const ids = (key: 'number' | 'object') =>
        ((body['ingredients'] as unknown[]) ?? []).map((v) =>
          key === 'number' ? Number(v) : Number((v as { id: number }).id),
        )
      if (r.method === 'GET' && rest === 'shopping-list') {
        // ShoppingListController::index — sorted by name the way PHP compares
        // strings, not by a collation; not paginated.
        return json(200, { data: shoppingListResource(m) })
      }
      if (r.method === 'POST' && rest === 'shopping-list/batch-store') {
        for (const v of (body['ingredients'] as { id: number; quantity?: number }[]) ?? []) {
          if (m.ingredient(Number(v.id))) m.list.set(Number(v.id), v.quantity ?? 1)
        }
        return { status: 204, body: '' }
      }
      if (r.method === 'POST' && rest === 'shopping-list/batch-delete') {
        for (const id of ids('object')) m.list.delete(id)
        return { status: 204, body: '' }
      }
      if (r.method === 'POST' && rest === 'ingredients/batch-store') {
        // ShelfController::batchStore also removes the shelved ingredients from
        // the user's shopping list (ShelfController.php 140-142).
        for (const id of ids('number')) {
          if (!m.ingredient(id)) continue
          m.shelf.add(id)
          m.list.delete(id)
        }
        return { status: 204, body: '' }
      }
      if (r.method === 'POST' && rest === 'ingredients/batch-delete') {
        for (const id of ids('number')) m.shelf.delete(id)
        return { status: 204, body: '' }
      }
      if (r.method === 'GET' && rest === 'ingredients/recommend') {
        return json(200, { data: m.recommendFor(m.shelf) })
      }
    }
    return undefined
  }

  private barResource() {
    const w = this.model.world
    return {
      id: w.barId,
      slug: `home-bar-${w.barId}`,
      name: 'Home bar',
      subtitle: null,
      description: null,
      invite_code: null,
      status: 'active',
      settings: [],
      // config('scout.meilisearch.host'): the compose-internal hostname, which
      // is why the browser-reachable search URL is client config (ADR-004).
      search_host: 'http://meilisearch:7700',
      search_token: SEARCH_TOKEN,
      created_at: '2026-08-02T12:00:00+00:00',
      updated_at: null,
      access: { role_id: 1, can_edit: true, can_delete: true, can_activate: true, can_deactivate: true },
      is_public: false,
    }
  }

  private async search(route: Route, url: URL): Promise<void> {
    const req = route.request()
    const match = url.pathname.match(/^\/search\/indexes\/(cocktails|ingredients)\/search$/)
    const r = this.record(req, url, 'search', url.pathname.slice('/search'.length))
    if (this.searchDown) return route.abort('connectionrefused')
    if (!match || req.method() !== 'POST') {
      this.unhandled.push(`${req.method()} ${url.pathname}`)
      return route.fulfill(json(404, { message: 'Index not found' }))
    }
    if (req.headers()['authorization'] !== `Bearer ${SEARCH_TOKEN}`) {
      return route.fulfill(json(403, { message: 'The provided API key is invalid.', code: 'invalid_api_key' }))
    }
    const { q = '', limit = 20 } = (r.body ?? {}) as { q?: string; limit?: number }
    const m = this.model
    const index = match[1] === 'cocktails' ? 'cocktails' : 'ingredients'
    const docs: Record<string, unknown>[] =
      index === 'cocktails'
        ? m.world.cocktails.map((c) => cocktailDocument(m, c))
        : m.world.ingredients.map((i) => ingredientDocument(m, i))
    const matched = docs
      .map((doc) => ({ doc, rank: attributeRank(q, doc, SEARCHABLE_ATTRIBUTES[index]) }))
      .filter((x): x is { doc: Record<string, unknown>; rank: number } => x.rank !== undefined)
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.doc)
    const hits = matched.slice(0, limit)
    // Meilisearch's public search response (POST /indexes/{uid}/search; v1.15,
    // deploy/docker-compose.yml:58). With limit/offset, estimatedTotalHits counts
    // every match, not the page, up to the index's pagination.maxTotalHits —
    // 1000 by default, and upstream sets no pagination (config/scout.php 135-157).
    const estimatedTotalHits = Math.min(matched.length, 1000)
    return route.fulfill(json(200, { hits, query: q, processingTimeMs: 1, limit, offset: 0, estimatedTotalHits }))
  }
}

// Error bodies as upstream renders them (app/Exceptions/Handler.php 52-72).
function notFound() {
  return json(404, { type: 'api_error', message: 'Resource not found.' })
}

function forbidden() {
  return json(403, { type: 'api_error', message: 'You are not authorized for this action.' })
}

/** FilterNameSearch (app/Http/Filters/FilterNameSearch.php): every word of the
 *  term must appear in the lowercased name or the slug. Stemming is not modelled. */
function nameMatches(term: string, name: string, slug: string): boolean {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => name.toLowerCase().includes(w) || slug.includes(w))
}

/** The lowercased words of an attribute's value: a string, an array of them, or absent. */
function tokensOf(value: unknown): string[] {
  const parts: unknown[] = Array.isArray(value) ? value : [value]
  return parts
    .filter((v): v is string => typeof v === 'string')
    .flatMap((v) => v.toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean)
}

/**
 * Meilisearch's default matching and ranking, simplified. A document matches
 * when each query word prefixes a word of one of the index's searchable
 * attributes (SEARCHABLE_ATTRIBUTES, from config/scout.php). Its rank is the
 * attribute rule's: for each query word, the position in that list of the
 * first attribute it matches, summed, so a name match outranks a tag or an
 * ingredient match. Lower ranks first; equal ranks keep index order. The
 * typo, proximity, word-position and exactness rules are not modelled.
 * Undefined when the document does not match.
 */
function attributeRank(q: string, doc: Record<string, unknown>, attributes: readonly string[]): number | undefined {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const tokens = attributes.map((a) => tokensOf(doc[a]))
  let rank = 0
  for (const w of words) {
    const at = tokens.findIndex((ts) => ts.some((t) => t.startsWith(w)))
    if (at === -1) return undefined
    rank += at
  }
  return rank
}

/** CocktailService::getSimilarCocktails: drop the last non-optional ingredient
 *  in turn and collect cocktails containing all that remain, up to `limit`. */
function similar(m: BarModel, id: number, limit: number): number[] {
  const ref = m.cocktail(id)
  if (!ref) return []
  const ingredients = ref.lines.filter((l) => !l.optional).map((l) => l.ingredientId)
  const found: number[] = []
  while (ingredients.length > 0) {
    ingredients.pop()
    if (ingredients.length === 0) break
    for (const c of m.world.cocktails) {
      if (c.id === id || found.includes(c.id)) continue
      const own = new Set(c.lines.filter((l) => !l.optional).map((l) => l.ingredientId))
      if (ingredients.every((i) => own.has(i))) found.push(c.id)
    }
    if (found.length > limit) return found.slice(0, limit)
  }
  return found
}

/** Laravel's LengthAwarePaginator JSON (ResourceCollection over a paginator). */
function paginate<T>(items: T[], q: URLSearchParams, defaultPerPage: number, path: string) {
  const perPage = Math.max(1, Number(q.get('per_page') ?? defaultPerPage))
  const total = items.length
  const lastPage = Math.max(1, Math.ceil(total / perPage))
  const page = Math.max(1, Number(q.get('page') ?? 1))
  const data = items.slice((page - 1) * perPage, page * perPage)
  const base = `http://localhost/api${path}`
  const pageUrl = (n: number) => {
    const qs = new URLSearchParams(q)
    qs.delete('page')
    qs.set('page', String(n))
    return `${base}?${qs.toString()}`
  }
  const pages = Array.from({ length: lastPage }, (_, i) => i + 1)
  const links = [
    { url: page > 1 ? pageUrl(page - 1) : null, label: '&laquo; Previous', page: page > 1 ? page - 1 : null, active: false },
    ...pages.map((n) => ({ url: pageUrl(n), label: String(n), page: n, active: n === page })),
    { url: page < lastPage ? pageUrl(page + 1) : null, label: 'Next &raquo;', page: page < lastPage ? page + 1 : null, active: false },
  ]
  return {
    data,
    links: {
      first: pageUrl(1),
      last: pageUrl(lastPage),
      prev: page > 1 ? pageUrl(page - 1) : null,
      next: page < lastPage ? pageUrl(page + 1) : null,
    },
    meta: {
      current_page: page,
      from: data.length > 0 ? (page - 1) * perPage + 1 : null,
      last_page: lastPage,
      links,
      path: base,
      per_page: perPage,
      to: data.length > 0 ? (page - 1) * perPage + data.length : null,
      total,
    },
  }
}
