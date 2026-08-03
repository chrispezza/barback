import { RatioDevice } from '@ds/drinks/RatioDevice';
import { ShelfRow } from '@ds/inventory/ShelfRow';
import { useBarId, useCocktail } from '../api/queries';
import { ratioForSlug } from '../data/ratios';

export function DrinkDetail({ slug }: { slug: string }) {
  const barId = useBarId();
  const { data: cocktail, isLoading } = useCocktail(barId, slug);

  if (isLoading) return <main class="screen" />;
  if (!cocktail) return <main class="screen">Not found.</main>;

  const ratio = ratioForSlug(cocktail.slug);
  const missing = cocktail.ingredients.filter((i) => !i.in_shelf && !i.optional);

  return (
    <main class="screen">
      <h1>{cocktail.name}</h1>

      {ratio && (
        <div class="recipe-ratio">
          <RatioDevice parts={ratio.parts} />
        </div>
      )}

      <ul class="recipe-ingredients">
        {cocktail.ingredients.map((entry) => (
          <li key={entry.ingredient.id}>
            <ShelfRow
              name={entry.ingredient.name}
              brand={entry.formatted.oz.full_text}
              empty={!entry.in_shelf && !entry.optional}
            />
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <p class="missing-line">
          {missing.length === 1 ? 'One bottle away: ' : `Missing ${missing.length}: `}
          <em>{missing.map((m) => m.ingredient.name).join(', ')}</em>
        </p>
      )}

      <section>
        <p>{cocktail.instructions}</p>
        {cocktail.garnish && (
          <p class="recipe-aside">Garnish: {cocktail.garnish}</p>
        )}
      </section>
    </main>
  );
}
