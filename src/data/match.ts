// Card-level match state, derived client-side from a cocktail resource
// (frontend-spec §2 "Per-ingredient stock color", §7 DrinkCard). The can-make
// and one-away SETS stay server-computed (§2 Tonight); these helpers only
// decide how one card already in hand is painted.
//
// One function paints every card built from a cocktail resource: the Index,
// Classics and the Recipe's "In the same vein" (chrispezza/barback#39). Tonight
// paints its sections by section, because each section IS a server set.

import type { DrinkCardProps } from '@ds/drinks/DrinkCard';
import { isStocked, type Cocktail } from '../api/types';

// Both types are read off the vendored DS contract (ADR-006,
// DrinkCard.d.ts) rather than restated, so the component stays their one
// source. `optional` is always set here, hence Required.

/** One entry of the DS DrinkCard ingredient run. */
export type CardIngredient = Required<DrinkCardProps['ingredients'][number]>;

/** DrinkCard `match` values. */
export type MatchState = NonNullable<DrinkCardProps['match']>;

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
 * A card's state, the same on every screen. Full exactly when the server's
 * matcher says the drink pours (`in_shelf`, CocktailResource.php:133 at
 * v5.15.3): the can-pour answer Tonight and the family header count. Otherwise
 * from the required lines left uncovered: one is near, two or three partial,
 * four or more none. None uncovered while the server says it does not pour
 * (the line flags and the matcher disagree, chrispezza/barback#20) is partial:
 * something is missing, and the lines cannot say what.
 */
export function matchState(cocktail: Cocktail): MatchState {
  if (cocktail.in_shelf) return 'full';
  const missing = missingRequired(cocktail);
  if (missing === 1) return 'near';
  if (missing >= 4) return 'none';
  return 'partial';
}
