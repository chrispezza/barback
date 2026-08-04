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
  ingredient: { id: number; slug: string; name: string };
}

/**
 * Stock-coloring parity with upstream shelf matching: an entry counts as
 * stocked when held exactly OR satisfied by a shelf variant, substitute, or
 * complex ingredient — the same cases getCocktailsByIngredients counts.
 * Exact `in_shelf` alone would paint a drink "missing tequila" while the
 * matcher happily pours it with the blanco.
 */
export function isStocked(entry: CocktailIngredientEntry): boolean {
  return (
    entry.in_shelf ||
    entry.in_shelf_as_variant === true ||
    entry.in_shelf_as_substitute === true ||
    entry.in_shelf_as_complex_ingredient === true
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

/** GET /bars/{id}/ingredients/recommend entry. */
export interface RecommendedIngredient {
  id: number;
  slug: string;
  name: string;
  potential_cocktails: number;
}
