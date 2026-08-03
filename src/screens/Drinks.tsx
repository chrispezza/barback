import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { RatioDevice } from '@ds/drinks/RatioDevice';
import { useBarId, useCocktails } from '../api/queries';
import { isStocked, type Cocktail } from '../api/types';
import { FamilyPicker, useActiveFamily } from '../components/FamilyPicker';

function matchFor(c: Cocktail): 'full' | 'partial' | 'near' | 'none' {
  const missing = c.ingredients.filter((i) => !isStocked(i) && !i.optional).length;
  if (missing === 0) return 'full';
  if (missing === 1) return 'near';
  if (missing <= 3) return 'partial';
  return 'none';
}

export function Drinks() {
  const barId = useBarId();
  const family = useActiveFamily();
  const { route, url, query } = useLocation();

  const page = Math.max(1, Number(query['page']) || 1);
  const filters = family?.tagId !== undefined ? { tag_id: family.tagId } : {};
  const cocktails = useCocktails(barId, filters, 50, true, page);

  function goToPage(next: number) {
    const path = url.split('?')[0] ?? '/drinks';
    const params = new URLSearchParams();
    const suffix = query['family'];
    if (suffix) params.set('family', suffix);
    if (next > 1) params.set('page', String(next));
    const qs = params.toString();
    route(qs ? `${path}?${qs}` : path);
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

  return (
    <main class="screen screen--index">
      <h1>Drinks</h1>
      <FamilyPicker />

      {family && (
        <header>
          <div class="recipe-ratio">
            <RatioDevice parts={family.def.canonicalRatio} size="md" />
          </div>
          <p class="recipe-aside">
            {family.def.blurb}
            {family.tagId === undefined && ' — family not yet tagged upstream; showing all drinks.'}
          </p>
          {summary && <p>{summary}</p>}
        </header>
      )}

      <MatchHeader label="The index" count={cocktails.data?.meta?.total} />
      <ul class="card-list">
        {cocktails.data?.data.map((c) => (
          <li key={c.id}>
            <DrinkCard
              name={c.name}
              ingredients={c.ingredients.map((entry) => ({
                name: entry.ingredient.name,
                have: isStocked(entry) || entry.optional,
              }))}
              match={matchFor(c)}
              onSelect={() => route(`/drinks/${c.slug}`)}
            />
          </li>
        ))}
      </ul>

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
    </main>
  );
}
