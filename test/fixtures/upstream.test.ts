import type { Page, Route } from '@playwright/test'
import { describe, expect, it } from 'vitest'
import { FakeBar, ISSUED_TOKEN, SEARCH_TOKEN } from '../../e2e/support/fake-bar'
import { BarModel, cocktailIngredientResource, cocktailResource, ingredientResource, slugify } from './upstream'
import { C, I, defaultWorld, type CocktailSeed } from './world'

// The fake is a model of Bar Assistant v5.15.3 (ADR-011); these pin the model
// to the upstream behaviour it cites, so a journey cannot pass against a fake
// that has quietly become kinder than the API.

const model = () => new BarModel(defaultWorld())

/**
 * What the fake answers a signed-in request, through the route handler it
 * installs on a page (FakeBar.install). A path under /search/ goes to
 * Meilisearch with the scoped key; any other is under /bar/api, with the
 * issued token and the bar header the client sends. No browser: the handler
 * is called with a stand-in route. GET unless `init` says otherwise.
 */
async function served(
  bar: FakeBar,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const origin = 'http://127.0.0.1:4173'
  const method = init.method ?? 'GET'
  const search = path.startsWith('/search/')
  let handler: ((route: Route) => Promise<void>) | undefined
  const page = {
    route: async (_url: string, h: (route: Route) => Promise<void>) => {
      handler = h
    },
  }
  await bar.install(page as unknown as Page, origin)
  let answer: { status: number; body: string } | undefined
  const route = {
    request: () => ({
      url: () => (search ? `${origin}${path}` : `${origin}/bar/api${path}`),
      method: () => method,
      headers: (): Record<string, string> =>
        search
          ? { authorization: `Bearer ${SEARCH_TOKEN}` }
          : {
              authorization: `Bearer ${ISSUED_TOKEN}`,
              'bar-assistant-bar-id': String(bar.model.world.barId),
            },
      postData: () => (init.body === undefined ? null : JSON.stringify(init.body)),
    }),
    fulfill: async (a: { status: number; body: string }) => {
      answer = a
    },
  }
  if (!handler) throw new Error('the fake installed no route handler')
  await handler(route as unknown as Route)
  if (!answer) throw new Error(`the fake did not answer ${method} ${path}`)
  return { status: answer.status, body: answer.body === '' ? null : (JSON.parse(answer.body) as unknown) }
}

/** The ingredient names of a shopping-list response, in the order served. */
function listNames(body: unknown): string[] {
  return (body as { data: { ingredient: { name: string } }[] }).data.map((row) => row.ingredient.name)
}

/** The names of a `data` array (tags, ingredients, cocktails), in the order served. */
function dataNames(body: unknown): string[] {
  return (body as { data: { name: string }[] }).data.map((row) => row.name)
}

/** The names of a Meilisearch response's hits, in rank order. */
function hitNames(body: unknown): string[] {
  return (body as { hits: { name: string }[] }).hits.map((hit) => hit.name)
}

/** A drink with one gin line, named for an ordering case. */
function drink(id: number, name: string): CocktailSeed {
  return { id, name, instructions: '', lines: [{ ingredientId: I.gin, amount: 50, units: 'ml' }] }
}

describe('materialized_path', () => {
  it('is ancestor ids, root first, slash-joined with a trailing slash; null for a root', () => {
    const m = model()
    expect(m.materializedPath(I.spirits)).toBeNull()
    expect(m.materializedPath(I.whisky)).toBe('1/')
    expect(m.materializedPath(I.laphroaig10)).toBe('1/5/6/7/')
  })
})

describe('can-make (getCocktailsByIngredients)', () => {
  it('counts a held child toward a recipe calling its direct parent', () => {
    const m = model()
    m.shelf.add(I.honeySyrup)
    // Penicillin calls Islay Scotch; the shelf holds Laphroaig 10, its child.
    expect(m.canMake().has(C.penicillin)).toBe(true)
  })

  it('does not count a held grandchild toward a recipe calling an intermediate ancestor', () => {
    // Rob Roy calls Scotch whisky; Laphroaig 10 sits two levels below it.
    expect(model().canMake().has(C.robRoy)).toBe(false)
  })

  it('counts a held descendant toward a recipe calling its root', () => {
    const m = model()
    m.world.cocktails.push({
      id: 99,
      name: 'Neat pour',
      instructions: '',
      lines: [{ ingredientId: I.spirits, amount: 60, units: 'ml' }],
    })
    expect(m.canMake().has(99)).toBe(true)
  })

  it('ignores optional lines and honours is_specified and substitutes', () => {
    const m = model()
    expect(m.canMake().has(C.whiskeySour)).toBe(true) // egg white is optional
    m.shelf.add(I.gingerBeer)
    expect(m.canMake().has(C.darkNStormy)).toBe(false) // dark rum is specified
    m.shelf.add(I.mint)
    m.shelf.delete(I.clubSoda)
    expect(m.canMake().has(C.mojito)).toBe(true) // tonic substitutes for soda
  })

  it('answers the default world with five pours', () => {
    expect([...model().canMake()].sort((a, b) => a - b)).toEqual([
      C.daiquiri,
      C.whiskeySour,
      C.gimlet,
      C.oldFashioned,
      C.ginTonic,
    ])
  })
})

describe('missing_ingredients (CocktailQueryFilter)', () => {
  it('counts optional lines and exact matches only, so the two server sets overlap', () => {
    const m = model()
    const sour = m.cocktail(C.whiskeySour)!
    expect(m.missingIngredients(sour)).toBe(1) // the optional egg white
    expect(m.canMake().has(C.whiskeySour)).toBe(true)
    // A parent-called line held as a child brand is still "missing" exactly.
    expect(m.missingIngredients(m.cocktail(C.robRoy)!)).toBe(1)
  })

  it('counts a held line once per substitute (the substitutes join repeats it)', () => {
    const m = model()
    const mojito = m.cocktail(C.mojito)!
    mojito.lines[4]!.substituteIds = [I.tonic, I.gingerBeer]
    // Mint is genuinely missing, but the held soda line has two substitutes,
    // so it is counted twice and the drink reads as missing nothing.
    expect(m.shelf.has(I.mint)).toBe(false)
    expect(m.missingIngredients(mojito)).toBe(0)
  })
})

describe('resource shapes', () => {
  it('omits the variant, substitute and complex flags on the index and emits them on show', () => {
    const m = model()
    const line = m.cocktail(C.penicillin)!.lines[0]!
    const index = cocktailIngredientResource(m, line, 1, 'index')
    const show = cocktailIngredientResource(m, line, 1, 'show')
    expect('in_shelf_as_variant' in index).toBe(false)
    expect('in_shelf_as_substitute' in index).toBe(false)
    expect(show).toMatchObject({ in_shelf: false, in_shelf_as_variant: true, in_shelf_as_substitute: false })
  })

  it('reports a variant at any depth on show, even where the matcher disagrees', () => {
    const m = model()
    const scotchLine = m.cocktail(C.robRoy)!.lines[0]!
    expect(cocktailIngredientResource(m, scotchLine, 1, 'show')).toMatchObject({ in_shelf_as_variant: true })
    expect(cocktailResource(m, m.cocktail(C.robRoy)!, 'show').in_shelf).toBe(false)
  })

  it('emits tags on the index only when included, and garnish as an empty string when absent', () => {
    const m = model()
    const gimlet = m.cocktail(C.gimlet)!
    expect('tags' in cocktailResource(m, gimlet, 'index')).toBe(false)
    expect(cocktailResource(m, gimlet, 'index', { includeTags: true }).tags).toEqual([
      { id: 101, name: 'family:sour' },
    ])
    expect(cocktailResource(m, gimlet, 'index').garnish).toBe('')
  })

  it('builds variants_in_shelf from the bar shelf, which Barback never writes, so it is empty', () => {
    // CocktailIngredientResource.php:58 emits it, on show only, from
    // Ingredient::barShelfVariants (Ingredient.php:398-404): descendants on the
    // BAR shelf. in_shelf_as_variant (66-69) reads the user shelf instead.
    const m = model()
    // Penicillin calls Islay Scotch; the user shelf holds Laphroaig 10, its child.
    const line = m.cocktail(C.penicillin)!.lines[0]!
    const show = cocktailIngredientResource(m, line, 1, 'show')
    expect(show).toMatchObject({ in_shelf_as_variant: true, in_bar_shelf_as_variant: false })
    expect(show).toHaveProperty('variants_in_shelf', [])
    expect('variants_in_shelf' in cocktailIngredientResource(m, line, 1, 'index')).toBe(false)
  })

  it('carries parent_ingredient only on the ingredient show endpoint', () => {
    const m = model()
    expect('parent_ingredient' in ingredientResource(m, I.laphroaig10, 'index').hierarchy).toBe(false)
    expect(ingredientResource(m, I.laphroaig10, 'show').hierarchy.parent_ingredient).toEqual({
      id: I.islayScotch,
      slug: 'islay-scotch-1',
      name: 'Islay Scotch',
    })
  })

  it('HTML-escapes instructions and garnish the way e() does', () => {
    const m = model()
    const c = { ...m.cocktail(C.gimlet)!, instructions: `Shake & strain; don't "bruise" it <gently>`, garnish: "Lime's wheel" }
    const r = cocktailResource(m, c, 'show')
    expect(r.instructions).toBe('Shake &amp; strain; don&#039;t &quot;bruise&quot; it &lt;gently&gt;')
    expect(r.garnish).toBe('Lime&#039;s wheel')
  })

  it('converts ml to oz at ÷30, rounded to four places', () => {
    const m = model()
    const lime = m.cocktail(C.margarita)!.lines[1]!
    expect(cocktailIngredientResource(m, lime, 2, 'index').formatted.oz.amount).toBe(0.8333)
  })
})

describe('shopping list (ShoppingListController::index)', () => {
  // ShoppingListController.php:38 is Collection::sortBy('ingredient.name'):
  // asort with SORT_REGULAR, so PHP's own string comparison, not a collation.
  const fake = () => new FakeBar(defaultWorld())

  it('sorts by name byte-wise: capitals before any lowercase letter, accented letters after both', async () => {
    const bar = fake()
    bar.model.ingredient(I.limeJuice)!.name = 'lime juice' // as a member typed it
    bar.model.world.ingredients.push({ id: 90, name: 'Élixir végétal', parentId: I.liqueurs })
    for (const id of [I.limeJuice, I.tonic, 90, I.campari]) bar.model.list.set(id, 1)
    const { status, body } = await served(bar, '/users/1/shopping-list')
    expect(status).toBe(200)
    expect(listNames(body)).toEqual(['Campari', 'Tonic', 'lime juice', 'Élixir végétal'])
  })

  it('compares two numeric names as numbers', async () => {
    const bar = fake()
    bar.model.world.ingredients.push({ id: 90, name: '151', parentId: I.rum }, { id: 91, name: '43', parentId: I.liqueurs })
    for (const id of [90, 91]) bar.model.list.set(id, 1)
    expect(listNames((await served(bar, '/users/1/shopping-list')).body)).toEqual(['43', '151'])
  })
})

describe('name order on /tags, /ingredients and /cocktails (SQLite ORDER BY name)', () => {
  // TagController::index is Tag::orderBy('name') (TagController.php:29); the
  // ingredient and cocktail indexes defaultSort('name')
  // (IngredientQueryFilter.php:82, CocktailQueryFilter.php:190). The image
  // runs on SQLite (resources/docker/dist/init.sh:19-24) and no migration or
  // config declares a collation, so ORDER BY name uses SQLite's BINARY
  // collation: memcmp over the UTF-8 bytes, then the shorter first. Every
  // capital before every lowercase letter, an accented letter after both, and
  // numerals compared as text, not as numbers (unlike the shopping list's PHP
  // sort above).
  const fake = () => new FakeBar(defaultWorld())

  it('GET /tags orders names byte-wise', async () => {
    const bar = fake()
    bar.model.world.tags.push(
      { id: 120, name: 'after dinner' },
      { id: 121, name: 'Été' },
      { id: 122, name: '43' },
      { id: 123, name: '151' },
    )
    const { status, body } = await served(bar, '/tags')
    expect(status).toBe(200)
    expect(dataNames(body)).toEqual([
      '151',
      '43',
      'Classic',
      'after dinner',
      'family:dessert',
      'family:highball',
      'family:sour',
      'family:spirit-forward',
      'family:tiki',
      'Été',
    ])
  })

  it('GET /ingredients orders names byte-wise', async () => {
    const bar = fake()
    bar.model.world.ingredients.push(
      { id: 90, name: 'lime cordial', parentId: I.juices },
      { id: 91, name: 'Élixir végétal', parentId: I.liqueurs },
      { id: 92, name: '43', parentId: I.liqueurs },
      { id: 93, name: '151', parentId: I.rum },
    )
    bar.model.shelf.clear()
    for (const id of [90, 91, 92, 93, I.campari]) bar.model.shelf.add(id)
    const { status, body } = await served(bar, '/ingredients?filter[on_shelf]=true&per_page=200')
    expect(status).toBe(200)
    expect(dataNames(body)).toEqual(['151', '43', 'Campari', 'lime cordial', 'Élixir végétal'])
  })

  it('GET /cocktails orders names byte-wise', async () => {
    const bar = fake()
    bar.model.world.cocktails.push(
      drink(90, 'aperitivo spritz'),
      drink(91, 'Été sour'),
      drink(92, '43'),
      drink(93, '151'),
      drink(94, 'Zombie'),
    )
    const { status, body } = await served(bar, `/cocktails?filter[id]=90,91,92,93,94,${C.daiquiri}`)
    expect(status).toBe(200)
    expect(dataNames(body)).toEqual(['151', '43', 'Daiquiri', 'Zombie', 'aperitivo spritz', 'Été sour'])
  })
})

describe('POST /cocktails/{id}/toggle-favorite (CocktailController::toggleFavorite)', () => {
  const fake = () => new FakeBar(defaultWorld())

  it('toggles a drink the bar has and answers which way it went', async () => {
    const bar = fake()
    const on = await served(bar, `/cocktails/${C.negroni}/toggle-favorite`, { method: 'POST' })
    expect(on).toEqual({ status: 200, body: { data: { id: C.negroni, is_favorited: true } } })
    const off = await served(bar, `/cocktails/${C.negroni}/toggle-favorite`, { method: 'POST' })
    expect(off).toEqual({ status: 200, body: { data: { id: C.negroni, is_favorited: false } } })
  })

  it('answers 404 for a drink id that does not exist, and favourites nothing', async () => {
    // CocktailService::toggleFavorite starts with Cocktail::findOrFail
    // (app/Services/CocktailService.php:228); the ModelNotFoundException
    // renders as NotFoundHttpException (app/Exceptions/Handler.php:64-67).
    // findOrFail is not scoped to a bar: a drink in another bar is found. The
    // fake models one bar, so 999 is an id that does not exist.
    const bar = fake()
    const { status, body } = await served(bar, '/cocktails/999/toggle-favorite', { method: 'POST' })
    expect(status).toBe(404)
    expect(body).toEqual({ type: 'api_error', message: 'Resource not found.' })
    expect(bar.model.favorites.has(999)).toBe(false)
  })
})

describe('Meilisearch search (config/scout.php index-settings)', () => {
  // The image applies config/scout.php's index settings on boot
  // (scout:sync-index-settings, resources/docker/dist/init.sh:38), which list
  // the searchable attributes in rank order: cocktails name, tags,
  // description, date, short_ingredients (config/scout.php:139-145);
  // ingredients name, description, category, origin (150-155). A query
  // matches any of them, and under Meilisearch's default ranking rules, which
  // upstream leaves alone, a match in an earlier attribute ranks first, the
  // rules before it tied; equal ranks keep index order.
  const fake = () => new FakeBar(defaultWorld())
  const search = (bar: FakeBar, index: 'cocktails' | 'ingredients', q: string) =>
    served(bar, `/search/indexes/${index}/search`, { method: 'POST', body: { q, limit: 12 } })

  it('finds a drink by an ingredient it pours (short_ingredients)', async () => {
    const { status, body } = await search(fake(), 'cocktails', 'campari')
    expect(status).toBe(200)
    expect(hitNames(body)).toEqual(['Negroni'])
  })

  it('finds a drink by its tags, ranking a name match above them', async () => {
    const { body } = await search(fake(), 'cocktails', 'sour')
    expect(hitNames(body)).toEqual(['Whiskey Sour', 'Daiquiri', 'Margarita', 'Gimlet', 'Penicillin'])
    expect(body).toMatchObject({ estimatedTotalHits: 5 })
  })

  it('finds an ingredient by its category, the names of its ancestors', async () => {
    const { status, body } = await search(fake(), 'ingredients', 'beverages')
    expect(status).toBe(200)
    expect(hitNames(body)).toEqual(['Beverages', 'Club soda', 'Tonic', 'Ginger beer'])
  })
})

describe('slugs', () => {
  it('follow Str::slug plus the bar id, so the curated roster resolves', () => {
    expect(slugify("Dark 'n' Stormy")).toBe('dark-n-stormy')
    expect(model().slugOfIngredient(model().ingredient(I.angostura)!)).toBe('angostura-aromatic-bitters-1')
  })
})
