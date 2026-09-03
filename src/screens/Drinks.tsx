import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { RatioDevice } from '@ds/drinks/RatioDevice';
import { EmptyState } from '@ds/feedback/EmptyState';
import { SearchField } from '@ds/forms/SearchField';
import { useBarId, useCocktails } from '../api/queries';
import { useCocktailSearch } from '../api/search';
import { isStocked, type Cocktail } from '../api/types';
import { ErrorLine } from '../components/ErrorLine';
import { FamilyPicker, useActiveFamily } from '../components/FamilyPicker';
import { useDebounced } from '../hooks';

function matchFor(c: Cocktail): 'full' | 'partial' | 'near' | 'none' {
  const missing = c.ingredients.filter((i) => !isStocked(i) && !i.optional).length;
  if (missing === 0) return 'full';
  if (missing === 1) return 'near';
  if (missing <= 3) return 'partial';
  return 'none';
}

function toCardIngredients(c: Cocktail) {
  return c.ingredients.map((entry) => ({
    name: entry.ingredient.name,
    have: isStocked(entry),
    optional: entry.optional,
  }));
}

export function Drinks() {
  const barId = useBarId();
  const family = useActiveFamily();
  const { route, url, query } = useLocation();

  // Search is a filter on the index, not a second list: Meilisearch (or the
  // REST name filter) ranks the ids, then the full resources come back with
  // stock flags so hits render as the same cards as everything else.
  const [searchQuery, setSearchQuery] = useState('');
  const hasQuery = searchQuery.trim().length >= 1;
  const searchHits = useCocktailSearch(useDebounced(searchQuery, 200));
  const hitIds = searchHits.data?.map((h) => h.id) ?? [];
  const hitCocktails = useCocktails(
    barId,
    { id: hitIds.join(',') },
    Math.max(hitIds.length, 1),
    hasQuery && hitIds.length > 0,
  );
  const hitRank = new Map(hitIds.map((id, i) => [id, i]));
  const hits = [...(hitCocktails.data?.data ?? [])].sort(
    (a, b) => (hitRank.get(a.id) ?? 0) - (hitRank.get(b.id) ?? 0),
  );

  const page = Math.max(1, Number(query['page']) || 1);
  const showFavorites = query['fav'] === '1';
  const filters = {
    ...(family?.tagId !== undefined ? { tag_id: family.tagId } : {}),
    ...(showFavorites ? { favorites: true } : {}),
  };
  const cocktails = useCocktails(barId, filters, 50, true, page);

  function buildUrl(next: number, fav: boolean) {
    const path = url.split('?')[0] ?? '/drinks';
    const params = new URLSearchParams();
    const suffix = query['family'];
    if (suffix) params.set('family', suffix);
    if (fav) params.set('fav', '1');
    if (next > 1) params.set('page', String(next));
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }

  function goToPage(next: number) {
    route(buildUrl(next, showFavorites));
  }

  // Family stock summary (frontend-spec §6): two count-only queries.
  const hasFamilyTag = family?.tagId !== undefined;
  const familyCanMake = useCocktails(
    barId,
    { on_shelf: true, tag_id: family?.tagId },
    1,
    hasFamilyTag,
  );
  const familyNearMiss = useCocktails(
    barId,
    { missing_ingredients: 1, tag_id: family?.tagId },
    1,
    hasFamilyTag,
  );
  const summary =
    family?.tagId !== undefined &&
    cocktails.data?.meta &&
    familyCanMake.data?.meta &&
    familyNearMiss.data?.meta
      ? `You can pour ${familyCanMake.data.meta.total} of ${cocktails.data.meta.total} · ${
          familyNearMiss.data.meta.total === 1
            ? '1 is one bottle away.'
            : `${familyNearMiss.data.meta.total} are one bottle away.`
        }`
      : null;

  const lastPage = cocktails.data?.meta?.last_page ?? 1;

  const card = (c: Cocktail) => (
    <li key={c.id}>
      <DrinkCard
        name={c.name}
        favorited={c.is_favorited}
        href={`/drinks/${c.slug}`}
        ingredients={toCardIngredients(c)}
        match={matchFor(c)}
      />
    </li>
  );

  return (
    <main class="screen screen--index">
      <h1>Drinks</h1>
      <FamilyPicker />

      <SearchField
        value={searchQuery}
        label="Find a drink"
        placeholder="Search by name"
        onChange={setSearchQuery}
        onClear={() => setSearchQuery('')}
      />

      {hasQuery ? (
        <section aria-live="polite">
          <MatchHeader
            label="Matches"
            count={searchHits.data ? searchHits.data.length : undefined}
          />
          {hitCocktails.isError && <ErrorLine onRetry={() => void hitCocktails.refetch()} />}
          {searchHits.data?.length === 0 && (
            <p class="recipe-aside">Nothing by that name.</p>
          )}
          <ul class="card-list">{hits.map(card)}</ul>
        </section>
      ) : (
        <>
          {family && (
            <header>
              <div class="recipe-ratio">
                <RatioDevice parts={family.def.canonicalRatio} size="md" />
              </div>
              <p class="recipe-aside">
                {family.def.blurb}
                {import.meta.env.DEV &&
                  family.tagId === undefined &&
                  ' — dev: family not yet tagged upstream; showing all drinks.'}
              </p>
              {summary && <p>{summary}</p>}
            </header>
          )}

          <p class="favorites-filter-row">
            <Button
              variant={showFavorites ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={showFavorites}
              onClick={() => route(buildUrl(1, !showFavorites))}
            >
              {showFavorites ? '✓ Favorites' : 'Favorites'}
            </Button>
          </p>

          <MatchHeader
            label={showFavorites ? 'Favorites' : 'The index'}
            count={cocktails.data?.meta?.total}
          />
          {showFavorites && cocktails.data?.meta?.total === 0 && (
            <EmptyState
              body="Nothing favorited yet — Favorite on any recipe starts the collection."
              action={
                <Button variant="secondary" size="sm" onClick={() => route('/first-pours')}>
                  Start with the classics
                </Button>
              }
            />
          )}
          {cocktails.isError && <ErrorLine onRetry={() => void cocktails.refetch()} />}
          <ul class="card-list">{cocktails.data?.data.map(card)}</ul>

          {lastPage > 1 && (
            <div class="pager">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </Button>
              <span class="pager-info">
                Page {page} of {lastPage}
              </span>
              <Button variant="ghost" size="sm" disabled={page >= lastPage} onClick={() => goToPage(page + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
