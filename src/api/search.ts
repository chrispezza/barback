import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { useBars } from './queries';
import type { Ingredient, ListResponse } from './types';

// ADR-004: the API's search_host reports the compose-internal hostname, so the
// browser-reachable host is client config (the Salt Rim pattern). The scoped
// token still comes from the API at runtime.
const MEILI_URL: string =
  import.meta.env.VITE_MEILISEARCH_URL ?? 'http://localhost:7700';

export interface IngredientHit {
  id: number;
  slug: string;
  name: string;
}

/** How many hits a type-ahead asks for, from Meilisearch or the REST fallback. */
const SEARCH_LIMIT = 12;

/** Meilisearch's search response, the fields read here. With limit/offset,
 *  estimatedTotalHits counts every match, not the page. */
interface MeiliPage<T> {
  hits: T[];
  estimatedTotalHits?: number;
}

async function meiliPage<T>(
  index: string,
  token: string,
  q: string,
): Promise<MeiliPage<T>> {
  const res = await fetch(`${MEILI_URL}/indexes/${index}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ q, limit: SEARCH_LIMIT }),
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return (await res.json()) as MeiliPage<T>;
}

async function meiliSearch<T>(
  index: string,
  token: string,
  q: string,
): Promise<T[]> {
  return (await meiliPage<T>(index, token, q)).hits;
}

export interface CocktailHit {
  id: number;
  slug: string;
  name: string;
  short_ingredients?: string[];
}

/** One answer to a cocktail search: the first hits, and how many drinks match. */
export interface CocktailSearch {
  hits: CocktailHit[];
  /** Every match, not the page: Meilisearch's estimatedTotalHits, or the REST
   *  fallback's meta.total. */
  total: number;
}

/** Type-ahead over the cocktails index; degrades to REST name filter. */
export function useCocktailSearch(q: string) {
  const { data: bars } = useBars();
  const bar = bars?.[0];
  const query = q.trim();
  return useQuery({
    queryKey: ['search', 'cocktails', query],
    enabled: query.length >= 1 && bar !== undefined,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CocktailSearch> => {
      if (bar?.search_token) {
        try {
          const page = await meiliPage<CocktailHit>('cocktails', bar.search_token, query);
          return { hits: page.hits, total: Math.max(page.estimatedTotalHits ?? 0, page.hits.length) };
        } catch {
          // Meilisearch down — browsing still works via REST (ADR-004).
        }
      }
      const rest = await api<ListResponse<{ id: number; slug: string; name: string }>>(
        `/cocktails?filter[name]=${encodeURIComponent(query)}&per_page=${SEARCH_LIMIT}`,
        { barId: bar?.id },
      );
      const hits = rest.data.map(({ id, slug, name }) => ({ id, slug, name }));
      return { hits, total: Math.max(rest.meta?.total ?? 0, hits.length) };
    },
  });
}

/** Type-ahead over the ingredients index; degrades to REST name filter. */
export function useIngredientSearch(q: string) {
  const { data: bars } = useBars();
  const bar = bars?.[0];
  const query = q.trim();
  return useQuery({
    queryKey: ['search', 'ingredients', query],
    enabled: query.length >= 1 && bar !== undefined,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<IngredientHit[]> => {
      if (bar?.search_token) {
        try {
          return await meiliSearch<IngredientHit>(
            'ingredients',
            bar.search_token,
            query,
          );
        } catch {
          // Meilisearch down — browsing still works via REST (ADR-004).
        }
      }
      const rest = await api<ListResponse<Ingredient>>(
        `/ingredients?filter[name]=${encodeURIComponent(query)}&per_page=12`,
        { barId: bar?.id },
      );
      return rest.data.map(({ id, slug, name }) => ({ id, slug, name }));
    },
  });
}
