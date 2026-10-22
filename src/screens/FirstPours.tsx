import { useRef, useState } from 'preact/hooks';
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
import { cardIngredients, matchState } from '../data/match';

/** The drink's missing bottles: required lines the shelf does not cover. */
function missingIds(cocktail: Cocktail): number[] {
  return cocktail.ingredients
    .filter((i) => !isStocked(i) && !i.optional)
    .map((i) => i.ingredient.id);
}

/**
 * Whether toggle-favorite left the drink a favourite. Upstream toggles, and
 * answers which way it went: `{ data: { id, is_favorited } }`
 * (CocktailController::toggleFavorite, CocktailController.php 221-228 at
 * v5.15.3). A drink favourited or taken off elsewhere since the roster was
 * read goes the other way from the tap. Without that answer, the tap's own
 * intent stands.
 */
function favoritedAfter(answer: unknown, intended: boolean): boolean {
  if (typeof answer !== 'object' || answer === null || !('data' in answer)) return intended;
  const { data } = answer;
  if (typeof data !== 'object' || data === null || !('is_favorited' in data)) return intended;
  return typeof data.is_favorited === 'boolean' ? data.is_favorited : intended;
}

/**
 * Onboarding step 2 (aspiration): pick the drinks the bar should pour and
 * each choice queues its missing bottles — explicit per tap, never bulk.
 *
 * A bottle queued here is on the list because its drink is a favourite
 * (ADR-008: every list entry must be able to say why it exists). So the list
 * write goes out only once toggle-favorite has answered that the drink now is
 * one, sequenced as check-off is (frontend-spec §5), and only for a tap that
 * meant to choose. Nothing is said before the server answers, and what is
 * said is what it answered. What to queue is decided against the list as
 * read, so Choose waits until the list has been read: a bottle already listed
 * is not sent again, since upstream batch-store resets a listed row's quantity
 * to 1 (ShoppingListController::batchStore, ShoppingListController.php 76-79).
 *
 * Un-choosing leaves the queued bottles alone, and says so when one of the
 * drink's missing bottles is on the list: a list entry is only ever removed by
 * hand (ADR-008).
 */
export function FirstPours() {
  const barId = useBarId();
  const profileQuery = useProfile();
  const profile = profileQuery.data;
  const pours = useFirstPours(barId, FIRST_POUR_SLUGS);
  const shoppingList = useShoppingList(barId, profile?.id);
  const shoppingMutation = useShoppingMutation(barId, profile?.id);
  const toggleFavorite = useToggleFavorite(barId);
  // One choice at a time, from the tap until its last write has answered. The
  // ref answers a second tap at once; the state holds the buttons.
  const choosing = useRef(false);
  const [isChoosing, setIsChoosing] = useState(false);

  // The list as just read: not while a read is under way, whose answer is not
  // in yet, nor after one failed, when the rows in hand are none or stale.
  const listRead = shoppingList.isSuccess && !shoppingList.isFetching;
  // The list cannot be read: its own read failed, or the profile it is keyed on did.
  const profileFailed = profile?.id === undefined && profileQuery.isError;
  const listFailed = shoppingList.isError || profileFailed;
  const listedIds = new Set(
    shoppingList.data?.data.map((item) => item.ingredient.id) ?? [],
  );

  /** Ask again for what failed: the roster, the list, or the profile it waits on. */
  function retry() {
    if (pours.isError) void pours.refetch();
    if (profileFailed) void profileQuery.refetch();
    if (shoppingList.isError) void shoppingList.refetch();
  }

  async function choose(cocktail: Cocktail) {
    if (choosing.current || !listRead) return;
    choosing.current = true;
    setIsChoosing(true);
    // Decided at the tap, against the list as read.
    const missing = missingIds(cocktail);
    const unqueued = missing.filter((id) => !listedIds.has(id));
    const anyListed = missing.some((id) => listedIds.has(id));
    try {
      const answer = await toggleFavorite.mutateAsync({
        cocktailId: cocktail.id,
        slug: cocktail.slug,
      });
      if (!favoritedAfter(answer, !cocktail.is_favorited)) {
        showToast({
          message: `${cocktail.name} — removed from favorites.${
            anyListed ? ' Its bottles stay on the list.' : ''
          }`,
        });
        return;
      }
      // Favourited by a tap that meant to take it off: nothing was chosen,
      // so nothing is queued.
      if (cocktail.is_favorited || unqueued.length === 0) {
        showToast({ message: `${cocktail.name} — favorited.` });
        return;
      }
      await shoppingMutation.mutateAsync({ ingredientIds: unqueued, action: 'add' });
      showToast({
        message: `${cocktail.name} — favorited, ${unqueued.length} bottle${
          unqueued.length === 1 ? '' : 's'
        } queued.`,
      });
    } catch {
      // A refused write is answered by its own hook: the rollback and the toast.
    } finally {
      choosing.current = false;
      setIsChoosing(false);
    }
  }

  return (
    <main class="screen screen--index">
      <h1>The classics</h1>
      <p class="recipe-aside">
        Pick the drinks your bar should pour. Each choice queues the bottles
        it’s missing — the list assembles the bar for you.
      </p>

      {(pours.isError || listFailed) && <ErrorLine onRetry={retry} />}
      <MatchHeader label="The roster" count={pours.data?.length} />
      <ul class="card-list">
        {pours.data?.map((c) => (
          <li key={c.id} class="first-pour-item">
            <DrinkCard
              name={c.name}
              favorited={c.is_favorited}
              href={`/drinks/${c.slug}`}
              ingredients={cardIngredients(c)}
              match={matchState(c)}
            />
            <Button
              variant={c.is_favorited ? 'ghost' : 'secondary'}
              size="sm"
              aria-pressed={c.is_favorited}
              disabled={isChoosing || !listRead}
              onClick={() => void choose(c)}
            >
              {c.is_favorited ? '✓ Chosen' : 'Choose'}
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}
