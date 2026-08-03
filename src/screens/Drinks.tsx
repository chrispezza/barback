import { useLocation } from 'preact-iso';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { RatioDevice } from '@ds/drinks/RatioDevice';
import { useBarId, useCocktails } from '../api/queries';
import type { Cocktail } from '../api/types';
import { FamilyPicker, useActiveFamily } from '../components/FamilyPicker';

function matchFor(c: Cocktail): 'full' | 'partial' | 'near' | 'none' {
  const missing = c.ingredients.filter((i) => !i.in_shelf && !i.optional).length;
  if (missing === 0) return 'full';
  if (missing === 1) return 'near';
  if (missing <= 3) return 'partial';
  return 'none';
}

export function Drinks() {
  const barId = useBarId();
  const family = useActiveFamily();
  const { route } = useLocation();

  const filters = family?.tagId !== undefined ? { tag_id: family.tagId } : {};
  const cocktails = useCocktails(barId, filters, 50);

  return (
    <main class="screen">
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
                have: entry.in_shelf || entry.optional,
              }))}
              match={matchFor(c)}
              onSelect={() => route(`/drinks/${c.slug}`)}
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
