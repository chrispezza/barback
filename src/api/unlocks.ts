import { hashKey, queryOptions, useQueries, useQuery, type QueryObserverResult } from '@tanstack/react-query';
import { api } from './client';
import { familyByTag, type FamilyDef } from '../data/families';
import type { CocktailFilters } from './queries';
import type { Cocktail, ListResponse } from './types';

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
 * GET /ingredients/{id}/extra under the key useIngredientUnlocks reads it by.
 * Every reader of it below shares one cache entry, and one request, per
 * bottle; each selects its own view of the answer.
 */
function extraRead(barId: number | undefined, ingredientId: number) {
  return {
    queryKey: ['ingredient-extra', barId, ingredientId],
    queryFn: () =>
      api<ListResponse<ExtraCocktail>>(`/ingredients/${ingredientId}/extra`, { barId }),
    enabled: barId !== undefined,
    staleTime: UNLOCKS_STALE_MS,
  };
}

/**
 * One bottle's "unlocks N" read (frontend-spec §2 Tonight), under the key
 * useIngredientUnlocks reads it by, so a To buy row and the list's order share
 * one cache entry, and one request, per bottle. A check-off invalidates every
 * `['ingredient-extra']` read (useCheckOff), and the order follows.
 */
export function unlocksOptions(barId: number | undefined, ingredientId: number) {
  return queryOptions({
    ...extraRead(barId, ingredientId),
    select: (r: ListResponse<ExtraCocktail>) => r.data.length,
  });
}

/**
 * The same read as unlocksOptions, as the ids of the drinks it names: the
 * drinks a row's "Unlocks N" counts, whose families the row then names.
 */
export function unlockedDrinksOptions(barId: number | undefined, ingredientId: number) {
  return queryOptions({
    ...extraRead(barId, ingredientId),
    select: (r: ListResponse<ExtraCocktail>) => r.data.map((c) => c.id),
  });
}

/** What the family join reads of a drink: its id, and its tags once included. */
export type TaggedDrink = Pick<Cocktail, 'id' | 'tags'>;

/**
 * The tags of exactly these drinks, from the cocktail index: `filter[id]` is
 * exact and takes a comma list (CocktailQueryFilter.php:28 at v5.15.3), and
 * `tags` are on the index only when included (CocktailResource.php:106-111).
 * One page holds them all: per_page is their number (the index pages at 25 by
 * default, CocktailController.php:82). Keyed by the set of drinks, so two
 * bottles that open the same drinks share one read, and a set that changes
 * is a new read with no answer until it lands. Family tags are editorial
 * (ADR-002) and no shelf change moves them, so a check-off does not ask
 * again; the new set a check-off brings is its own key.
 */
export function drinkTagsOptions(barId: number | undefined, drinkIds: readonly number[]) {
  const ids = [...new Set(drinkIds)].sort((a, b) => a - b);
  const key = ids.join(',');
  return queryOptions({
    queryKey: ['drink-tags', barId, key],
    queryFn: () =>
      api<ListResponse<Cocktail>>(
        `/cocktails?filter[id]=${key}&include=tags&per_page=${ids.length}`,
        { barId },
      ),
    enabled: barId !== undefined && ids.length > 0,
    staleTime: UNLOCKS_STALE_MS,
    select: (r: ListResponse<Cocktail>): TaggedDrink[] => r.data,
  });
}

/** How many of a bottle's unlocked drinks one family holds. */
export interface FamilyUnlocks {
  family: FamilyDef;
  count: number;
}

/**
 * A drink's family: the family: tag it carries that families.ts declares
 * (ADR-002). The tag script gives each drink exactly one (frontend-spec §3,
 * "Partition, not labels"); a drink carrying more, which the dev report
 * flags, counts once, under the first in declared order, so the families
 * never name more drinks than the bottle unlocks.
 */
function familyOf(drink: TaggedDrink | undefined): FamilyDef | undefined {
  const families = (drink?.tags ?? [])
    .map((t) => familyByTag(t.name))
    .filter((f): f is FamilyDef => f !== undefined);
  return families.sort((a, b) => a.order - b.order)[0];
}

/**
 * A bottle's unlocked drinks grouped by family (frontend-spec §6 Journey 3,
 * "group /ingredients/{id}/extra results by family tag"): the most drinks
 * first, ties in declared order. `drinkIds` are the drinks /extra names;
 * `drinks` the index's answer for them, with tags. A drink with no family tag,
 * or one the answer leaves out, is counted in "Unlocks N" but named by no
 * family here.
 */
export function unlocksByFamily(
  drinkIds: readonly number[],
  drinks: readonly TaggedDrink[],
): FamilyUnlocks[] {
  const byId = new Map(drinks.map((d) => [d.id, d]));
  const counts = new Map<FamilyDef, number>();
  for (const id of new Set(drinkIds)) {
    const family = familyOf(byId.get(id));
    if (family) counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts]
    .map(([family, count]) => ({ family, count }))
    .sort((a, b) => b.count - a.count || a.family.order - b.family.order);
}

/**
 * What a row can say of its drinks' families, from the two reads it holds:
 * undefined until both have answered, the tags read for exactly the drinks
 * /extra names (drinkTagsOptions keys it by them). A bottle that opens nothing
 * has no families to read, and none to name.
 */
export function unlockFamilies(
  drinkIds: readonly number[] | undefined,
  drinks: readonly TaggedDrink[] | undefined,
): FamilyUnlocks[] | undefined {
  if (drinkIds === undefined) return undefined;
  if (drinkIds.length === 0) return [];
  return drinks === undefined ? undefined : unlocksByFamily(drinkIds, drinks);
}

/**
 * The families of what this bottle unlocks, for its To buy row (unlockFamilies):
 * its /extra read, shared with the row's count, joined with the tags of the
 * drinks it names. Until the tags of those very drinks are read, undefined:
 * never the families of the set a bottle unlocked before a check-off beside
 * the count it unlocks now. A tags read that fails stays undefined, and the
 * row states its count alone.
 */
export function useUnlockFamilies(
  barId: number | undefined,
  ingredientId: number,
): FamilyUnlocks[] | undefined {
  const drinks = useQuery(unlockedDrinksOptions(barId, ingredientId));
  const tags = useQuery(drinkTagsOptions(barId, drinks.data ?? []));
  return unlockFamilies(drinks.data, tags.data);
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

/** The cocktail index's query string, exactly as useCocktails (queries.ts) builds it. */
function indexQuery(filters: CocktailFilters, perPage: number, page: number): string {
  const params = new URLSearchParams({ per_page: String(perPage) });
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined) params.set(`filter[${k}]`, String(v));
  }
  return `${params.toString()}&page=${page}`;
}

/**
 * One page of the cocktail index under these filters: the Index list. It is
 * read under the key useCocktails (queries.ts) reads a page by, and sent as
 * it sends it, so whatever invalidates ['cocktails'] (a shelf toggle, a
 * check-off, a favourite) reads it again.
 *
 * What it holds while its read is on its way differs. useCocktails keeps
 * whatever it last answered (keepPreviousData). This keeps that only when the
 * page alone changed: the previous page of the same list, with the same
 * total, stands in while the next page loads. Across a change of filter (a
 * family, the favourites) it holds nothing until the new read lands, so the
 * list shows its heading with no count and no cards: the previous filter's
 * drinks and total are not this one's (frontend-spec §6;
 * chrispezza/barback#73). It is not asked for while `enabled` is false or the
 * bar is not yet known.
 */
export function indexPageOptions(
  barId: number | undefined,
  filters: CocktailFilters,
  perPage: number,
  page: number,
  enabled: boolean,
) {
  const list = ['cocktails', barId, filters, perPage];
  return queryOptions({
    queryKey: [...list, page],
    queryFn: () =>
      api<ListResponse<Cocktail>>(`/cocktails?${indexQuery(filters, perPage, page)}`, { barId }),
    enabled: barId !== undefined && enabled,
    placeholderData: (previous: ListResponse<Cocktail> | undefined, previousQuery) =>
      previousQuery !== undefined &&
      hashKey(previousQuery.queryKey.slice(0, list.length)) === hashKey(list)
        ? previous
        : undefined,
  });
}

/** The Index list's page (indexPageOptions). */
export function useIndexPage(
  barId: number | undefined,
  filters: CocktailFilters,
  perPage: number,
  page: number,
  enabled: boolean,
) {
  return useQuery(indexPageOptions(barId, filters, perPage, page, enabled));
}
