import { Button } from '@ds/core/Button';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import {
  useBarId,
  useFirstPours,
  useProfile,
  useShoppingList,
  useShoppingMutation,
  useToggleFavorite,
} from '../api/queries';
import { isStocked, type Cocktail } from '../api/types';
import { ErrorLine } from '../components/ErrorLine';
import { showToast } from '../components/toasts';
import { FIRST_POUR_SLUGS } from '../data/first-pours';

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

/**
 * Onboarding step 2 (aspiration): pick the drinks the bar should pour and
 * each choice queues its missing bottles — explicit per tap, never bulk.
 * Un-choosing leaves the queued bottles alone (the toast says so): a list
 * entry is only ever removed by hand (ADR-008).
 */
export function FirstPours() {
  const barId = useBarId();
  const { data: profile } = useProfile();
  const pours = useFirstPours(barId, FIRST_POUR_SLUGS);
  const shoppingList = useShoppingList(barId, profile?.id);
  const shoppingMutation = useShoppingMutation(barId, profile?.id);
  const toggleFavorite = useToggleFavorite(barId);

  const listedIds = new Set(
    shoppingList.data?.data.map((item) => item.ingredient.id) ?? [],
  );

  function choose(cocktail: Cocktail) {
    if (toggleFavorite.isPending) return;
    toggleFavorite.mutate({ cocktailId: cocktail.id, slug: cocktail.slug });
    if (cocktail.is_favorited) {
      showToast({
        message: `${cocktail.name} — removed from favorites. Its bottles stay on the list.`,
      });
      return;
    }
    const unqueued = cocktail.ingredients
      .filter((i) => !isStocked(i) && !i.optional && !listedIds.has(i.ingredient.id))
      .map((i) => i.ingredient.id);
    if (unqueued.length === 0) {
      showToast({ message: `${cocktail.name} — favorited.` });
      return;
    }
    shoppingMutation.mutate(
      { ingredientIds: unqueued, action: 'add' },
      {
        onSuccess: () =>
          showToast({
            message: `${cocktail.name} — favorited, ${unqueued.length} bottle${
              unqueued.length === 1 ? '' : 's'
            } queued.`,
          }),
      },
    );
  }

  return (
    <main class="screen screen--index">
      <h1>The classics</h1>
      <p class="recipe-aside">
        Pick the drinks your bar should pour. Each choice queues the bottles
        it’s missing — the list assembles the bar for you.
      </p>

      {pours.isError && <ErrorLine onRetry={() => void pours.refetch()} />}
      <MatchHeader label="The roster" count={pours.data?.length} />
      <ul class="card-list">
        {pours.data?.map((c) => (
          <li key={c.id} class="first-pour-item">
            <DrinkCard
              name={c.name}
              favorited={c.is_favorited}
              href={`/drinks/${c.slug}`}
              ingredients={toCardIngredients(c)}
              match={cardMatch(c)}
            />
            <Button
              variant={c.is_favorited ? 'ghost' : 'secondary'}
              size="sm"
              aria-pressed={c.is_favorited}
              disabled={toggleFavorite.isPending || shoppingMutation.isPending}
              onClick={() => choose(c)}
            >
              {c.is_favorited ? '✓ Chosen' : 'Choose'}
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}
