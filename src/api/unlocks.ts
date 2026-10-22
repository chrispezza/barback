import { queryOptions, useQueries } from '@tanstack/react-query';
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

/**
 * The unlock counts in hand for these bottles, as their rows state them. A
 * bottle still being counted, or whose count could not be read, is absent: the
 * caller decides what an absent count means (data/buy-next.ts rankList).
 */
export function useUnlockCounts(
  barId: number | undefined,
  ingredientIds: readonly number[],
): ReadonlyMap<number, number> {
  const reads = useQueries({
    queries: ingredientIds.map((id) => unlocksOptions(barId, id)),
  });
  const counts = new Map<number, number>();
  ingredientIds.forEach((id, i) => {
    const count = reads[i]?.data;
    if (count !== undefined) counts.set(id, count);
  });
  return counts;
}
