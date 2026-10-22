// Card-level match state, derived client-side from a cocktail resource
// (frontend-spec §2 "Per-ingredient stock color", §7 DrinkCard). The can-make
// and one-away SETS stay server-computed (§2 Tonight); these helpers only
// decide how one card already in hand is painted.
//
// One function paints every card built from a cocktail resource: the Index,
// Classics and the Recipe's "In the same vein" (chrispezza/barback#39). Tonight
// paints its sections by section, because each section IS a server set.
//
// A card built from GET /cocktails or /similar (Tonight, the Index, "In the
// same vein") is passed the shelf (ShelfIndex, from useShelf): those endpoints
// carry no variant flags, so without it a line a held child brand covers reads
// as missing (chrispezza/barback#20). Undefined while the shelf loads: the line
// flags alone. Classics reads each drink by slug, whose flags are loaded. On a
// drink the server pours, no required line reads as missing (lineHeld).

import type { DrinkCardProps } from '@ds/drinks/DrinkCard';
import { isStocked, type Cocktail, type CocktailIngredientEntry, type ShelfIndex } from '../api/types';

// Both types are read off the vendored DS contract (ADR-006,
// DrinkCard.d.ts) rather than restated, so the component stays their one
// source. `optional` is always set here, hence Required.

/** One entry of the DS DrinkCard ingredient run. */
export type CardIngredient = Required<DrinkCardProps['ingredients'][number]>;

/** DrinkCard `match` values. */
export type MatchState = NonNullable<DrinkCardProps['match']>;

/**
 * Whether a recipe line is held, as the card paints it. On a drink the server
 * pours, every required line is: `in_shelf` is the matcher
 * (CocktailResource.php:133, CocktailService.php:255-311 at v5.15.3), which
 * counts a required line held exactly, through a substitute or through a child
 * brand, and pours the drink only once it has counted every one. The index
 * shape carries no substitute flag, and the shelf cannot stand in for one (a
 * substitute belongs to the line, not the bottle), so without this a Mojito
 * topped with Tonic reads "One bottle away: Club soda" beside "Can pour". The
 * matcher skips optional lines, so those keep their own stock. On a drink that
 * does not pour, the line flags and the shelf decide alone (chrispezza/barback#20).
 */
export function lineHeld(
  cocktail: Pick<Cocktail, 'in_shelf'>,
  entry: CocktailIngredientEntry,
  shelf?: ShelfIndex,
): boolean {
  return (cocktail.in_shelf && !entry.optional) || isStocked(entry, shelf);
}

/** The ingredient run for a DrinkCard: recipe order, stock per lineHeld. */
export function cardIngredients(cocktail: Cocktail, shelf?: ShelfIndex): CardIngredient[] {
  return cocktail.ingredients.map((entry) => ({
    name: entry.ingredient.name,
    have: lineHeld(cocktail, entry, shelf),
    optional: entry.optional,
  }));
}

/** Required lines the shelf does not cover; optional lines never count. */
function missingRequired(cocktail: Cocktail, shelf: ShelfIndex | undefined): number {
  return cocktail.ingredients.filter((i) => !lineHeld(cocktail, i, shelf) && !i.optional).length;
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
export function matchState(cocktail: Cocktail, shelf?: ShelfIndex): MatchState {
  if (cocktail.in_shelf) return 'full';
  const missing = missingRequired(cocktail, shelf);
  if (missing === 1) return 'near';
  if (missing >= 4) return 'none';
  return 'partial';
}
