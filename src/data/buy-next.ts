// Purchasing intelligence (ADR-008, frontend-spec §9): which bottles Tonight
// suggests, in which group, and which staples it puts on the list by itself.
// Pure decisions over what the screen already holds; Tonight keeps the
// queries, the effect that writes the list, and the copy around them.
//
// Only staplesToQueue feeds a write the user did not tap (a standing order);
// everything else here is a suggestion, listed on a tap. Groups, highest
// first: Buy next (one bottle), For your favorites, Restock next.

import {
  isStocked,
  type Cocktail,
  type Ingredient,
  type RecommendedIngredient,
  type ShelfIndex,
} from '../api/types';

/** How many bottles the favourites group and the restock group each hold. */
export const GROUP_LIMIT = 5;

/** A bottle a favourited drink still needs. */
export interface FavoriteNeed {
  id: number;
  name: string;
  /**
   * Favourited lines that call for this bottle and are not covered. ADR-008
   * ranks by favourited drinks the bottle completes; the two differ when a
   * favourite is more than one bottle away.
   */
  count: number;
}

/** The one decision-ready bottle. `reason` is undefined for the server's pick,
 *  whose card then says what it opens tonight. */
export interface BuyNextPick {
  id: number;
  name: string;
  reason: string | undefined;
}

/**
 * What the favourited drinks still need, in the order first met. A line is a
 * gap when the shelf does not cover it (isStocked, with the shelf so a held
 * child brand counts as the matcher counts it, chrispezza/barback#20), it is
 * not optional, and its bottle is neither owned nor already listed.
 */
export function favoriteGaps(
  favorites: readonly Cocktail[],
  ownedOrListed: ReadonlySet<number>,
  shelf?: ShelfIndex,
): FavoriteNeed[] {
  const gaps = new Map<number, FavoriteNeed>();
  for (const c of favorites) {
    for (const e of c.ingredients) {
      if (!isStocked(e, shelf) && !e.optional && !ownedOrListed.has(e.ingredient.id)) {
        const gap = gaps.get(e.ingredient.id) ?? {
          id: e.ingredient.id,
          name: e.ingredient.name,
          count: 0,
        };
        gap.count += 1;
        gaps.set(e.ingredient.id, gap);
      }
    }
  }
  return [...gaps.values()];
}

/** The favourites group: highest count first, ties in the order met, capped. */
export function rankFavoriteNeeds(gaps: readonly FavoriteNeed[]): FavoriteNeed[] {
  return [...gaps].sort((a, b) => b.count - a.count).slice(0, GROUP_LIMIT);
}

/**
 * Restock suggestions: the server's ranking, minus what is owned or listed
 * (upstream recommend does not exclude them, chrispezza/barback#22; ADR-001
 * means a client-side filter, never a patch), minus staples, which are
 * standing orders, and minus what the favourites group claimed. Capped.
 */
export function restockSuggestions(
  recommendations: readonly RecommendedIngredient[],
  ownedOrListed: ReadonlySet<number>,
  stapleIds: ReadonlySet<number>,
  favoriteNeeds: readonly FavoriteNeed[],
): RecommendedIngredient[] {
  const claimed = new Set(favoriteNeeds.map((f) => f.id));
  return recommendations
    .filter((r) => !ownedOrListed.has(r.id) && !stapleIds.has(r.id) && !claimed.has(r.id))
    .slice(0, GROUP_LIMIT);
}

/**
 * Buy next and the two groups beneath it. The favourites group's leader
 * outranks the server's; failing that, the server's leader. The pick leaves
 * the group it came from.
 */
export function buyNextGroups(
  favoriteNeeds: readonly FavoriteNeed[],
  suggestions: readonly RecommendedIngredient[],
): {
  pick: BuyNextPick | undefined;
  favoriteNeeds: FavoriteNeed[];
  suggestions: RecommendedIngredient[];
} {
  const topNeed = favoriteNeeds[0];
  const topSuggestion = suggestions[0];
  const pick: BuyNextPick | undefined = topNeed
    ? {
        id: topNeed.id,
        name: topNeed.name,
        reason: `completes ${topNeed.count} favorite${topNeed.count === 1 ? '' : 's'}`,
      }
    : topSuggestion
      ? { id: topSuggestion.id, name: topSuggestion.name, reason: undefined }
      : undefined;
  return {
    pick,
    favoriteNeeds: favoriteNeeds.filter((f) => f.id !== pick?.id),
    suggestions: suggestions.filter((r) => r.id !== pick?.id),
  };
}

/**
 * The standing order: staples to queue now. A staple is queued when it is off
 * the shelf, not already on the list, and not queued before (`queued`: Tonight
 * passes queuedThisSession with what its current mount has sent), so it is
 * written once per emptying rather than on every render or every visit.
 */
export function staplesToQueue<T extends Pick<Ingredient, 'id' | 'in_shelf'>>(
  staples: readonly T[],
  listedIds: ReadonlySet<number>,
  queued: ReadonlySet<number>,
): T[] {
  return staples.filter((s) => !s.in_shelf && !listedIds.has(s.id) && !queued.has(s.id));
}

// ADR-008: an out-of-stock staple is queued automatically, and it "queues
// itself once per session" (Validation). Once per emptying, for the page
// session: a staple is held here from the moment its write is sent until
// Tonight sees it back on the shelf. A staple the user drops from the list is
// still off the shelf, so it stays held and stays dropped; one that is checked
// off and later used up is queued again. The page session is this module's
// lifetime: it outlives Tonight unmounting on every navigation, and a reload
// starts a new one.
const queuedSession = new Set<number>();

/** Staples held as queued this page session, for staplesToQueue. */
export const queuedThisSession: ReadonlySet<number> = queuedSession;

/**
 * Hold staples as queued. Called as the write is sent, not on success, so a
 * re-render while it is in flight cannot send it twice.
 */
export function rememberQueued(ids: Iterable<number>): void {
  for (const id of ids) queuedSession.add(id);
}

/**
 * Release staples whose write failed, so the next time Tonight opens it sends
 * them again. The mount that sent them does not (Tonight keeps its own record),
 * or a lasting failure would loop: mutations do not retry.
 */
export function forgetQueued(ids: Iterable<number>): void {
  for (const id of ids) queuedSession.delete(id);
}

/**
 * Release staples that are back on the shelf: the standing order stands for
 * the next time they run out. Tonight calls it with every staples read, and a
 * check-off or a shelf change refetches the staples while Tonight is open.
 */
export function forgetRestocked(staples: readonly Pick<Ingredient, 'id' | 'in_shelf'>[]): void {
  for (const s of staples) if (s.in_shelf) queuedSession.delete(s.id);
}
