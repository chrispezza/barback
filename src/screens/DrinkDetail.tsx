import { Button } from '@ds/core/Button';
import { RatioDevice } from '@ds/drinks/RatioDevice';
import { ShelfRow } from '@ds/inventory/ShelfRow';
import {
  useBarId,
  useCocktail,
  useProfile,
  useShoppingList,
  useShoppingMutation,
} from '../api/queries';
import { ratioForSlug } from '../data/ratios';

export function DrinkDetail({ slug }: { slug: string }) {
  const barId = useBarId();
  const { data: cocktail, isLoading } = useCocktail(barId, slug);
  const { data: profile } = useProfile();
  const shoppingList = useShoppingList(barId, profile?.id);
  const shoppingMutation = useShoppingMutation(barId, profile?.id);

  if (isLoading) return <main class="screen screen--narrow" />;
  if (!cocktail) return <main class="screen screen--narrow">Not found.</main>;

  const ratio = ratioForSlug(cocktail.slug);
  const missing = cocktail.ingredients.filter((i) => !i.in_shelf && !i.optional);
  const listed = new Set(
    shoppingList.data?.data.map((item) => item.ingredient.id) ?? [],
  );
  const unlisted = missing.filter((m) => !listed.has(m.ingredient.id));

  return (
    <main class="screen screen--narrow">
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
      {unlisted.length > 0 && (
        <p>
          <Button
            variant="secondary"
            size="sm"
            disabled={shoppingMutation.isPending}
            onClick={() =>
              shoppingMutation.mutate({
                ingredientIds: unlisted.map((m) => m.ingredient.id),
                action: 'add',
              })
            }
          >
            Add missing to the list
          </Button>
        </p>
      )}
      {missing.length > 0 && unlisted.length === 0 && (
        <p class="recipe-aside">Already on the list.</p>
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
