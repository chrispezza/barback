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

async function meiliSearch<T>(
  index: string,
  token: string,
  q: string,
): Promise<T[]> {
  const res = await fetch(`${MEILI_URL}/indexes/${index}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ q, limit: 12 }),
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const body = (await res.json()) as { hits: T[] };
  return body.hits;
}

/** Type-ahead over the ingredients index; degrades to REST name filter. */
export function useIngredientSearch(q: string) {
  const { data: bars } = useBars();
  const bar = bars?.[0];
  const query = q.trim();
  return useQuery({
    queryKey: ['search', 'ingredients', query],
    enabled: query.length >= 2 && bar !== undefined,
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
