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
  in_bar_shelf: boolean;
  ingredient: { id: number; slug: string; name: string };
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
