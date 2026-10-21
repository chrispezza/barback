// Card-level match state, derived client-side from the per-line stock flags on
// a cocktail resource (frontend-spec §2 "Per-ingredient stock color", §7
// DrinkCard). The can-make and one-away SETS stay server-computed (§2 Tonight);
// these helpers only decide how one card already in hand is painted.
//
// Moved here unchanged from the four screens that each carried a copy
// (Tonight, Drinks, FirstPours, DrinkDetail). The two match functions are kept
// separate because their callers differ today; they are not yet reconciled.

import { isStocked, type Cocktail } from '../api/types';

/** One entry of the DS DrinkCard ingredient run. */
export interface CardIngredient {
  name: string;
  have: boolean;
  optional: boolean;
}

/** DrinkCard `match` values (The Back Bar Design System, DrinkCard.d.ts). */
export type MatchState = 'full' | 'partial' | 'near' | 'none';

/** The ingredient run for a DrinkCard: recipe order, stock per isStocked. */
export function cardIngredients(cocktail: Cocktail): CardIngredient[] {
  return cocktail.ingredients.map((entry) => ({
    name: entry.ingredient.name,
    have: isStocked(entry),
    optional: entry.optional,
  }));
}

/** Required lines the shelf does not cover; optional lines never count. */
function missingRequired(cocktail: Cocktail): number {
  return cocktail.ingredients.filter((i) => !isStocked(i) && !i.optional).length;
}

/**
 * The Index's card state (Drinks): counted from the lines alone — none missing
 * is full, one is near, two or three partial, more than three none.
 */
export function indexMatchState(cocktail: Cocktail): MatchState {
  const missing = missingRequired(cocktail);
  if (missing === 0) return 'full';
  if (missing === 1) return 'near';
  if (missing <= 3) return 'partial';
  return 'none';
}

/**
 * The roster's card state (Classics, and similar drinks on the Recipe): full
 * when the server says the drink pours (`in_shelf`), otherwise near when
 * exactly one counted line is missing, otherwise partial. Never none.
 */
export function rosterMatchState(cocktail: Cocktail): Exclude<MatchState, 'none'> {
  if (cocktail.in_shelf) return 'full';
  return missingRequired(cocktail) === 1 ? 'near' : 'partial';
}
