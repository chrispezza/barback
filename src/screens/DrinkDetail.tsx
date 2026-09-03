import { useEffect } from 'preact/hooks';
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
import { isStocked, type Cocktail, type CocktailIngredientEntry } from '../api/types';
import { setScreenTitle } from '../app';
import { ErrorLine } from '../components/ErrorLine';
import { deriveRatio, fractionGlyph, ratioForSlug } from '../data/ratios';

function toCardIngredients(cocktail: Cocktail) {
  return cocktail.ingredients.map((entry) => ({
    name: entry.ingredient.name,
    have: isStocked(entry),
    optional: entry.optional,
  }));
}

function cardMatch(cocktail: Cocktail): 'full' | 'partial' | 'near' {
  if (cocktail.in_shelf) return 'full';
  const missing = cocktail.ingredients.filter(
    (i) => !isStocked(i) && !i.optional,
  ).length;
  return missing === 1 ? 'near' : 'partial';
}

/** The measure only — the row already prints the name above it. Dashes,
 *  barspoons etc. must not be unit-converted (2 dash, not 0.02 oz). */
function measure(entry: CocktailIngredientEntry): string {
  if (['ml', 'cl', 'oz'].includes(entry.units)) {
    return `${fractionGlyph(entry.formatted.oz.amount)} oz`;
  }
  return `${entry.amount} ${entry.units}`;
}

export function DrinkDetail({ slug }: { slug: string }) {
  const barId = useBarId();
  const { route } = useLocation();
  const { data: cocktail, isLoading, isError, refetch } = useCocktail(barId, slug);
  const { data: profile } = useProfile();
  const shoppingList = useShoppingList(barId, profile?.id);
  const shoppingMutation = useShoppingMutation(barId, profile?.id);
  const similar = useSimilarCocktails(barId, cocktail?.id);
  const toggleFavorite = useToggleFavorite(barId);

  useEffect(() => {
    if (cocktail) setScreenTitle(cocktail.name);
  }, [cocktail?.name]);

  // Standalone PWA has no browser chrome — the screen carries its own way back.
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else route('/drinks');
  };
  const backRow = (
    <p class="back-row">
      <Button variant="ghost" size="sm" onClick={goBack}>
        ← Back
      </Button>
    </p>
  );

  if (isLoading) {
    return (
      <main class="screen screen--narrow" aria-busy="true">
        {backRow}
        <p class="recipe-aside">Fetching the recipe…</p>
      </main>
    );
  }
  if (isError) {
    return (
      <main class="screen screen--narrow">
        {backRow}
        <ErrorLine onRetry={() => void refetch()} />
      </main>
    );
  }
  if (!cocktail) {
    return (
      <main class="screen screen--narrow">
        {backRow}
        <p class="recipe-aside">Not found.</p>
      </main>
    );
  }

  // Curated template first; otherwise the skeleton read off the recipe, so the
  // signature element leads every recipe, not just the curated few.
  const ratio = ratioForSlug(cocktail.slug) ?? deriveRatio(cocktail);
  const missing = cocktail.ingredients.filter((i) => !isStocked(i) && !i.optional);
  const listed = new Set(
    shoppingList.data?.data.map((item) => item.ingredient.id) ?? [],
  );
  const unlisted = missing.filter((m) => !listed.has(m.ingredient.id));

  return (
    <main class="screen screen--narrow">
      {backRow}
      <h1>{cocktail.name}</h1>

      <p class="favorite-row">
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={cocktail.is_favorited}
          onClick={() => {
            if (!toggleFavorite.isPending) {
              toggleFavorite.mutate({ cocktailId: cocktail.id, slug });
            }
          }}
        >
          {cocktail.is_favorited ? '✓ Favorited' : 'Favorite'}
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
                  brand={measure(entry)}
                  empty={isMissing}
                  optional={entry.optional}
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
                    aria-label={`Add ${entry.ingredient.name} to the list`}
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
                  favorited={c.is_favorited}
                  href={`/drinks/${c.slug}`}
                  ingredients={toCardIngredients(c)}
                  match={cardMatch(c)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
