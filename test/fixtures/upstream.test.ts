import type { Page, Route } from '@playwright/test'
import { describe, expect, it } from 'vitest'
import { FakeBar, ISSUED_TOKEN } from '../../e2e/support/fake-bar'
import { BarModel, cocktailIngredientResource, cocktailResource, ingredientResource, slugify } from './upstream'
import { C, I, defaultWorld } from './world'

// The fake is a model of Bar Assistant v5.15.3 (ADR-011); these pin the model
// to the upstream behaviour it cites, so a journey cannot pass against a fake
// that has quietly become kinder than the API.

const model = () => new BarModel(defaultWorld())

/**
 * What the fake answers a signed-in GET, through the route handler it installs
 * on a page (FakeBar.install), with the issued token and the bar header the
 * client sends. No browser: the handler is called with a stand-in route.
 */
async function served(bar: FakeBar, path: string): Promise<{ status: number; body: unknown }> {
  const origin = 'http://127.0.0.1:4173'
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
      url: () => `${origin}/bar/api${path}`,
      method: () => 'GET',
      headers: () => ({
        authorization: `Bearer ${ISSUED_TOKEN}`,
        'bar-assistant-bar-id': String(bar.model.world.barId),
      }),
      postData: () => null,
    }),
    fulfill: async (a: { status: number; body: string }) => {
      answer = a
    },
  }
  if (!handler) throw new Error('the fake installed no route handler')
  await handler(route as unknown as Route)
  if (!answer) throw new Error(`the fake did not answer GET ${path}`)
  return { status: answer.status, body: JSON.parse(answer.body) as unknown }
}

/** The ingredient names of a shopping-list response, in the order served. */
function listNames(body: unknown): string[] {
  return (body as { data: { ingredient: { name: string } }[] }).data.map((row) => row.ingredient.name)
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

describe('slugs', () => {
  it('follow Str::slug plus the bar id, so the curated roster resolves', () => {
    expect(slugify("Dark 'n' Stormy")).toBe('dark-n-stormy')
    expect(model().slugOfIngredient(model().ingredient(I.angostura)!)).toBe('angostura-aromatic-bitters-1')
  })
})
