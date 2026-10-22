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
//
// A family where nothing pours says what opens it from the same lines
// (familyGap, familyNextStep): Tonight's family empty state and the Index's
// family header share the one sentence (frontend-spec §6 Journey 2). It reads
// the gaps the family's cards already name, as oneBottleAway reads one card's;
// whether the family pours, and what is one bottle away, stay the server's.

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

/** Required lines the shelf does not cover, in recipe order; optional lines never count. */
function missingRequiredLines(
  cocktail: Cocktail,
  shelf: ShelfIndex | undefined,
): CocktailIngredientEntry[] {
  return cocktail.ingredients.filter((i) => !lineHeld(cocktail, i, shelf) && !i.optional);
}

function missingRequired(cocktail: Cocktail, shelf: ShelfIndex | undefined): number {
  return missingRequiredLines(cocktail, shelf).length;
}

/**
 * The one bottle a card names as missing ("One bottle away: Campari"), which
 * Tonight lists from a near-miss card on a tap (frontend-spec §6 Journey 1).
 * It is read by lineHeld, as cardIngredients paints the run the card's
 * missing-line is drawn from, so the bottle listed is always the bottle named.
 * Undefined when the card names none (a drink the server pours, which it also
 * counts one bottle away: chrispezza/barback#19) or more than one.
 */
export function oneBottleAway(
  cocktail: Cocktail,
  shelf?: ShelfIndex,
): CocktailIngredientEntry['ingredient'] | undefined {
  const [only, ...others] = missingRequiredLines(cocktail, shelf);
  return only !== undefined && others.length === 0 ? only.ingredient : undefined;
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

/** A bottle a card names as missing. */
type Bottle = CocktailIngredientEntry['ingredient'];

/**
 * What opens a family where nothing pours (frontend-spec §6 Journey 2:
 * "Family-aware empty states ('Add a citrus and a sweetener') come from this
 * journey's gap data").
 */
export interface FamilyGap {
  /** The bottles to add: the most common gap across the family first. */
  bottles: Bottle[];
  /** The family's drinks that wait on these bottles alone, so pour once they are added. */
  opens: number;
}

/**
 * The bottles a family's closest drinks wait on, from the family's own drinks
 * (every one of them: `opens` is a count over the family) and the shelf.
 *
 * Each drink that does not pour waits on the required lines its card names as
 * missing (missingRequiredLines, by lineHeld, so a line a held child brand
 * covers is never named: chrispezza/barback#20). Each such set is a candidate,
 * and the one chosen is: the fewest bottles, the immediate next step; then the
 * one that opens the most drinks; then the most common gaps, a bottle counted
 * once per drink that waits on it; then the first in the order read. The
 * count is only what the arithmetic holds: the drinks whose every missing line
 * the set names. Adding them covers those lines exactly, as the server's
 * matcher counts them (CocktailService.php:255-311 at v5.15.3). The index
 * shows no substitute, so a line one covers reads as missing here: the set
 * may name a bottle such a drink does not need, never too few.
 *
 * A drink whose card names no missing line while the server says it does not
 * pour (the line flags and the matcher disagree) is passed over: nothing on
 * it can be named. Undefined when no drink leaves anything to name.
 */
export function familyGap(drinks: readonly Cocktail[], shelf?: ShelfIndex): FamilyGap | undefined {
  const gaps: ReadonlyMap<number, Bottle>[] = [];
  /** How many drinks wait on each bottle. */
  const waiting = new Map<number, number>();
  /** Where each bottle was first met, in the order read and recipe order. */
  const firstMet = new Map<number, number>();
  for (const drink of drinks) {
    if (drink.in_shelf) continue;
    const gap = new Map(missingRequiredLines(drink, shelf).map((e) => [e.ingredient.id, e.ingredient]));
    if (gap.size === 0) continue;
    gaps.push(gap);
    for (const id of gap.keys()) {
      waiting.set(id, (waiting.get(id) ?? 0) + 1);
      if (!firstMet.has(id)) firstMet.set(id, firstMet.size);
    }
  }

  let best: { gap: ReadonlyMap<number, Bottle>; opens: number; weight: number } | undefined;
  for (const gap of gaps) {
    const opens = gaps.filter((other) => [...other.keys()].every((id) => gap.has(id))).length;
    const weight = [...gap.keys()].reduce((sum, id) => sum + (waiting.get(id) ?? 0), 0);
    if (
      best === undefined ||
      gap.size < best.gap.size ||
      (gap.size === best.gap.size &&
        (opens > best.opens || (opens === best.opens && weight > best.weight)))
    ) {
      best = { gap, opens, weight };
    }
  }
  if (best === undefined) return undefined;

  const bottles = [...best.gap.values()].sort(
    (a, b) =>
      (waiting.get(b.id) ?? 0) - (waiting.get(a.id) ?? 0) ||
      (firstMet.get(a.id) ?? 0) - (firstMet.get(b.id) ?? 0),
  );
  return { bottles, opens: best.opens };
}

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/**
 * A count as the empty state's prose says it: in words, as Content
 * fundamentals writes it ("add a citrus and a sweetener and six drinks open
 * up"). The line is set in italic Caslon, which never carries a numeral. Past
 * ninety-nine it falls back to digits; one step that opens a hundred drinks is
 * past a home bar's scale.
 */
export function countInWords(n: number): string {
  if (n >= 0 && n < 20) return ONES[n] ?? String(n);
  if (n >= 20 && n < 100) {
    const tens = TENS[Math.floor(n / 10)] ?? '';
    const ones = n % 10;
    return ones === 0 ? tens : `${tens}-${ONES[ones] ?? ''}`;
  }
  return String(n);
}

/** "Vodka", "Vodka and Coffee liqueur", "Vodka, Coffee liqueur and Espresso". */
function namesInProse(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * A family's gap as its next step, directive and in sentence case (Content
 * fundamentals, "Empty states name the next action"): "Add Vodka and Coffee
 * liqueur and two dessert drinks open up." Bottle names are upstream's own.
 * families.ts names the plural only, so one drink drops its final "s", as the
 * Index's summary and the To buy rows do, until FamilyDef carries a singular
 * (chrispezza/barback#85).
 */
export function familyGapLine(gap: FamilyGap, plural: string): string {
  const noun = gap.opens === 1 ? plural.replace(/s$/, '') : plural;
  const verb = gap.opens === 1 ? 'opens' : 'open';
  return `Add ${namesInProse(gap.bottles.map((b) => b.name))} and ${countInWords(gap.opens)} ${noun} ${verb} up.`;
}

/**
 * A family that holds no drinks has nothing to pour, miss or browse: the next
 * step is another family (frontend-spec §5 "Empty states are directive"),
 * never "You can pour 0 of 0".
 */
export function familyHoldsNoDrinks(plural: string): string {
  return `The index holds no ${plural} yet — pick another family.`;
}

/**
 * What a family where nothing pours says next, from all its drinks and the
 * shelf: that it holds none, or what opens it (familyGap). Undefined when
 * nothing on its drinks can be named; the screen keeps a line that names no
 * bottle. The shelf must be the one read, not a guess: without it a line a
 * held child brand covers would be named (chrispezza/barback#20).
 */
export function familyNextStep(
  drinks: readonly Cocktail[],
  shelf: ShelfIndex,
  plural: string,
): string | undefined {
  if (drinks.length === 0) return familyHoldsNoDrinks(plural);
  const gap = familyGap(drinks, shelf);
  return gap && familyGapLine(gap, plural);
}
