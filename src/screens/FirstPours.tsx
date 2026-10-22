import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'preact/hooks';
import { Button } from '@ds/core/Button';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import {
  shoppingListOptions,
  useBarId,
  useBars,
  useFirstPours,
  useProfile,
  useShoppingList,
  useShoppingMutation,
  useToggleFavorite,
} from '../api/queries';
import { isStocked, type Cocktail, type ListResponse, type ShoppingListItem } from '../api/types';
import { unlessFailed } from '../api/unlocks';
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
 * meant to choose. No toast is shown before the server answers, and what a
 * toast says is what it answered. The toggle itself shows the tap's intent at
 * once, while the favourite is out, and the bar's answer once it is in
 * (useToggleFavorite flips the roster at the tap: ADR-003 Validation, §5).
 * What to queue is decided against the list as read, so Choose waits until
 * the list has been read: a bottle already listed is not sent again, since
 * upstream batch-store resets a listed row's quantity to 1
 * (ShoppingListController::batchStore, ShoppingListController.php 76-79). A
 * later read of the list (the tab coming back into view refetches it) holds
 * no toggle: the rows of the read before it are in hand, and a Choose made
 * during that read waits for it before deciding.
 *
 * Each drink has one toggle (the WAI-ARIA toggle button pattern): named
 * "Choose <drink>" in every state, with aria-pressed carrying the state. The
 * pressed state is the filled variant with the check, never the check alone
 * (DS readme, Iconography; "State is never colour alone"). A held toggle is
 * aria-disabled, never disabled: Chromium blurs a focused button that gains
 * the disabled attribute and the focus does not come back, so Enter on a
 * Choose would leave a keyboard user on the page body (ADR-003 Consequences).
 * A tap on a held toggle still reaches choose(), which turns it away.
 *
 * Un-choosing leaves the queued bottles alone, and says so when one of the
 * drink's missing bottles is on the list: a list entry is only ever removed by
 * hand (ADR-008).
 */
export function FirstPours() {
  const barId = useBarId();
  const queryClient = useQueryClient();
  const profileQuery = useProfile();
  const profile = profileQuery.data;
  const pours = useFirstPours(barId, FIRST_POUR_SLUGS);
  // A roster read whose refetch failed keeps its last answer beside the error,
  // and each card's match mark is a stock answer: the roster shows the error
  // line alone, with no count and no card (ADR-007 Consequences, "No stock
  // answer is ever served stale"; chrispezza/barback#105).
  const roster = unlessFailed(pours);
  const shoppingList = useShoppingList(barId, profile?.id);
  const shoppingMutation = useShoppingMutation(barId, profile?.id);
  const toggleFavorite = useToggleFavorite(barId);
  // One choice at a time, from the tap until its last write has answered and,
  // after a list write, the list has been read back (useShoppingMutation
  // settles the write only once that read is over). The ref answers a second
  // tap at once; the state holds the toggles.
  const choosing = useRef(false);
  const [isChoosing, setIsChoosing] = useState(false);

  // A cold start with the API out of reach (ADR-007; chrispezza/barback#68):
  // without /bars there is no bar id, and the roster and the list keyed on it
  // stay disabled and never error on their own.
  const bars = useBars();
  const barsFailed = barId === undefined && bars.isError;
  // The list cannot be read: its own read failed, or the bar or the profile it
  // is keyed on did.
  const profileFailed = profile?.id === undefined && profileQuery.isError;
  const listFailed = shoppingList.isError || barsFailed || profileFailed;
  // Choose is held until the list has been read, and after a read failed. Not
  // for a read under way while rows from one that succeeded are in hand:
  // choose() waits for that read instead.
  const listHeld = !shoppingList.isSuccess || listFailed;
  const held = isChoosing || listHeld;

  /** Ask again for what failed: the roster, the list, or the bar and profile they wait on. */
  function retry() {
    if (barsFailed) void bars.refetch();
    if (pours.isError) void pours.refetch();
    if (profileFailed) void profileQuery.refetch();
    if (shoppingList.isError) void shoppingList.refetch();
  }

  /**
   * The list to decide against: the rows of the last read, or, while a read is
   * under way, the rows it brings. Undefined when the list cannot be read. It
   * asks the query, not this render, which can lag a read that has just begun.
   */
  async function listAsRead(): Promise<ListResponse<ShoppingListItem> | undefined> {
    const key = shoppingListOptions(barId, profile?.id).queryKey;
    const state = queryClient.getQueryState<ListResponse<ShoppingListItem>>(key);
    if (state?.fetchStatus === 'fetching') {
      // Joins the read under way; cancelRefetch: false starts no second one.
      const read = await shoppingList.refetch({ cancelRefetch: false });
      return read.isSuccess ? read.data : undefined;
    }
    return state?.status === 'success' ? state.data : undefined;
  }

  async function choose(cocktail: Cocktail) {
    if (choosing.current || listHeld) return;
    choosing.current = true;
    setIsChoosing(true);
    try {
      const list = await listAsRead();
      // The read failed: the error line says so, and nothing is sent.
      if (list === undefined) return;
      const listedIds = new Set(list.data.map((item) => item.ingredient.id));
      const missing = missingIds(cocktail);
      const unqueued = missing.filter((id) => !listedIds.has(id));
      const listedCount = missing.filter((id) => listedIds.has(id)).length;
      const answer = await toggleFavorite.mutateAsync({
        cocktailId: cocktail.id,
        slug: cocktail.slug,
      });
      if (!favoritedAfter(answer, !cocktail.is_favorited)) {
        // Counted flatly: one listed bottle is "Its bottle".
        const stays =
          listedCount === 0
            ? ''
            : listedCount === 1
              ? ' Its bottle stays on the list.'
              : ' Its bottles stay on the list.';
        showToast({ message: `${cocktail.name} — removed from favorites.${stays}` });
        return;
      }
      // Favourited by a tap that meant to take it off: nothing was chosen,
      // so nothing is queued.
      if (cocktail.is_favorited || unqueued.length === 0) {
        showToast({ message: `${cocktail.name} — favorited.` });
        return;
      }
      // Resolves only once the list has been read back after the write
      // (useShoppingMutation), so the next Choose decides against rows that
      // include it. A read that took the read-back's place
      // (chrispezza/barback#142) may still be under way when the toggles are
      // freed; the next Choose joins it before deciding (listAsRead).
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
      <MatchHeader label="The roster" count={roster?.length} />
      <ul class="card-list">
        {roster?.map((c) => (
          <li key={c.id} class="first-pour-item">
            <DrinkCard
              name={c.name}
              favorited={c.is_favorited}
              href={`/drinks/${c.slug}`}
              ingredients={cardIngredients(c)}
              match={matchState(c)}
            />
            <Button
              variant={c.is_favorited ? 'primary' : 'secondary'}
              size="sm"
              aria-label={`Choose ${c.name}`}
              aria-pressed={c.is_favorited}
              aria-disabled={held ? 'true' : undefined}
              onClick={() => void choose(c)}
            >
              {c.is_favorited ? '✓ Choose' : 'Choose'}
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}
