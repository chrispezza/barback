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
  /** Favourited drinks that still need this bottle: "in N favorites". */
  count: number;
  /**
   * Favourited drinks this bottle completes: those it is the only gap of.
   * ADR-008 ranks by this first. It is less than `count` whenever a favourite
   * is more than one bottle away, and then that favourite counts for none of
   * its bottles.
   */
  completes: number;
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
 * not optional, and its bottle is neither owned nor already listed. A listed
 * bottle is set aside as already on its way, so a drink whose other gaps are
 * all listed is completed by the one bottle left.
 */
export function favoriteGaps(
  favorites: readonly Cocktail[],
  ownedOrListed: ReadonlySet<number>,
  shelf?: ShelfIndex,
): FavoriteNeed[] {
  const gaps = new Map<number, FavoriteNeed>();
  for (const c of favorites) {
    // This drink's gaps, one per bottle however many lines call it.
    const missing = new Map<number, string>();
    for (const e of c.ingredients) {
      if (!isStocked(e, shelf) && !e.optional && !ownedOrListed.has(e.ingredient.id)) {
        missing.set(e.ingredient.id, e.ingredient.name);
      }
    }
    for (const [id, name] of missing) {
      const gap = gaps.get(id) ?? { id, name, count: 0, completes: 0 };
      gap.count += 1;
      if (missing.size === 1) gap.completes += 1;
      gaps.set(id, gap);
    }
  }
  return [...gaps.values()];
}

/**
 * The favourites group, capped. ADR-008: the bottle completing the most
 * favourited drinks first; then the one the most favourites need; then by name.
 */
export function rankFavoriteNeeds(gaps: readonly FavoriteNeed[]): FavoriteNeed[] {
  return [...gaps]
    .sort((a, b) => b.completes - a.completes || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, GROUP_LIMIT);
}

const favoritesPhrase = (n: number) => `${n} favorite${n === 1 ? '' : 's'}`;

/**
 * Why a favourite's bottle is Buy next: "completes N favorites" when it is the
 * last bottle of N of them (ADR-008 Validation), otherwise "in N favorites",
 * the voice of the For your favorites rows. Never "completes" a drink that
 * still misses another bottle.
 */
function favoriteReason(need: FavoriteNeed): string {
  return need.completes > 0
    ? `completes ${favoritesPhrase(need.completes)}`
    : `in ${favoritesPhrase(need.count)}`;
}

/**
 * Restock suggestions: the server's ranking against the user's shelf
 * (chrispezza/barback#22), which already leaves out every bottle that shelf
 * holds by id. The client filter stays as a safety net (ADR-001: a client-side
 * filter, never a patch) and takes out what the ranking cannot know: what is
 * owned or listed, should it come back; staples, which are standing orders;
 * what the favourites group claimed; and, given the `shelf`, a bottle the shelf
 * already covers through a held child brand. The ranking compares ids only, so
 * it names Islay Scotch beside a Laphroaig 10, although the matcher credits
 * the brand to its direct parent and its root (ShelfIndex; frontend-spec §9).
 * Such a parent can still open a drink through its own parent (Islay Scotch
 * pours a Rob Roy's Scotch whisky, which the Laphroaig does not), but the
 * bottle above it (Scotch whisky) opens all of that and more. A
 * recipe that calls the parent with `is_specified` still wants the exact
 * bottle; the ranking carries no line data to tell, and a favourite that needs
 * it still reaches the favourites group, which reads its lines. Capped.
 */
export function restockSuggestions(
  recommendations: readonly RecommendedIngredient[],
  ownedOrListed: ReadonlySet<number>,
  stapleIds: ReadonlySet<number>,
  favoriteNeeds: readonly FavoriteNeed[],
  shelf?: ShelfIndex,
): RecommendedIngredient[] {
  const claimed = new Set(favoriteNeeds.map((f) => f.id));
  return recommendations
    .filter(
      (r) =>
        !ownedOrListed.has(r.id) &&
        !stapleIds.has(r.id) &&
        !claimed.has(r.id) &&
        shelf?.parentsAndRoots.has(r.id) !== true,
    )
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
    ? { id: topNeed.id, name: topNeed.name, reason: favoriteReason(topNeed) }
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
