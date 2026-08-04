import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { RatioDevice } from '@ds/drinks/RatioDevice';
import { ShelfRow } from '@ds/inventory/ShelfRow';
import {
  useBarId,
  useCocktail,
  useProfile,
  useShoppingList,
  useShoppingMutation,
  useSimilarCocktails,
  useToggleFavorite,
} from '../api/queries';
import { isStocked, type Cocktail } from '../api/types';
import { ratioForSlug } from '../data/ratios';

function toCardIngredients(cocktail: Cocktail) {
  return cocktail.ingredients.map((entry) => ({
    name: entry.ingredient.name,
    have: isStocked(entry) || entry.optional,
  }));
}

function cardMatch(cocktail: Cocktail): 'full' | 'partial' | 'near' {
  if (cocktail.in_shelf) return 'full';
  const missing = cocktail.ingredients.filter(
    (i) => !isStocked(i) && !i.optional,
  ).length;
  return missing === 1 ? 'near' : 'partial';
}

export function DrinkDetail({ slug }: { slug: string }) {
  const barId = useBarId();
  const { route } = useLocation();
  const { data: cocktail, isLoading } = useCocktail(barId, slug);
  const { data: profile } = useProfile();
  const shoppingList = useShoppingList(barId, profile?.id);
  const shoppingMutation = useShoppingMutation(barId, profile?.id);
  const similar = useSimilarCocktails(barId, cocktail?.id);
  const toggleFavorite = useToggleFavorite(barId);

  if (isLoading) return <main class="screen screen--narrow" />;
  if (!cocktail) return <main class="screen screen--narrow">Not found.</main>;

  const ratio = ratioForSlug(cocktail.slug);
  const missing = cocktail.ingredients.filter((i) => !isStocked(i) && !i.optional);
  const listed = new Set(
    shoppingList.data?.data.map((item) => item.ingredient.id) ?? [],
  );
  const unlisted = missing.filter((m) => !listed.has(m.ingredient.id));

  return (
    <main class="screen screen--narrow">
      <h1>{cocktail.name}</h1>

      <p class="favorite-row">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!toggleFavorite.isPending) {
              toggleFavorite.mutate({ cocktailId: cocktail.id, slug });
            }
          }}
        >
          {cocktail.is_favorited ? '♦ Favorited' : '◇ Favorite'}
        </Button>
      </p>

      {ratio && (
        <div class="recipe-ratio">
          <RatioDevice parts={ratio.parts} />
        </div>
      )}

      <ul class="recipe-ingredients">
        {cocktail.ingredients.map((entry) => {
          const isMissing = !isStocked(entry) && !entry.optional;
          const isListed = listed.has(entry.ingredient.id);
          return (
            <li key={entry.ingredient.id} class="recipe-ing-row">
              <div class="recipe-ing-main">
                <ShelfRow
                  name={entry.ingredient.name}
                  brand={
                    // Dashes, barspoons etc. must not be unit-converted (2 dash, not 0.02 oz)
                    ['ml', 'cl', 'oz'].includes(entry.units)
                      ? entry.formatted.oz.full_text
                      : `${entry.amount} ${entry.units} ${entry.ingredient.name}`
                  }
                  empty={isMissing}
                />
              </div>
              {isMissing &&
                (isListed ? (
                  <span class="listed-mark">Listed</span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={shoppingMutation.isPending}
                    onClick={() =>
                      shoppingMutation.mutate({
                        ingredientIds: [entry.ingredient.id],
                        action: 'add',
                      })
                    }
                  >
                    + List
                  </Button>
                ))}
            </li>
          );
        })}
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

      {similar.data && similar.data.length > 0 && (
        <section class="similar-section">
          <MatchHeader label="In the same vein" align="left" />
          <ul class="card-list">
            {similar.data.slice(0, 4).map((c) => (
              <li key={c.id}>
                <DrinkCard
                  name={c.name}
                  ingredients={toCardIngredients(c)}
                  match={cardMatch(c)}
                  onSelect={() => route(`/drinks/${c.slug}`)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
