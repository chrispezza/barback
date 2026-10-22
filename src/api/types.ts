// Typed subset of the Bar Assistant v5.15.3 resources Barback consumes.
// Field names mirror the API exactly (snake_case) — no client-side renaming.

export interface ListResponse<T> {
  data: T[];
  meta?: { total: number; current_page: number; last_page: number };
}

export interface ItemResponse<T> {
  data: T;
}

export interface Profile {
  id: number;
  name: string;
  email: string;
}

export interface Bar {
  id: number;
  slug: string;
  name: string;
  search_host: string | null;
  search_token: string | null;
}

export interface Tag {
  id: number;
  name: string;
}

export interface Ingredient {
  id: number;
  slug: string;
  name: string;
  strength: number;
  in_shelf?: boolean;
  in_bar_shelf?: boolean;
  /** Ancestor id chain, root first ("129/119/"); null for root ingredients. */
  materialized_path?: string | null;
}

export interface FormattedAmount {
  amount: number;
  amount_max: number | null;
  units: string;
  full_text: string;
}

export interface CocktailIngredientEntry {
  amount: number;
  /** The upper bound of a measure authored as a range ("22.5–30 ml"), as
   *  authored; null for a single amount. Always emitted
   *  (CocktailIngredientResource.php:53). */
  amount_max: number | null;
  /** Original units as authored — may be non-volumetric ('dash', 'barspoon'). */
  units: string;
  /** Keyed by unit system — pick per the bar's default units. */
  formatted: { ml: FormattedAmount; oz: FormattedAmount; cl: FormattedAmount };
  optional: boolean;
  in_shelf: boolean;
  /** Satisfied by a descendant on the shelf (upstream sets these only when the
   *  relation is loaded — treat absent as false). */
  in_shelf_as_variant?: boolean;
  in_shelf_as_substitute?: boolean;
  in_shelf_as_complex_ingredient?: boolean;
  in_bar_shelf: boolean;
  /** True when only this exact ingredient will do: the matcher then credits no
   *  descendant (always emitted, CocktailIngredientResource.php:60). */
  is_specified: boolean;
  ingredient: { id: number; slug: string; name: string };
}

/**
 * The shelf as the upstream matcher reads it for a line that is not
 * `is_specified` (CocktailService.php:281-288 at v5.15.3): a held ingredient
 * also counts toward a line calling its direct parent, or its root, and no
 * other ancestor (chrispezza/barback#20). Built from the shelf rows useShelf
 * reads; their root-first `materialized_path` ("1/5/6/7/") names both.
 */
export interface ShelfIndex {
  /** Ids of the direct parent and the root of every held ingredient. */
  readonly parentsAndRoots: ReadonlySet<number>;
}

export function shelfIndex(
  rows: readonly Pick<Ingredient, 'id' | 'materialized_path'>[],
): ShelfIndex {
  const parentsAndRoots = new Set<number>();
  for (const row of rows) {
    const path = (row.materialized_path ?? '').split('/').filter(Boolean);
    const root = path[0];
    const parent = path[path.length - 1];
    if (root !== undefined) parentsAndRoots.add(Number(root));
    if (parent !== undefined) parentsAndRoots.add(Number(parent));
  }
  return { parentsAndRoots };
}

/**
 * Stock-coloring parity with upstream shelf matching: an entry counts as
 * stocked when held exactly OR satisfied by a shelf variant, substitute, or
 * complex ingredient — the same cases getCocktailsByIngredients counts.
 * Exact `in_shelf` alone would paint a drink "missing tequila" while the
 * matcher happily pours it with the blanco.
 *
 * Only `GET /cocktails/{id}` carries the three in_shelf_as_* flags; the index
 * and `/similar` load no descendants, substitutes or parts, so a list card
 * passes the `shelf` too, and a held child brand then counts by the matcher's
 * own rule (see ShelfIndex). Substitutes and complex ingredients stay
 * invisible on those endpoints.
 */
export function isStocked(entry: CocktailIngredientEntry, shelf?: ShelfIndex): boolean {
  return (
    entry.in_shelf ||
    entry.in_shelf_as_variant === true ||
    entry.in_shelf_as_substitute === true ||
    entry.in_shelf_as_complex_ingredient === true ||
    (shelf !== undefined && !entry.is_specified && shelf.parentsAndRoots.has(entry.ingredient.id))
  );
}

export interface Cocktail {
  id: number;
  slug: string;
  name: string;
  abv: number | null;
  in_shelf: boolean;
  is_favorited: boolean;
  instructions: string;
  garnish: string | null;
  ingredients: CocktailIngredientEntry[];
  tags?: Tag[];
}

export interface ShoppingListItem {
  ingredient: { id: number; slug: string; name: string };
  quantity: number | null;
}

/** GET /ingredients/{id}?include=cocktailsCount — detail with hierarchy. */
export interface IngredientDetail extends Ingredient {
  cocktails_count?: number;
  hierarchy?: {
    parent_ingredient: { id: number; slug: string; name: string } | null;
  };
}

/**
 * GET /users/{id}/ingredients/recommend entry (the IngredientRecommend schema;
 * the bar-shelf route returns the same shape). `potential_cocktails` counts the
 * recipes that name the bottle exactly, optional lines included: a usage count,
 * not what it unlocks (`/ingredients/{id}/extra` says that).
 */
export interface RecommendedIngredient {
  id: number;
  slug: string;
  name: string;
  potential_cocktails: number;
}
