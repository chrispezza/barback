// Upstream-shaped resources built from the fixture world (ADR-011). Shapes and
// semantics follow Bar Assistant at the pinned tag (ADR-001, v5.15.3); paths
// below are relative to the reference clone (../bar-assistant-reference) and
// cite where a field's presence or a rule comes from. Where upstream behaves
// oddly, the model reproduces the oddity — a fake that is kinder than the API
// would let journeys pass against a server that does not exist.

import type { CocktailLineSeed, CocktailSeed, IngredientSeed, WorldSeed } from './world'

const STAMP = '2026-08-02T12:00:00+00:00'

/** Laravel's e() (htmlspecialchars, ENT_QUOTES, double-encode on): upstream
 *  escapes cocktail instructions, garnish and description on output
 *  (app/Http/Resources/CocktailResource.php 96-98), so the client receives
 *  entities, not the stored text. */
export function laravelEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Laravel Str::slug for the names in the world: lowercase, apostrophes dropped,
 *  every other run of non-alphanumerics a single dash. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type Endpoint = 'index' | 'show'

export interface IngredientBasic {
  id: number
  slug: string
  name: string
}

/** Mutable state of the bar the fake serves; the seeds are never mutated. */
export class BarModel {
  readonly world: WorldSeed
  readonly shelf: Set<number>
  /** Shopping list: ingredient id → quantity, in insertion order. */
  readonly list: Map<number, number>
  readonly favorites: Set<number>

  constructor(world: WorldSeed) {
    this.world = world
    this.shelf = new Set(world.shelf)
    this.list = new Map(world.list.map((id) => [id, 1]))
    this.favorites = new Set(world.favorites)
  }

  ingredient(id: number): IngredientSeed | undefined {
    return this.world.ingredients.find((i) => i.id === id)
  }

  cocktail(id: number): CocktailSeed | undefined {
    return this.world.cocktails.find((c) => c.id === id)
  }

  slugOfIngredient(i: IngredientSeed): string {
    return `${slugify(i.name)}-${this.world.barId}`
  }

  slugOfCocktail(c: CocktailSeed): string {
    return `${slugify(c.name)}-${this.world.barId}`
  }

  /** `/cocktails/{idOrSlug}` and `/ingredients/{idOrSlug}` match slug or id
   *  (CocktailController::show, IngredientController::show). */
  findCocktail(idOrSlug: string): CocktailSeed | undefined {
    return this.world.cocktails.find(
      (c) => this.slugOfCocktail(c) === idOrSlug || String(c.id) === idOrSlug,
    )
  }

  findIngredient(idOrSlug: string): IngredientSeed | undefined {
    return this.world.ingredients.find(
      (i) => this.slugOfIngredient(i) === idOrSlug || String(i.id) === idOrSlug,
    )
  }

  basic(id: number): IngredientBasic {
    const i = this.ingredient(id)
    if (!i) throw new Error(`fixture world has no ingredient ${id}`)
    return { id: i.id, slug: this.slugOfIngredient(i), name: i.name }
  }

  /** Ancestor ids, root first. */
  ancestorIds(id: number): number[] {
    const chain: number[] = []
    let parent = this.ingredient(id)?.parentId
    while (parent !== undefined) {
      chain.unshift(parent)
      parent = this.ingredient(parent)?.parentId
    }
    return chain
  }

  /** MaterializedPath::toStringPath (app/Models/ValueObjects/MaterializedPath.php):
   *  ancestor ids root first, "/"-joined with a trailing "/"; null for a root. */
  materializedPath(id: number): string | null {
    const chain = this.ancestorIds(id)
    return chain.length === 0 ? null : `${chain.join('/')}/`
  }

  /** HasManyDescendants (app/Relations): every ingredient whose path contains
   *  "/<id>/" when wrapped in slashes — descendants at any depth. */
  descendantIds(id: number): number[] {
    return this.world.ingredients
      .filter((i) => this.ancestorIds(i.id).includes(id))
      .map((i) => i.id)
  }

  /**
   * CocktailService::getCocktailsByIngredients (app/Services/CocktailService.php
   * 255-311): a non-optional line matches when its ingredient is held, or a
   * substitute is held, or — when the line is not `is_specified` — a held
   * ingredient's parent is the line's ingredient OR its materialized path starts
   * with "<line ingredient id>/". The second clause only reaches every
   * descendant when the called ingredient is a root; a grandchild of a
   * mid-level ingredient does not match. Optional lines are ignored. The world
   * has no complex ingredients, so that resolution step is a no-op here.
   */
  lineMatches(line: CocktailLineSeed, held: Set<number>): boolean {
    if (held.has(line.ingredientId)) return true
    if ((line.substituteIds ?? []).some((s) => held.has(s))) return true
    if (line.isSpecified) return false
    for (const h of held) {
      const ing = this.ingredient(h)
      if (!ing) continue
      if (ing.parentId === line.ingredientId) return true
      if ((this.materializedPath(h) ?? '').startsWith(`${line.ingredientId}/`)) return true
    }
    return false
  }

  canMakeWith(held: Set<number>): Set<number> {
    if (held.size === 0) return new Set()
    return new Set(
      this.world.cocktails
        .filter((c) => c.lines.filter((l) => !l.optional).every((l) => this.lineMatches(l, held)))
        .map((c) => c.id),
    )
  }

  canMake(): Set<number> {
    return this.canMakeWith(this.shelf)
  }

  /**
   * The `missing_ingredients` column (app/Http/Filters/CocktailQueryFilter.php
   * 224-235): every line (optional ones included) minus the count of joined
   * rows whose ingredient is held EXACTLY. No hierarchy, no substitutes — and
   * the substitutes left join repeats a line once per substitute, so a held
   * line with k substitutes is counted k times.
   */
  missingIngredients(c: CocktailSeed): number {
    const total = c.lines.length
    let held = 0
    for (const l of c.lines) {
      if (this.shelf.has(l.ingredientId)) held += Math.max(1, l.substituteIds?.length ?? 0)
    }
    return total - held
  }

  /** Ingredient::userShelfVariants: descendants at any depth that are held. */
  shelfVariants(id: number): number[] {
    return this.descendantIds(id).filter((d) => this.shelf.has(d))
  }

  /** `cocktails_count` (withCount('cocktails')): cocktails with a line that
   *  names this ingredient exactly. */
  cocktailsCount(id: number): number {
    return this.world.cocktails.filter((c) => c.lines.some((l) => l.ingredientId === id)).length
  }

  /** IngredientService::getIngredientsForPossibleCocktails: ingredients not in
   *  `held`, ranked by distinct cocktails that use them (any line), top 10. */
  recommendFor(held: Set<number>): { id: number; slug: string; name: string; potential_cocktails: number }[] {
    return this.world.ingredients
      .filter((i) => !held.has(i.id))
      .map((i) => ({ ...this.basic(i.id), potential_cocktails: this.cocktailsCount(i.id) }))
      .filter((r) => r.potential_cocktails > 0)
      .sort((a, b) => b.potential_cocktails - a.potential_cocktails || a.id - b.id)
      .slice(0, 10)
  }
}

/** AmountFormats + recipe-utils: ml → oz is ÷30, ml → cl ÷10, a dash is
 *  0.3125 ml; converted values are rounded to 4 places. Units the converter
 *  does not know ("leaves") pass through unconverted. */
function formatted(line: CocktailLineSeed, name: string) {
  const toMl: Record<string, number> = { ml: 1, cl: 10, oz: 30, dash: 0.3125, barspoon: 5 }
  const perMl = toMl[line.units]
  const round4 = (n: number) => Math.round(n * 10000) / 10000
  const fmt = (units: 'ml' | 'oz' | 'cl', div: number) => {
    const amount = perMl === undefined ? line.amount : round4((line.amount * perMl) / div)
    const u = perMl === undefined ? line.units : units
    return {
      amount,
      amount_max: null,
      units: u,
      full_text: `${amount} ${u} ${name}${line.optional ? ' (optional)' : ''}`,
    }
  }
  return { ml: fmt('ml', 1), oz: fmt('oz', 30), cl: fmt('cl', 10) }
}

/**
 * CocktailIngredientResource (app/Http/Resources/CocktailIngredientResource.php).
 * The index and `similar` load only `ingredients.ingredient.bar`
 * (CocktailQueryFilter::__construct, CocktailController::similar), so the
 * variant, substitute and complex flags and the substitutes list are ABSENT
 * there; `show` runs Cocktail::loadDefaultRelations, which loads descendants,
 * substitutes and ingredient parts, so they are present.
 */
export function cocktailIngredientResource(
  m: BarModel,
  line: CocktailLineSeed,
  sort: number,
  endpoint: Endpoint,
) {
  const ing = m.basic(line.ingredientId)
  const base = {
    sort,
    amount: line.amount,
    amount_max: null,
    units: line.units,
    optional: line.optional === true,
    ingredient: ing,
    note: null,
    is_specified: line.isSpecified === true,
    formatted: formatted(line, ing.name),
    in_shelf: m.shelf.has(line.ingredientId),
    // The fixture user is the bar's only member, so the bar shelf is empty:
    // Barback writes the user shelf (ShelfController::batchStore), never the
    // bar shelf (bar_ingredients).
    in_bar_shelf: false,
  }
  if (endpoint === 'index') return base
  const variants = m.shelfVariants(line.ingredientId)
  return {
    ...base,
    substitutes: (line.substituteIds ?? []).map((id) => ({
      ingredient: m.basic(id),
      amount: null,
      amount_max: null,
      units: null,
      in_shelf: m.shelf.has(id),
      in_bar_shelf: false,
    })),
    variants_in_shelf: variants.map((id) => m.basic(id)),
    in_shelf_as_variant: !line.isSpecified && variants.length > 0,
    in_shelf_as_substitute: (line.substituteIds ?? []).some((id) => m.shelf.has(id)),
    in_shelf_as_complex_ingredient: false,
    in_bar_shelf_as_substitute: false,
    in_bar_shelf_as_complex_ingredient: false,
    in_bar_shelf_as_variant: false,
  }
}

/** CocktailResource (app/Http/Resources/CocktailResource.php). `tags` only when
 *  loaded: `include=tags` on the index, always on show. */
export function cocktailResource(
  m: BarModel,
  c: CocktailSeed,
  endpoint: Endpoint,
  opts: { includeTags?: boolean } = {},
) {
  const tagged = endpoint === 'show' || opts.includeTags === true
  const tags = (c.tagIds ?? [])
    .map((id) => m.world.tags.find((t) => t.id === id))
    .filter((t) => t !== undefined)
    .map((t) => ({ id: t.id, name: t.name }))
  const volume = c.lines.reduce((sum, l) => sum + (l.units === 'ml' ? l.amount : 0), 0)
  return {
    id: c.id,
    name: c.name,
    slug: m.slugOfCocktail(c),
    instructions: laravelEscape(c.instructions),
    // e(null) is '' upstream, not null.
    garnish: laravelEscape(c.garnish ?? ''),
    description: '',
    source: null,
    public_id: null,
    public_at: null,
    ...(endpoint === 'show' ? { images: [] } : {}),
    ...(tagged ? { tags } : {}),
    ...(endpoint === 'show' ? { rating: { user: null, average: 0, total_votes: 0 } } : {}),
    ingredients: c.lines.map((l, i) => cocktailIngredientResource(m, l, i + 1, endpoint)),
    created_at: STAMP,
    updated_at: null,
    abv: null,
    volume_ml: volume,
    in_shelf: m.canMake().has(c.id),
    in_bar_shelf: false,
    is_favorited: m.favorites.has(c.id),
    access: { can_edit: true, can_delete: true, can_rate: true, can_add_note: true },
    ...(endpoint === 'show' ? { parent_cocktail: null, varieties: [] } : {}),
    year: null,
  }
}

/**
 * IngredientResource (app/Http/Resources/IngredientResource.php). The index
 * (IngredientQueryFilter) adds `withCount('cocktails')` but loads no hierarchy
 * relations, so `hierarchy.parent_ingredient`, descendants, ancestors and
 * `in_shelf_as_variant` are ABSENT there; show (IngredientController::show)
 * loads them all, plus the count.
 */
export function ingredientResource(m: BarModel, id: number, endpoint: 'index'): ReturnType<typeof ingredientIndex>
export function ingredientResource(m: BarModel, id: number, endpoint: 'show'): ReturnType<typeof ingredientShow>
export function ingredientResource(m: BarModel, id: number, endpoint: Endpoint) {
  return endpoint === 'show' ? ingredientShow(m, id) : ingredientIndex(m, id)
}

function seedOf(m: BarModel, id: number): IngredientSeed {
  const i = m.ingredient(id)
  if (!i) throw new Error(`fixture world has no ingredient ${id}`)
  return i
}

function ingredientIndex(m: BarModel, id: number) {
  const i = seedOf(m, id)
  return {
    id: i.id,
    slug: m.slugOfIngredient(i),
    name: i.name,
    strength: i.strength ?? 0,
    description: '',
    origin: null,
    created_at: STAMP,
    updated_at: null,
    materialized_path: m.materializedPath(id),
    hierarchy: { root_ingredient_id: m.ancestorIds(id)[0] ?? null },
    color: null,
    cocktails_count: m.cocktailsCount(id),
    access: { can_edit: true, can_delete: true },
    in_shelf: m.shelf.has(id),
    in_bar_shelf: false,
    in_shopping_list: m.list.has(id),
    calculator_id: null,
    sugar_g_per_ml: null,
    acidity: null,
    distillery: null,
    units: null,
  }
}

function ingredientShow(m: BarModel, id: number) {
  const i = seedOf(m, id)
  const ancestors = m.ancestorIds(id)
  const index = ingredientIndex(m, id)
  return {
    ...index,
    hierarchy: {
      ...index.hierarchy,
      ...(i.parentId !== undefined
        ? { path_to_self: ancestors.map((a) => m.ingredient(a)?.name).join(' > ') }
        : {}),
      parent_ingredient: i.parentId === undefined ? null : m.basic(i.parentId),
      descendants: m.descendantIds(id).map((d) => m.basic(d)),
      ancestors: ancestors.map((a) => m.basic(a)),
    },
    images: [],
    cocktails_as_substitute_count: 0,
    in_shelf_as_variant: m.shelfVariants(id).length > 0,
    in_bar_shelf_as_variant: false,
    used_as_substitute_for: [],
    can_be_substituted_with: [],
    ingredient_parts: [],
    prices: [],
  }
}

/** Meilisearch documents (Cocktail::toSearchableArray, Ingredient::toSearchableArray). */
export function cocktailDocument(m: BarModel, c: CocktailSeed) {
  return {
    id: c.id,
    name: c.name,
    slug: m.slugOfCocktail(c),
    description: '',
    image_url: null,
    short_ingredients: c.lines.map((l) => m.ingredient(l.ingredientId)?.name ?? ''),
    tags: (c.tagIds ?? []).map((id) => m.world.tags.find((t) => t.id === id)?.name ?? ''),
    bar_id: m.world.barId,
  }
}

export function ingredientDocument(m: BarModel, i: IngredientSeed) {
  return {
    id: i.id,
    slug: m.slugOfIngredient(i),
    name: i.name,
    image_url: null,
    description: '',
    category: m.ancestorIds(i.id).map((a) => m.ingredient(a)?.name).join(' > ') || null,
    bar_id: m.world.barId,
    units: null,
  }
}
