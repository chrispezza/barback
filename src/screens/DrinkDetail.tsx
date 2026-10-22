import { useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { RatioDevice } from '@ds/drinks/RatioDevice';
import { EmptyState } from '@ds/feedback/EmptyState';
import { ShelfRow } from '@ds/inventory/ShelfRow';
import { measure } from '../api/measure';
import {
  isCocktailNotFound,
  useBarId,
  useBars,
  useCocktail,
  useProfile,
  useShelf,
  useShoppingList,
  useShoppingMutation,
  useSimilarCocktails,
  useToggleFavorite,
} from '../api/queries';
import { isStocked, shelfIndex } from '../api/types';
import { setScreenTitle } from '../app';
import { ErrorLine } from '../components/ErrorLine';
import { cardIngredients, matchState } from '../data/match';
import { deriveRatio, ratioForSlug } from '../data/ratios';

/** The screen's name when the bar has no drink by that slug. */
const NOT_FOUND_TITLE = 'No such drink';

/**
 * The screen's name while there is no drink to name it by (frontend-spec §1):
 * the tab while the recipe is read or in error, and the error view's heading.
 */
const SCREEN_TITLE = 'Recipe';

export function DrinkDetail({ slug }: { slug: string }) {
  const bars = useBars();
  const barId = useBarId();
  const { route } = useLocation();
  const recipe = useCocktail(barId, slug);
  const cocktail = recipe.data;
  const { data: profile } = useProfile();
  const shoppingList = useShoppingList(barId, profile?.id);
  const shoppingMutation = useShoppingMutation(barId, profile?.id);
  const similar = useSimilarCocktails(barId, cocktail?.id);
  // /similar carries no variant flags: its cards read a held child brand off
  // the shelf (chrispezza/barback#20). The recipe's own lines (show) have them.
  const shelf = useShelf(barId);
  const shelfIdx = shelf.data ? shelfIndex(shelf.data.data) : undefined;
  const toggleFavorite = useToggleFavorite(barId);

  // The bar's own 404: there is no such drink (CocktailController::show).
  const notFound = recipe.isError && isCocktailNotFound(recipe.error);

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

  // Before there is a recipe, one of three things is true (ADR-007; frontend-spec
  // §9 "quiet loading/error voices"; chrispezza/barback#68). The recipe read
  // waits on /bars for the bar id and stays disabled until then, so a disabled
  // read is never "missing": a bootstrap that failed is the error voice, and
  // its Retry asks for the bootstrap again.
  //
  // Offline, TanStack's default networkMode ('online') pauses a read instead
  // of failing it, and a paused read is neither loading nor in error. The bar
  // cannot answer, so a paused read with nothing to show is the error voice
  // too; it goes out again by itself on reconnect.
  const barsFailed = barId === undefined && (bars.isError || bars.isPaused);
  const recipePaused = recipe.isPending && recipe.isPaused;
  const failed = barsFailed || recipePaused || (recipe.isError && !notFound);

  // The tab names what the screen shows: the drink only beside its recipe.
  // While the recipe is read, or beside the error line, it names the screen,
  // never the screen or drink left behind (chrispezza/barback#108).
  const title = notFound ? NOT_FOUND_TITLE : !failed && cocktail ? cocktail.name : SCREEN_TITLE;
  useEffect(() => {
    setScreenTitle(title);
  }, [title]);

  if (failed) {
    // As in the not-found view, the heading names the screen for the outline
    // and RouteEffects, which moves focus to it after a route change; the
    // error line says the rest.
    return (
      <main class="screen screen--narrow">
        {backRow}
        <h1 class="visually-hidden">{SCREEN_TITLE}</h1>
        <ErrorLine onRetry={() => void (barsFailed ? bars.refetch() : recipe.refetch())} />
      </main>
    );
  }
  // Only the bar's own 404 says there is no such drink; the next move is the index.
  // The heading names the screen for the outline and RouteEffects; the empty
  // state says the rest.
  if (notFound) {
    return (
      <main class="screen screen--narrow">
        {backRow}
        <h1 class="visually-hidden">{NOT_FOUND_TITLE}</h1>
        <EmptyState
          body="No drink by that name — the index has the rest."
          action={
            <Button variant="secondary" size="sm" onClick={() => route('/drinks')}>
              Browse the index
            </Button>
          }
        />
      </main>
    );
  }
  // The bar, or the recipe, is still on its way.
  if (!cocktail) {
    return (
      <main class="screen screen--narrow" aria-busy="true">
        {backRow}
        <p class="recipe-aside">Fetching the recipe…</p>
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
                  ingredients={cardIngredients(c, shelfIdx)}
                  match={matchState(c, shelfIdx)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
