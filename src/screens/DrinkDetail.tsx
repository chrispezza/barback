import { useBarId, useCocktail } from '../api/queries';
import { ratioForSlug } from '../data/ratios';
import { RatioDevice } from '../components/RatioDevice';

export function DrinkDetail({ slug }: { slug: string }) {
  const barId = useBarId();
  const { data: cocktail, isLoading } = useCocktail(barId, slug);

  if (isLoading) return <main class="screen">…</main>;
  if (!cocktail) return <main class="screen">Not found.</main>;

  const ratio = ratioForSlug(cocktail.slug);
  const missing = cocktail.ingredients.filter((i) => !i.in_shelf && !i.optional);

  return (
    <main class="screen">
      <h1>{cocktail.name}</h1>
      {ratio && <RatioDevice parts={ratio.parts} />}

      <ul>
        {cocktail.ingredients.map((entry) => (
          <li key={entry.ingredient.id}>
            {entry.formatted.oz.full_text}
            {entry.in_shelf ? ' ✓' : ' ·'}
            {entry.optional && ' (optional)'}
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <p>
          Missing: {missing.map((m) => m.ingredient.name).join(', ')}
        </p>
      )}

      <section>
        <h2>Method</h2>
        <p>{cocktail.instructions}</p>
        {cocktail.garnish && <p>Garnish: {cocktail.garnish}</p>}
      </section>
    </main>
  );
}
