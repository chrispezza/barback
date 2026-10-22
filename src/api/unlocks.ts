import { queryOptions, useQueries, type QueryObserverResult } from '@tanstack/react-query';
import { api } from './client';
import type { ListResponse } from './types';

/**
 * A drink GET /ingredients/{id}/extra names: one the bottle would add to what
 * the user's shelf pours (IngredientController::extra,
 * app/Http/Controllers/IngredientController.php:199-226 in the reference clone
 * at v5.15.3).
 */
export interface ExtraCocktail {
  id: number;
  slug: string;
  name: string;
}

/** As long as useIngredientUnlocks (queries.ts) holds the same read. */
const UNLOCKS_STALE_MS = 5 * 60 * 1000;

/**
 * One bottle's "unlocks N" read (frontend-spec §2 Tonight), under the key
 * useIngredientUnlocks reads it by, so a To buy row and the list's order share
 * one cache entry, and one request, per bottle. A check-off invalidates every
 * `['ingredient-extra']` read (useCheckOff), and the order follows.
 */
export function unlocksOptions(barId: number | undefined, ingredientId: number) {
  return queryOptions({
    queryKey: ['ingredient-extra', barId, ingredientId],
    queryFn: () =>
      api<ListResponse<ExtraCocktail>>(`/ingredients/${ingredientId}/extra`, { barId }),
    enabled: barId !== undefined,
    staleTime: UNLOCKS_STALE_MS,
    select: (r: ListResponse<ExtraCocktail>) => r.data.length,
  });
}

/** What the order needs of one bottle's read: the count it holds, and whether it is under way. */
export type UnlockRead = Pick<QueryObserverResult<number>, 'data' | 'fetchStatus'>;

/**
 * The counts that have answered, for the bottles `reads` belong to (in the same
 * order). A read under way leaves its bottle out, on a first read and on a
 * read again alike: after a check-off refreshes every count (useCheckOff), or
 * a refetch on focus, the row still states its last count, but until the read
 * answers that count may be the one the check-off changed. A bottle whose
 * count could not be read, with none in hand, is left out too. What an absent
 * count means for the order is rankList's (data/buy-next.ts).
 */
export function answeredCounts(
  ingredientIds: readonly number[],
  reads: readonly (UnlockRead | undefined)[],
): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  ingredientIds.forEach((id, i) => {
    const read = reads[i];
    if (read?.data !== undefined && read.fetchStatus === 'idle') counts.set(id, read.data);
  });
  return counts;
}

/** The answered unlock counts for these bottles (answeredCounts), read as their rows read them. */
export function useUnlockCounts(
  barId: number | undefined,
  ingredientIds: readonly number[],
): ReadonlyMap<number, number> {
  const reads = useQueries({
    queries: ingredientIds.map((id) => unlocksOptions(barId, id)),
  });
  return answeredCounts(ingredientIds, reads);
}
