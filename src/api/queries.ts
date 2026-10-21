import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { api } from './client';
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
  return useQuery({
    queryKey: ['shelf', barId],
    queryFn: () =>
      api<ListResponse<Ingredient>>(
        '/ingredients?filter[on_shelf]=true&per_page=200',
        { barId },
      ),
    enabled: barId !== undefined,
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

export function useCocktail(barId: number | undefined, idOrSlug: string) {
  return useQuery({
    queryKey: ['cocktail', barId, idOrSlug],
    queryFn: () => api<ItemResponse<Cocktail>>(`/cocktails/${idOrSlug}`, { barId }),
    enabled: barId !== undefined,
    select: (r) => r.data,
  });
}

export interface ListSnapshot {
  at: string;
  names: string[];
}

const LIST_SNAPSHOT_KEY = 'barback:list-snapshot';

/** Last list the API served — the store-aisle fallback when it's unreachable. */
export function readListSnapshot(): ListSnapshot | null {
  try {
    const raw = localStorage.getItem(LIST_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as ListSnapshot) : null;
  } catch {
    return null;
  }
}

export function useShoppingList(
  barId: number | undefined,
  userId: number | undefined,
) {
  return useQuery({
    queryKey: ['shopping-list', barId],
    queryFn: async () => {
      const res = await api<ListResponse<ShoppingListItem>>(
        `/users/${userId}/shopping-list`,
        { barId },
      );
      try {
        localStorage.setItem(
          LIST_SNAPSHOT_KEY,
          JSON.stringify({
            at: new Date().toISOString(),
            names: res.data.map((i) => i.ingredient.name).sort(),
          } satisfies ListSnapshot),
        );
      } catch {
        // Snapshot is a courtesy — never fail the live list over it.
      }
      return res;
    },
    enabled: barId !== undefined && userId !== undefined,
  });
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

/** First-pours roster (data/first-pours.ts): full cocktails resolved by slug. */
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
          } catch {
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

/**
 * Batch name lookup (filter[id] is exact/comma) — shelf ledger group headers.
 * The set of roots changes whenever a bottle opens or empties a group; the
 * names already held stay valid, so they carry over while the new set loads
 * and an emptied group closes without the ledger dropping every header.
 */
export function useIngredientsByIds(barId: number | undefined, ids: number[]) {
  const key = [...ids].sort((a, b) => a - b).join(',');
  return useQuery({
    queryKey: ['ingredient-names', barId, key],
    queryFn: () =>
      api<ListResponse<Ingredient>>(
        `/ingredients?filter[id]=${key}&per_page=${ids.length}`,
        { barId },
      ),
    enabled: barId !== undefined && ids.length > 0,
    staleTime: BOOTSTRAP_STALE_MS,
    placeholderData: keepPreviousData,
    select: (r) => new Map(r.data.map((i) => [i.id, i.name])),
  });
}

/**
 * Par-level staples (data/staples.ts) resolved against this bar: id, name and
 * live shelf state per slug. Slugs carry the bar-id suffix upstream, so the
 * canonical slug is completed at runtime. Missing slugs are dropped (and
 * reported in dev) rather than failing the whole set.
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
          } catch {
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
 * Restock recommendations (frontend-spec §5): server-ranked bottles that open
 * the most drinks. Shelf-derived, so shelf mutations invalidate ['recommend'].
 */
export function useRecommendations(barId: number | undefined) {
  return useQuery({
    queryKey: ['recommend', barId],
    queryFn: () =>
      api<ListResponse<RecommendedIngredient>>(
        `/bars/${barId}/ingredients/recommend`,
        { barId },
      ),
    enabled: barId !== undefined,
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

/** Optimistic favorite flip on the detail cache; rolled back on error (§5). */
export function useToggleFavorite(barId: number | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cocktailId }: { cocktailId: number; slug: string }) =>
      api(`/cocktails/${cocktailId}/toggle-favorite`, { method: 'POST', barId }),
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['first-pours'] });
      void queryClient.invalidateQueries({ queryKey: ['cocktails'] });
    },
  });
}

/** Add or remove shopping-list entries. Payload keys differ from the shelf batch. */
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['shopping-list'] });
    },
  });
}

/**
 * Check-off (frontend-spec §5): shelf batch-store FIRST, list batch-delete
 * only on success — a failure may leave the item in both places (visible,
 * self-healing), never vanished.
 */
export function useCheckOff(
  barId: number | undefined,
  userId: number | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ingredientId }: { ingredientId: number }) => {
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
        onAction: () => {
          void (async () => {
            await api(`/users/${userId}/ingredients/batch-delete`, {
              method: 'POST',
              barId,
              body: { ingredients: [vars.ingredientId] },
            });
            await api(`/users/${userId}/shopping-list/batch-store`, {
              method: 'POST',
              barId,
              body: { ingredients: [{ id: vars.ingredientId }] },
            });
            for (const key of ['shelf', 'shopping-list', 'cocktails', 'recommend', 'staples']) {
              void queryClient.invalidateQueries({ queryKey: [key] });
            }
          })();
        },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['shelf'] });
      void queryClient.invalidateQueries({ queryKey: ['shopping-list'] });
      void queryClient.invalidateQueries({ queryKey: ['cocktails'] });
      void queryClient.invalidateQueries({ queryKey: ['ingredient-extra'] });
      void queryClient.invalidateQueries({ queryKey: ['recommend'] });
      void queryClient.invalidateQueries({ queryKey: ['staples'] });
    },
  });
}

/** One shelf toggle: the bottle as the chip or ledger row knows it, and which way. */
export interface ShelfToggle {
  ingredient: Pick<Ingredient, 'id' | 'slug' | 'name'>;
  action: 'add' | 'remove';
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
 * early answer cannot land on top of a later flip. The options are built here,
 * apart from the hook, so they can be driven without rendering (ADR-011).
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
    mutationFn: ({ ingredient, action }) =>
      api(`/users/${userId}/ingredients/batch-${action === 'add' ? 'store' : 'delete'}`, {
        method: 'POST',
        barId,
        body: { ingredients: [ingredient.id] },
      }),
    onMutate: async ({ ingredient, action }) => {
      // Nothing to flip before the shelf has loaded; the read-back settles it.
      if (!queryClient.getQueryData<ShelfList>(shelfKey)) return {};
      // A read-back already in flight would land on top of the flip.
      await queryClient.cancelQueries({ queryKey: shelfKey });
      const list = queryClient.getQueryData<ShelfList>(shelfKey);
      if (!list) return {};
      if (action === 'add') {
        if (list.data.some((i) => i.id === ingredient.id)) return {};
        const pending = pendingShelfEntry(ingredient);
        queryClient.setQueryData(shelfKey, withShelfEntry(list, pending, list.data.length));
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
    onSuccess: (_data, vars) => {
      if (vars.action !== 'remove') return;
      showToast({
        message: 'Bottle removed from the shelf.',
        tone: 'destructive',
        actionLabel: 'Undo',
        onAction: () => {
          void api(`/users/${userId}/ingredients/batch-store`, {
            method: 'POST',
            barId,
            body: { ingredients: [vars.ingredient.id] },
          }).then(() => {
            void queryClient.invalidateQueries({ queryKey: ['shelf'] });
            void queryClient.invalidateQueries({ queryKey: ['cocktails'] });
          });
        },
      });
    },
    onSettled: () => {
      // A settling toggle still counts itself; any more are still in flight.
      if (queryClient.isMutating({ mutationKey }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: ['shelf'] });
      void queryClient.invalidateQueries({ queryKey: ['shopping-list'] });
      void queryClient.invalidateQueries({ queryKey: ['cocktails'] });
      void queryClient.invalidateQueries({ queryKey: ['recommend'] });
      void queryClient.invalidateQueries({ queryKey: ['staples'] });
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
 * The shelf toggle for chips and ledger rows. `toggle` is the guarded entry
 * point: a second tap on a bottle whose toggle is still in flight is a
 * double-tap, not a second decision, and is dropped. Other bottles stay live.
 */
export function useShelfMutation(
  barId: number | undefined,
  userId: number | undefined,
) {
  const queryClient = useQueryClient();
  const mutation = useMutation(shelfToggleOptions(queryClient, barId, userId));
  return {
    ...mutation,
    toggle: (vars: ShelfToggle) => {
      if (isShelfTogglePending(queryClient, barId, vars.ingredient.id)) return;
      mutation.mutate(vars);
    },
  };
}
