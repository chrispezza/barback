import {
  MutationObserver,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { api, isApiError } from './client';
import { decodeCocktailText } from './text';
import { showToast } from '../components/toasts';
import { reachFallbackParent, reachOf, type Reach } from '../data/hierarchy';
import type {
  Bar,
  Cocktail,
  Ingredient,
  IngredientDetail,
  ItemResponse,
  ListResponse,
  Profile,
  RecommendedIngredient,
  ShoppingListItem,
  Tag,
} from './types';

// Query keys per frontend-spec §4. Bootstrap queries get long stale times;
// shelf-derived queries are invalidated together after any shelf mutation.

const BOOTSTRAP_STALE_MS = 5 * 60 * 1000;

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api<ItemResponse<Profile>>('/profile'),
    staleTime: BOOTSTRAP_STALE_MS,
    select: (r) => r.data,
  });
}

export function useBars() {
  return useQuery({
    queryKey: ['bars'],
    queryFn: () => api<ListResponse<Bar>>('/bars'),
    staleTime: BOOTSTRAP_STALE_MS,
    select: (r) => r.data,
  });
}

/** Single-user home-lab: the active bar is the first membership. */
export function useBarId(): number | undefined {
  const { data } = useBars();
  return data?.[0]?.id;
}

export function useTags(barId: number | undefined) {
  return useQuery({
    queryKey: ['tags', barId],
    queryFn: () => api<ListResponse<Tag>>('/tags', { barId }),
    enabled: barId !== undefined,
    staleTime: BOOTSTRAP_STALE_MS,
    select: (r) => r.data,
  });
}

export function useShelf(barId: number | undefined) {
  const queryClient = useQueryClient();
  // While a shelf toggle is out, a background read of the shelf (a screen
  // mounting, the tab coming back into view, the network coming back) would
  // land the server's answer on top of the flip. The toggle reads the shelf
  // back itself once the last one settles (shelfToggleOptions).
  const noToggleOut = () => queryClient.isMutating({ mutationKey: shelfToggleKey(barId) }) === 0;
  return useQuery({
    queryKey: ['shelf', barId],
    queryFn: () =>
      api<ListResponse<Ingredient>>(
        '/ingredients?filter[on_shelf]=true&per_page=200',
        { barId },
      ),
    enabled: barId !== undefined,
    refetchOnMount: noToggleOut,
    refetchOnWindowFocus: noToggleOut,
    refetchOnReconnect: noToggleOut,
  });
}

export type CocktailFilters = Record<string, string | number | boolean | undefined>;

function cocktailQueryString(filters: CocktailFilters, perPage: number): string {
  const params = new URLSearchParams({ per_page: String(perPage) });
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined) params.set(`filter[${k}]`, String(v));
  }
  return params.toString();
}

export function useCocktails(
  barId: number | undefined,
  filters: CocktailFilters,
  perPage = 24,
  enabled = true,
  page = 1,
) {
  return useQuery({
    queryKey: ['cocktails', barId, filters, perPage, page],
    queryFn: () =>
      api<ListResponse<Cocktail>>(
        `/cocktails?${cocktailQueryString(filters, perPage)}&page=${page}`,
        { barId },
      ),
    enabled: barId !== undefined && enabled,
    placeholderData: keepPreviousData,
  });
}

/** The recipe as written: the cache keeps the response as upstream sent it
 *  (entities and all, so the optimistic favourite flip spreads the same
 *  shape), and the screen reads instructions and garnish decoded from e(). */
const selectCocktail = (r: ItemResponse<Cocktail>): Cocktail => decodeCocktailText(r.data);

/** Upstream has no cocktail by that id or slug: firstOrFail in
 *  CocktailController::show, rendered as 404 "Resource not found."
 *  (bar-assistant-reference app/Http/Controllers/CocktailController.php:97-100,
 *  app/Exceptions/Handler.php:64-67). */
export function isCocktailNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

export function useCocktail(barId: number | undefined, idOrSlug: string) {
  return useQuery({
    queryKey: ['cocktail', barId, idOrSlug],
    queryFn: () => api<ItemResponse<Cocktail>>(`/cocktails/${idOrSlug}`, { barId }),
    enabled: barId !== undefined,
    select: selectCocktail,
    // A 404 is the bar's answer, not a failure: asking again cannot change it.
    // Anything else gets the app's one retry (src/app.tsx, retry: 1).
    retry: (failureCount, error) => !isCocktailNotFound(error) && failureCount < 1,
  });
}

/**
 * The offline list (ADR-007): the last shopping list the API served, kept as
 * names only and stamped with when it was served, rendered read-only on
 * Tonight when the API is unreachable.
 */
export interface ListSnapshot {
  /** ISO 8601 stamp of the response the names came from. */
  at: string;
  names: string[];
}

export const LIST_SNAPSHOT_KEY = 'barback:list-snapshot';

/** What the snapshot keeps of a list response: the names, sorted, and when. */
export function snapshotOf(items: ShoppingListItem[], now: Date): ListSnapshot {
  return {
    at: now.toISOString(),
    names: items.map((i) => i.ingredient.name).sort(),
  };
}

/** Stamp a list the API just served. A courtesy: it never throws. */
export function writeListSnapshot(items: ShoppingListItem[], now: Date): void {
  try {
    localStorage.setItem(LIST_SNAPSHOT_KEY, JSON.stringify(snapshotOf(items, now)));
  } catch {
    // Snapshot is a courtesy — never fail the live list over it.
  }
}

/**
 * Last list the API served — the store-aisle fallback when it's unreachable.
 * A stored value that cannot say when it was served, or what it listed, is no
 * snapshot at all.
 */
export function readListSnapshot(): ListSnapshot | null {
  try {
    const raw = localStorage.getItem(LIST_SNAPSHOT_KEY);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== 'object' || stored === null) return null;
    const { at, names } = stored as Partial<Record<keyof ListSnapshot, unknown>>;
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
    if (!Array.isArray(names) || !names.every((n) => typeof n === 'string')) return null;
    return { at, names };
  } catch {
    return null;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar days from `at` back to `now`, on the reader's local calendar. */
function calendarDaysBack(at: Date, now: Date): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(now) - day(at)) / DAY_MS);
}

/** How Tonight has always worded the stamp: weekday and time, in one format. */
const WEEKDAY_AND_TIME: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  hour: 'numeric',
  minute: '2-digit',
};

/** The parts of that format that make up the time, AM/PM included. */
const TIME_PARTS: ReadonlySet<Intl.DateTimeFormatPartTypes> = new Set([
  'hour',
  'minute',
  'dayPeriod',
]);

/**
 * When the snapshot was served, as Tonight's offline line states it ("the list
 * as it stood …"). ADR-007 asks for a list clearly stamped: up to six calendar
 * days back the weekday cannot be mistaken, and the stamp is worded exactly as
 * Tonight always worded it ("Monday 9:05 AM"; en-GB "Monday 09:05"). From
 * seven, or for a stamp ahead of the clock, the weekday could be this week's,
 * so the date is named between that same weekday and time ("Wednesday 7
 * October, 5:40 PM"), with the year when it is not this one. `locale` defaults
 * to the reader's; `at` must be a valid date.
 *
 * Known limit: the date is the locale's day, month and year joined by spaces,
 * day first, as the design system's readme writes a date. That suits the
 * English sentence around it; a locale whose date needs its own literals or
 * another calendar reads oddly ("7 10" in ja-JP, "7 Oktober" in de-DE; fa-IR
 * names a Persian date while the year rule counts Gregorian years).
 */
export function snapshotStamp(at: Date, now: Date, locale?: string): string {
  const daysBack = calendarDaysBack(at, now);
  if (daysBack >= 0 && daysBack <= 6) return at.toLocaleString(locale, WEEKDAY_AND_TIME);

  // The same weekday and time the six-day wording prints, taken from its parts
  // so a time keeps its padding and its AM/PM wherever the locale puts them.
  const wordParts = new Intl.DateTimeFormat(locale, WEEKDAY_AND_TIME).formatToParts(at);
  const weekday = wordParts.find((p) => p.type === 'weekday')?.value ?? '';
  const first = wordParts.findIndex((p) => TIME_PARTS.has(p.type));
  const last = wordParts.findLastIndex((p) => TIME_PARTS.has(p.type));
  const time = wordParts
    .slice(first, last + 1)
    .map((p) => p.value)
    .join('');

  const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
  if (at.getFullYear() !== now.getFullYear()) dateOptions.year = 'numeric';
  const parts = new Intl.DateTimeFormat(locale, dateOptions).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;
  const date = [part('day'), part('month'), part('year')].filter(Boolean).join(' ');
  return `${weekday} ${date}, ${time}`;
}

/** The list query: every response the API serves is stamped as the snapshot. */
export function shoppingListOptions(
  barId: number | undefined,
  userId: number | undefined,
) {
  return {
    queryKey: ['shopping-list', barId],
    queryFn: async () => {
      const res = await api<ListResponse<ShoppingListItem>>(
        `/users/${userId}/shopping-list`,
        { barId },
      );
      writeListSnapshot(res.data, new Date());
      return res;
    },
    enabled: barId !== undefined && userId !== undefined,
  };
}

export function useShoppingList(
  barId: number | undefined,
  userId: number | undefined,
) {
  return useQuery(shoppingListOptions(barId, userId));
}

/** Count of extra cocktails unlocked by adding this ingredient to the shelf. */
export function useIngredientUnlocks(
  barId: number | undefined,
  ingredientId: number,
) {
  return useQuery({
    queryKey: ['ingredient-extra', barId, ingredientId],
    queryFn: () =>
      api<ListResponse<{ id: number; slug: string; name: string }>>(
        `/ingredients/${ingredientId}/extra`,
        { barId },
      ),
    enabled: barId !== undefined,
    staleTime: BOOTSTRAP_STALE_MS,
    select: (r) => r.data.length,
  });
}

/**
 * How far a bottle reaches when it unlocks nothing outright: how many recipes
 * reference it — or, for a brand-level child (Laphroaig 10), its parent
 * (Islay Scotch), since upstream matching walks the hierarchy (ADR-001 clone,
 * CocktailService::getCocktailsByIngredients). The decision is reachOf
 * (data/hierarchy.ts); this hook only fetches what it needs.
 */
export function useIngredientReach(
  barId: number | undefined,
  ingredientId: number,
  enabled: boolean,
): Reach | undefined {
  const own = useQuery({
    queryKey: ['ingredient-reach', barId, ingredientId],
    queryFn: () =>
      api<ItemResponse<IngredientDetail>>(
        `/ingredients/${ingredientId}?include=cocktailsCount`,
        { barId },
      ),
    enabled: barId !== undefined && enabled,
    staleTime: BOOTSTRAP_STALE_MS,
    select: (r) => r.data,
  });
  const parent = own.data?.hierarchy?.parent_ingredient ?? null;
  const parentQuery = useQuery({
    queryKey: ['ingredient-reach', barId, parent?.id],
    queryFn: () =>
      api<ItemResponse<IngredientDetail>>(
        `/ingredients/${parent?.id}?include=cocktailsCount`,
        { barId },
      ),
    enabled: barId !== undefined && enabled && reachFallbackParent(own.data) !== null,
    staleTime: BOOTSTRAP_STALE_MS,
    select: (r) => r.data,
  });

  if (!enabled) return undefined;
  return reachOf(own.data, parentQuery.data);
}

/**
 * First-pours roster (data/first-pours.ts): full cocktails resolved by slug.
 * Only a 404 means the bar does not hold a slug: CocktailController::show ends
 * in firstOrFail (CocktailController.php 97-100; Handler.php 64-67 renders the
 * 404, at v5.15.3). That slug is dropped (reported in dev). Anything else, a
 * 500, a 403 or a connection that never answered, fails the roster, so the
 * Classics says the bar did not answer rather than listing fewer drinks
 * (ADR-007; chrispezza/barback#68).
 */
export function useFirstPours(barId: number | undefined, slugs: string[]) {
  return useQuery({
    queryKey: ['first-pours', barId],
    queryFn: async () => {
      const results = await Promise.all(
        slugs.map(async (slug) => {
          try {
            const r = await api<ItemResponse<Cocktail>>(
              `/cocktails/${slug}-${barId}`,
              { barId },
            );
            return r.data;
          } catch (e) {
            if (!isApiError(e) || e.status !== 404) throw e;
            if (import.meta.env.DEV) {
              console.warn(`[barback] first-pour slug did not resolve: ${slug}`);
            }
            return null;
          }
        }),
      );
      return results.filter((c): c is Cocktail => c !== null);
    },
    enabled: barId !== undefined,
  });
}

type NameList = ListResponse<Ingredient>;

/**
 * The names any lookup has read for this bar, of the ids asked for. Undefined
 * when none of them is known, so a first read is still a first read.
 */
function knownNames(
  queryClient: QueryClient,
  barId: number | undefined,
  ids: number[],
): NameList | undefined {
  const wanted = new Set(ids);
  const known = new Map<number, Ingredient>();
  for (const [, list] of queryClient.getQueriesData<NameList>({
    queryKey: ['ingredient-names', barId],
  })) {
    for (const i of list?.data ?? []) if (wanted.has(i.id)) known.set(i.id, i);
  }
  return known.size > 0 ? { data: [...known.values()] } : undefined;
}

/** The lookup's answer as the ledger reads it: each root's name, by id. */
const namesById = (r: NameList) => new Map(r.data.map((i) => [i.id, i.name]));

function nameLookupOptions(
  queryClient: QueryClient,
  barId: number | undefined,
  sorted: number[],
) {
  const key = sorted.join(',');
  return {
    queryKey: ['ingredient-names', barId, key],
    queryFn: () =>
      api<NameList>(`/ingredients?filter[id]=${key}&per_page=${sorted.length}`, { barId }),
    enabled: barId !== undefined && sorted.length > 0,
    staleTime: BOOTSTRAP_STALE_MS,
    placeholderData: () => knownNames(queryClient, barId, sorted),
    select: namesById,
  };
}

/** The options handed out so far, per client, by bar and set of roots. */
const heldNameOptions = new WeakMap<
  QueryClient,
  Map<string, ReturnType<typeof nameLookupOptions>>
>();

/**
 * Batch name lookup (filter[id] is exact/comma) — the shelf ledger's group
 * headers (frontend-spec §9). The set of roots changes whenever a bottle opens
 * or empties a group, and the lookup's key with it. A name already read stays
 * valid, so the new set starts from every name this bar has read, on this
 * screen or before it was last shown, while the lookup is out. A root none of
 * them names is missing from that map until the answer lands, and
 * isPlaceholderData says the map may be partial: the ledger holds that root's
 * bottles back while the lookup is fetching rather than read flat, and shows
 * them all when it is paused offline (Shelf).
 *
 * One set of roots gets one options object for the life of the client.
 * useQuery asks for the options on every render, and TanStack keeps a stand-in
 * from one render to the next only while placeholderData is the same function
 * (QueryObserver.createResult). A new one each render would read the cache
 * again, hand back a new map, notify, and render the Shelf again, for as long
 * as the lookup is out. The store holds one entry per set of roots the session
 * has seen, a handful. The options are built here, apart from the hook, so
 * they can be driven without rendering (ADR-011).
 */
export function ingredientNamesOptions(
  queryClient: QueryClient,
  barId: number | undefined,
  ids: number[],
) {
  const sorted = [...ids].sort((a, b) => a - b);
  const id = `${barId}|${sorted.join(',')}`;
  let held = heldNameOptions.get(queryClient);
  if (held === undefined) heldNameOptions.set(queryClient, (held = new Map()));
  let options = held.get(id);
  if (options === undefined) held.set(id, (options = nameLookupOptions(queryClient, barId, sorted)));
  return options;
}

/** The ledger's root names (ingredientNamesOptions). */
export function useIngredientsByIds(barId: number | undefined, ids: number[]) {
  const queryClient = useQueryClient();
  return useQuery(ingredientNamesOptions(queryClient, barId, ids));
}

/**
 * Par-level staples (data/staples.ts) resolved against this bar: id, name and
 * live shelf state per slug. Slugs carry the bar-id suffix upstream, so the
 * canonical slug is completed at runtime. A slug the bar answers 404 is not
 * in this bar (IngredientController::show ends in firstOrFail,
 * IngredientController.php 79-94 at v5.15.3) and is dropped (reported in dev)
 * rather than failing the whole set. Any other failure fails the set: a bar
 * that did not answer is never read as a shorter list of standing orders
 * (chrispezza/barback#68).
 */
export function useStaples(barId: number | undefined, slugs: string[]) {
  return useQuery({
    queryKey: ['staples', barId],
    queryFn: async () => {
      const results = await Promise.all(
        slugs.map(async (slug) => {
          try {
            const r = await api<ItemResponse<Ingredient>>(
              `/ingredients/${slug}-${barId}`,
              { barId },
            );
            return r.data;
          } catch (e) {
            if (!isApiError(e) || e.status !== 404) throw e;
            if (import.meta.env.DEV) {
              console.warn(`[barback] staple slug did not resolve: ${slug}`);
            }
            return null;
          }
        }),
      );
      return results.filter((i): i is Ingredient => i !== null);
    },
    enabled: barId !== undefined,
  });
}

/**
 * Restock recommendations (frontend-spec §2 Tonight, §9; ADR-008): the ten
 * bottles named by the most recipes among those NOT on the user's shelf
 * (IngredientService::getIngredientsForPossibleCocktails at v5.15.3). The
 * user-shelf route (ShelfController::recommend), never
 * /bars/{id}/ingredients/recommend, which ranks against the bar shelf that
 * Barback never writes (chrispezza/barback#22). Shelf-derived, so shelf
 * mutations invalidate ['recommend'].
 */
export function useRecommendations(
  barId: number | undefined,
  userId: number | undefined,
) {
  return useQuery({
    queryKey: ['recommend', barId, userId],
    queryFn: () =>
      api<ListResponse<RecommendedIngredient>>(
        `/users/${userId}/ingredients/recommend`,
        { barId },
      ),
    enabled: barId !== undefined && userId !== undefined,
    select: (r) => r.data,
  });
}

/** GET /cocktails/{id}/similar — full cocktail resources with stock flags. */
export function useSimilarCocktails(
  barId: number | undefined,
  cocktailId: number | undefined,
) {
  return useQuery({
    queryKey: ['similar', barId, cocktailId],
    queryFn: () =>
      api<ListResponse<Cocktail>>(`/cocktails/${cocktailId}/similar`, { barId }),
    enabled: barId !== undefined && cocktailId !== undefined,
    staleTime: BOOTSTRAP_STALE_MS,
    select: (r) => r.data,
  });
}

/**
 * What POST /cocktails/{id}/toggle-favorite answers: which way the toggle went.
 * Upstream toggles what it holds rather than setting what the tap meant
 * (CocktailController::toggleFavorite, CocktailController.php 221-228 in the
 * reference clone), so a drink favourited or taken off elsewhere since it was
 * read goes the other way from the tap.
 */
export interface FavoriteAnswer {
  id: number;
  is_favorited: boolean;
}

/** The list with the drink's favourite set to `favorited`, or undefined when nothing changes. */
function withFavorite(list: Cocktail[], id: number, favorited: boolean): Cocktail[] | undefined {
  if (!list.some((c) => c.id === id && c.is_favorited !== favorited)) return undefined;
  return list.map((c) => (c.id === id ? { ...c, is_favorited: favorited } : c));
}

/**
 * Put the bar's answer on every cached read that draws the drink: the recipe
 * (by slug or id), the cards "In the same vein" on other recipes, the index and
 * Tonight lists, the Classics roster. An updater that answers undefined leaves
 * a read alone.
 */
function settleFavorite(
  queryClient: QueryClient,
  barId: number | undefined,
  { id, is_favorited }: FavoriteAnswer,
): void {
  queryClient.setQueriesData<ItemResponse<Cocktail>>({ queryKey: ['cocktail', barId] }, (r) =>
    r && r.data.id === id && r.data.is_favorited !== is_favorited
      ? { ...r, data: { ...r.data, is_favorited } }
      : undefined,
  );
  for (const key of ['similar', 'cocktails'] as const) {
    queryClient.setQueriesData<ListResponse<Cocktail>>({ queryKey: [key, barId] }, (r) => {
      const data = r && withFavorite(r.data, id, is_favorited);
      return data && { ...r, data };
    });
  }
  queryClient.setQueriesData<Cocktail[]>({ queryKey: ['first-pours', barId] }, (list) =>
    list && withFavorite(list, id, is_favorited),
  );
}

/**
 * Favourite toggle (frontend-spec §2, §5; ADR-003 "reflects in UI in < 50 ms
 * (optimistic), reconciles with API in the background"): flip the recipe
 * before the write goes out, roll it back if the write is refused, and settle
 * every read that draws the drink to the bar's answer once it comes, then read
 * the recipe and the similar-drink cards that carry it back. A refusal reads
 * neither back: the rollback is the last answer, and a recipe re-read with the
 * bar gone would put the error line where the recipe stood.
 */
export function useToggleFavorite(barId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cocktailId }: { cocktailId: number; slug: string }) =>
      api<ItemResponse<FavoriteAnswer>>(`/cocktails/${cocktailId}/toggle-favorite`, {
        method: 'POST',
        barId,
      }),
    onMutate: async ({ slug }) => {
      await queryClient.cancelQueries({ queryKey: ['cocktail', barId, slug] });
      const prev = queryClient.getQueryData<ItemResponse<Cocktail>>([
        'cocktail',
        barId,
        slug,
      ]);
      if (prev) {
        queryClient.setQueryData(['cocktail', barId, slug], {
          data: { ...prev.data, is_favorited: !prev.data.is_favorited },
        });
      }
      return { prev };
    },
    onError: (_err, { slug }, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['cocktail', barId, slug], ctx.prev);
      showToast({ message: 'The favorite didn’t take.' });
    },
    onSuccess: (answer, { cocktailId }) => {
      const favorited = answer?.data?.is_favorited;
      if (typeof favorited === 'boolean') {
        settleFavorite(queryClient, barId, { id: cocktailId, is_favorited: favorited });
      }
      // The recipe under any slug or id it was read by, and the similar lists
      // that carry the drink: /similar holds for five minutes, and no other
      // list of it changed. Not awaited, so the button frees on the answer.
      void queryClient.invalidateQueries({
        queryKey: ['cocktail', barId],
        predicate: (q) => (q.state.data as ItemResponse<Cocktail> | undefined)?.data.id === cocktailId,
      });
      void queryClient.invalidateQueries({
        queryKey: ['similar', barId],
        predicate: (q) =>
          (q.state.data as ListResponse<Cocktail> | undefined)?.data.some((c) => c.id === cocktailId) ??
          false,
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['first-pours'] });
      void queryClient.invalidateQueries({ queryKey: ['cocktails'] });
    },
  });
}

/**
 * Add or remove shopping-list entries. Payload keys differ from the shelf batch.
 *
 * The write is pending until the list has been read back, not only until it
 * has answered: every + List and List it holds while the mutation is pending,
 * and whether a bottle is listed is drawn from that read. Freed on the answer
 * alone, a control still offers the bottle for one round trip, and a second
 * tap sends a second batch-store, which upstream answers by setting a listed
 * row's quantity back to the one sent, or 1 (ShoppingListController::batchStore,
 * ShoppingListController.php 76-79 at v5.15.3), and Tonight leaves a second
 * receipt.
 * TanStack awaits onSettled before it settles the mutation, so returning the
 * read-back is what holds it; a read-back that fails does not reject it.
 */
export function useShoppingMutation(
  barId: number | undefined,
  userId: number | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ingredientIds, action }: { ingredientIds: number[]; action: 'add' | 'remove' }) =>
      action === 'add'
        ? api(`/users/${userId}/shopping-list/batch-store`, {
            method: 'POST',
            barId,
            body: { ingredients: ingredientIds.map((id) => ({ id })) },
          })
        : api(`/users/${userId}/shopping-list/batch-delete`, {
            method: 'POST',
            barId,
            body: { ingredients: ingredientIds.map((id) => ({ id })) },
          }),
    onError: () => showToast({ message: 'The list didn’t take that change.' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['shopping-list'] }),
  });
}

/** One check-off: the listed bottle that was bought. */
export interface CheckOff {
  ingredientId: number;
}

/**
 * What every shelf change reads back once it has settled — a check-off and its
 * Undo, a chip, a ledger Remove and its Undo: the shelf, the list, the drink
 * sections and every count shown beside them — each row's "Unlocks N" and
 * "In N drinks", Buy next and Restock next, the staples (frontend-spec §4,
 * "they must refetch after any shelf change"; §6 journey 3, "refreshes all
 * counts"). Upstream works the unlock count out against the user's shelf, as
 * it does the drink sections and Restock next (IngredientController::extra in
 * the reference clone), and its shelf batch-store takes the bottle off the
 * list (ShelfController::batchStore). One list for all of them, so no shelf
 * change leaves a count where an earlier one put it.
 */
const SHELF_READ_BACK = [
  'shelf',
  'shopping-list',
  'cocktails',
  'ingredient-extra',
  'ingredient-reach',
  'recommend',
  'staples',
] as const;

function readBackShelf(queryClient: QueryClient): void {
  for (const key of SHELF_READ_BACK) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * The Undo on "Moved to the shelf.": the check-off in reverse, held to the
 * same rule (frontend-spec §5, "never the reverse order"). The list takes the
 * bottle back first; the shelf gives it up only once the list has it. Upstream's
 * shelf batch-delete leaves the list alone (ShelfController::batchDelete in the
 * reference clone), so a refused second step leaves the bottle in both places —
 * harmless, visible — and never in neither. A refusal at either step says
 * where the bottle is. Not a mutation: it is attempted however the device looks
 * (ADR-007: no outbox), and read back whatever was answered.
 */
async function undoCheckOff(
  queryClient: QueryClient,
  barId: number | undefined,
  userId: number | undefined,
  { ingredientId }: CheckOff,
): Promise<void> {
  let listed = false;
  try {
    await api(`/users/${userId}/shopping-list/batch-store`, {
      method: 'POST',
      barId,
      body: { ingredients: [{ id: ingredientId }] },
    });
    listed = true;
    await api(`/users/${userId}/ingredients/batch-delete`, {
      method: 'POST',
      barId,
      body: { ingredients: [ingredientId] },
    });
  } catch {
    showToast({
      message: listed
        ? 'The undo didn’t take — the bottle is on the list and still on the shelf.'
        : 'The undo didn’t take — the bottle is still on the shelf.',
    });
  } finally {
    readBackShelf(queryClient);
  }
}

/**
 * Check-off (frontend-spec §5): shelf batch-store FIRST, list batch-delete
 * only on success — a failure may leave the item in both places (visible,
 * self-healing), never vanished. Its Undo keeps the same rule the other way
 * round (undoCheckOff). The options are built here, apart from the hook, so
 * they can be driven without rendering (ADR-011).
 */
export function checkOffOptions(
  queryClient: QueryClient,
  barId: number | undefined,
  userId: number | undefined,
): UseMutationOptions<void, Error, CheckOff> {
  return {
    mutationFn: async ({ ingredientId }) => {
      await api(`/users/${userId}/ingredients/batch-store`, {
        method: 'POST',
        barId,
        body: { ingredients: [ingredientId] },
      });
      await api(`/users/${userId}/shopping-list/batch-delete`, {
        method: 'POST',
        barId,
        body: { ingredients: [{ id: ingredientId }] },
      });
    },
    onError: () =>
      showToast({ message: 'That didn’t move — the bottle is still on the list.' }),
    // Store-aisle mis-taps are the likeliest mis-tap in the app: same undo
    // courtesy the shelf-remove flow gets.
    onSuccess: (_data, vars) => {
      showToast({
        message: 'Moved to the shelf.',
        actionLabel: 'Undo',
        onAction: () => void undoCheckOff(queryClient, barId, userId, vars),
      });
    },
    onSettled: () => readBackShelf(queryClient),
  };
}

/** The check-off for shopping-list rows (checkOffOptions). */
export function useCheckOff(
  barId: number | undefined,
  userId: number | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation(checkOffOptions(queryClient, barId, userId));
}

/** One shelf toggle: the bottle as the chip or ledger row knows it, and which way. */
export interface ShelfToggle {
  ingredient: Pick<Ingredient, 'id' | 'slug' | 'name'>;
  action: 'add' | 'remove';
  /**
   * An Undo: the entry the removal took off the cached shelf, and where it
   * stood. It goes back as it was, placed in its group, rather than as a
   * pending entry that waits for the read-back.
   */
  restore?: { entry: Ingredient; index: number };
}

/** What a toggle changed on the cached shelf, so a refusal can undo just that. */
interface ShelfToggleContext {
  /** This toggle put a pending entry on the shelf. */
  added?: true;
  /** This toggle took this entry off the shelf, from this position. */
  removed?: { entry: Ingredient; index: number };
}

type ShelfList = ListResponse<Ingredient>;

const shelfToggleKey = (barId: number | undefined) => ['shelf-toggle', barId];

/**
 * The entry a bottle holds on the cached shelf between the tap and the
 * read-back: what the chip knows. IngredientResource always sends
 * materialized_path (null for a root; app/Http/Resources/IngredientResource.php
 * in the reference clone), so leaving it out marks the entry as not yet placed
 * in the hierarchy (data/hierarchy.ts isPlaced). Strength is unknown until the
 * read-back; nothing reads it from the shelf list.
 */
function pendingShelfEntry(ingredient: ShelfToggle['ingredient']): Ingredient {
  const { id, slug, name } = ingredient;
  return { id, slug, name, strength: 0, in_shelf: true };
}

function withShelfEntry(list: ShelfList, entry: Ingredient, index: number): ShelfList {
  if (list.data.some((i) => i.id === entry.id)) return list;
  const data = [...list.data];
  data.splice(index, 0, entry);
  return { ...list, data, meta: list.meta && { ...list.meta, total: list.meta.total + 1 } };
}

function withoutShelfEntry(list: ShelfList, id: number): ShelfList {
  if (!list.data.some((i) => i.id === id)) return list;
  return {
    ...list,
    data: list.data.filter((i) => i.id !== id),
    meta: list.meta && { ...list.meta, total: list.meta.total - 1 },
  };
}

/**
 * Shelf toggle (frontend-spec §5; ADR-003 "chip toggle reflects in UI in
 * < 50 ms"): flip the cached shelf before the write goes out, undo only this
 * toggle if the write is refused, and read the shelf back — with everything
 * server-derived from it — once the last toggle in flight has settled, so an
 * early answer cannot land on top of a later flip. Nothing else reads the shelf
 * in the meantime: onMutate cancels a read already out, useShelf holds its
 * background refetches, and the Undo is a toggle like any other (toggleShelf).
 * The options are built here, apart from the hook, so they can be driven
 * without rendering (ADR-011).
 */
export function shelfToggleOptions(
  queryClient: QueryClient,
  barId: number | undefined,
  userId: number | undefined,
): UseMutationOptions<unknown, Error, ShelfToggle, ShelfToggleContext> {
  const shelfKey = ['shelf', barId];
  const mutationKey = shelfToggleKey(barId);
  return {
    mutationKey,
    // Always attempt the write. TanStack's default ('online') pauses a mutation
    // while the device looks offline and replays it on reconnect: the chip would
    // claim a write nobody sent, and the guard would drop the tap that corrects
    // it. ADR-007: no outbox; mutations require connectivity. Offline, the fetch
    // rejects, and onError rolls back and says so.
    networkMode: 'always',
    mutationFn: ({ ingredient, action }) =>
      api(`/users/${userId}/ingredients/batch-${action === 'add' ? 'store' : 'delete'}`, {
        method: 'POST',
        barId,
        body: { ingredients: [ingredient.id] },
      }),
    onMutate: async ({ ingredient, action, restore }) => {
      // Nothing to flip before the shelf has loaded; the read-back settles it.
      if (!queryClient.getQueryData<ShelfList>(shelfKey)) return {};
      // A read-back already in flight would land on top of the flip.
      await queryClient.cancelQueries({ queryKey: shelfKey });
      const list = queryClient.getQueryData<ShelfList>(shelfKey);
      if (!list) return {};
      if (action === 'add') {
        if (list.data.some((i) => i.id === ingredient.id)) return {};
        const entry = restore?.entry ?? pendingShelfEntry(ingredient);
        const index = restore?.index ?? list.data.length;
        queryClient.setQueryData(shelfKey, withShelfEntry(list, entry, index));
        return { added: true };
      }
      const index = list.data.findIndex((i) => i.id === ingredient.id);
      const entry = list.data[index];
      if (!entry) return {};
      queryClient.setQueryData(shelfKey, withoutShelfEntry(list, ingredient.id));
      return { removed: { entry, index } };
    },
    onError: (_err, { ingredient }, ctx) => {
      // Undo this toggle, not a snapshot: a snapshot taken before it would also
      // undo any toggle made since that is still in flight.
      const list = queryClient.getQueryData<ShelfList>(shelfKey);
      if (list && ctx?.added) {
        queryClient.setQueryData(shelfKey, withoutShelfEntry(list, ingredient.id));
      }
      if (list && ctx?.removed) {
        const { entry, index } = ctx.removed;
        queryClient.setQueryData(shelfKey, withShelfEntry(list, entry, index));
      }
      showToast({ message: 'The shelf didn’t take that change.' });
    },
    onSuccess: (_data, vars, ctx) => {
      if (vars.action !== 'remove') return;
      showToast({
        message: 'Bottle removed from the shelf.',
        tone: 'destructive',
        actionLabel: 'Undo',
        // The Undo is the same toggle, the other way: optimistic, rolled back
        // with the same toast if refused, and read back only once the last
        // toggle in flight has settled.
        onAction: () =>
          toggleShelf(queryClient, barId, userId, {
            ingredient: vars.ingredient,
            action: 'add',
            restore: ctx?.removed,
          }),
      });
    },
    onSettled: () => {
      // A settling toggle still counts itself; any more are still in flight.
      if (queryClient.isMutating({ mutationKey }) > 1) return;
      readBackShelf(queryClient);
    },
  };
}

/** True while a toggle for this bottle is in flight. */
export function isShelfTogglePending(
  queryClient: QueryClient,
  barId: number | undefined,
  ingredientId: number,
): boolean {
  return (
    queryClient.isMutating({
      mutationKey: shelfToggleKey(barId),
      predicate: (m) =>
        (m.state.variables as ShelfToggle | undefined)?.ingredient.id === ingredientId,
    }) > 0
  );
}

/**
 * Fire one shelf toggle: the chip, the ledger's Remove and the Undo toast all
 * come through here. A toggle for a bottle whose last one is still in flight
 * is a double-tap, not a second decision, and is dropped; other bottles stay
 * live. Each toggle is its own mutation under the shelf-toggle key, observed
 * only until it settles, so it outlives the screen that fired it (an Undo can
 * be tapped after leaving the Shelf) and the cache can collect it afterwards.
 */
export function toggleShelf(
  queryClient: QueryClient,
  barId: number | undefined,
  userId: number | undefined,
  vars: ShelfToggle,
): void {
  if (isShelfTogglePending(queryClient, barId, vars.ingredient.id)) return;
  const observer = new MutationObserver(queryClient, shelfToggleOptions(queryClient, barId, userId));
  // A refusal is answered in onError (rollback and toast); nothing to rethrow.
  void observer
    .mutate(vars)
    .catch(() => undefined)
    .finally(() => observer.reset());
}

/** The shelf toggle for chips and ledger rows (toggleShelf). */
export function useShelfMutation(
  barId: number | undefined,
  userId: number | undefined,
) {
  const queryClient = useQueryClient();
  return {
    toggle: (vars: ShelfToggle) => toggleShelf(queryClient, barId, userId, vars),
  };
}
