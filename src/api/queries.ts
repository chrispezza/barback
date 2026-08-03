import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import type {
  Bar,
  Cocktail,
  Ingredient,
  ItemResponse,
  ListResponse,
  Profile,
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
) {
  return useQuery({
    queryKey: ['cocktails', barId, filters, perPage],
    queryFn: () =>
      api<ListResponse<Cocktail>>(
        `/cocktails?${cocktailQueryString(filters, perPage)}`,
        { barId },
      ),
    enabled: barId !== undefined && enabled,
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['shelf'] });
      void queryClient.invalidateQueries({ queryKey: ['shopping-list'] });
      void queryClient.invalidateQueries({ queryKey: ['cocktails'] });
      void queryClient.invalidateQueries({ queryKey: ['ingredient-extra'] });
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['shelf'] });
      void queryClient.invalidateQueries({ queryKey: ['shopping-list'] });
      void queryClient.invalidateQueries({ queryKey: ['cocktails'] });
    },
  });
}
