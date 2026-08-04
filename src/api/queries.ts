import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import { showToast } from '../components/toasts';
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

export function useShoppingList(
  barId: number | undefined,
  userId: number | undefined,
) {
  return useQuery({
    queryKey: ['shopping-list', barId],
    queryFn: () =>
      api<ListResponse<ShoppingListItem>>(`/users/${userId}/shopping-list`, {
        barId,
      }),
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
 * CocktailService::getCocktailsByIngredients).
 */
export function useIngredientReach(
  barId: number | undefined,
  ingredientId: number,
  enabled: boolean,
): { count: number; via?: string } | undefined {
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
    enabled:
      barId !== undefined &&
      enabled &&
      own.data?.cocktails_count === 0 &&
      parent !== null,
    staleTime: BOOTSTRAP_STALE_MS,
    select: (r) => r.data,
  });

  if (!enabled) return undefined;
  const ownCount = own.data?.cocktails_count;
  if (ownCount === undefined) return undefined;
  if (ownCount > 0) return { count: ownCount };
  const parentCount = parentQuery.data?.cocktails_count;
  if (parentCount !== undefined && parentCount > 0 && parent) {
    return { count: parentCount, via: parent.name };
  }
  return undefined;
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

/**
 * Shelf toggle (frontend-spec §5): optimistic flip on the shelf query, then
 * invalidate everything server-derived from shelf state.
 */
export function useShelfMutation(
  barId: number | undefined,
  userId: number | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ingredientId, action }: { ingredientId: number; action: 'add' | 'remove' }) =>
      api(`/users/${userId}/ingredients/batch-${action === 'add' ? 'store' : 'delete'}`, {
        method: 'POST',
        barId,
        body: { ingredients: [ingredientId] },
      }),
    onError: () => showToast({ message: 'The shelf didn’t take that change.' }),
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
            body: { ingredients: [vars.ingredientId] },
          }).then(() => {
            void queryClient.invalidateQueries({ queryKey: ['shelf'] });
            void queryClient.invalidateQueries({ queryKey: ['cocktails'] });
          });
        },
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['shelf'] });
      void queryClient.invalidateQueries({ queryKey: ['shopping-list'] });
      void queryClient.invalidateQueries({ queryKey: ['cocktails'] });
      void queryClient.invalidateQueries({ queryKey: ['recommend'] });
      void queryClient.invalidateQueries({ queryKey: ['staples'] });
    },
  });
}
