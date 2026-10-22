import { useEffect, useRef } from 'preact/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { RatioDevice } from '@ds/drinks/RatioDevice';
import { EmptyState } from '@ds/feedback/EmptyState';
import { ShelfRow } from '@ds/inventory/ShelfRow';
import { api } from '../api/client';
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
import { isStocked, shelfIndex, type Cocktail, type Ingredient, type ItemResponse } from '../api/types';
import { unlessFailed } from '../api/unlocks';
import { appScreenBehind, setScreenTitle } from '../app';
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

/** The list action a reader pressed: one missing line's List it, or Add missing. */
type ListAction = { line: number } | 'missing';

/** The bottles on a shelf answer, as one comparable value. */
function bottlesOf(rows: readonly Pick<Ingredient, 'id'>[]): string {
  return rows
    .map((row) => row.id)
    .sort((a, b) => a - b)
    .join(',');
}

export function DrinkDetail({ slug }: { slug: string }) {
  const bars = useBars();
  const barId = useBarId();
  const { route } = useLocation();
  const queryClient = useQueryClient();
  const recipe = useCocktail(barId, slug);
  const cocktail = recipe.data;
  const { data: profile } = useProfile();
  const shoppingList = useShoppingList(barId, profile?.id);
  const shoppingMutation = useShoppingMutation(barId, profile?.id);
  const similar = useSimilarCocktails(barId, cocktail?.id);
  // /similar carries no variant flags: its cards read a held child brand off
  // the shelf (chrispezza/barback#20). The recipe's own lines (show) have them.
  const shelf = useShelf(barId);
  const toggleFavorite = useToggleFavorite(barId);

  // The bar's own 404: there is no such drink (CocktailController::show).
  const notFound = recipe.isError && isCocktailNotFound(recipe.error);

  // Standalone PWA has no browser chrome — the screen carries its own way back.
  // It steps back only onto a screen of the app's own; a recipe opened from
  // outside (a launch, a shared link, a tab that has been somewhere first)
  // goes to the index instead, never out of the app (frontend-spec §9).
  const goBack = () => {
    if (appScreenBehind()) window.history.back();
    else route('/drinks');
  };
  // The affordance is a word, not a glyph (the design system's Iconography).
  const backRow = (
    <p class="back-row">
      <Button variant="ghost" size="sm" onClick={goBack}>
        Back
      </Button>
    </p>
  );

  // Before there is a recipe, one of three things is true (ADR-007; frontend-spec
  // §9 "quiet loading/error voices"; chrispezza/barback#68). The recipe read
  // waits on /bars for the bar id and stays disabled until then, so a disabled
  // read is never "missing": a bootstrap that failed is the error voice, and
  // its Retry asks for the bootstrap again. A read goes out however the device
  // looks (src/api/client.ts queryDefaults, networkMode 'always'), so one the
  // bar cannot answer, offline included, fails into the error voice. A read
  // waits paused only for a retry that comes due while the document is hidden,
  // and goes out by itself once it is shown: it is still on its way, and the
  // screen says so (chrispezza/barback#143).
  const barsFailed = barId === undefined && bars.isError;
  const failed = barsFailed || (recipe.isError && !notFound);
  const shown = cocktail !== undefined && !failed && !notFound;

  // The tab names what the screen shows: the drink only beside its recipe.
  // While the recipe is read, or beside the error line, it names the screen,
  // never the screen or drink left behind (chrispezza/barback#108).
  const title = notFound ? NOT_FOUND_TITLE : !failed && cocktail ? cocktail.name : SCREEN_TITLE;
  useEffect(() => {
    setScreenTitle(title);
  }, [title]);

  // The recipe's own lines are stock answers: each line's in_shelf flags are
  // the bar's answer against the user's shelf (CocktailController::show), as
  // the cards' are. A shelf change reads back the shelf and every read drawn
  // from it, the cards "In the same vein" included, but not the recipe
  // (src/api/queries.ts readBackShelf). So once a shelf read lands holding
  // other bottles than the last one the bar answered here (an Undo tapped on
  // the recipe, a change made elsewhere), the lines are read again (ADR-007
  // Consequences, "No stock answer is ever served stale"; frontend-spec §4).
  // Only a read the bar answered counts: a toggle's optimistic flip is no
  // fetch, and the read-back after it is.
  const shelfFetching = shelf.isFetching;
  const shelfWasFetching = useRef(shelfFetching);
  const shelfAnswered = useRef<string | undefined>(undefined);
  /** The latest read-back asked for, so an earlier answer never lands on a later one. */
  const linesAsked = useRef(0);
  useEffect(() => {
    const landed = shelfWasFetching.current && !shelfFetching;
    shelfWasFetching.current = shelfFetching;
    const rows = unlessFailed(shelf)?.data;
    if (shelfFetching || rows === undefined) return;
    const bottles = bottlesOf(rows);
    const before = shelfAnswered.current;
    shelfAnswered.current = bottles;
    if (!landed || before === undefined || before === bottles || !shown) return;
    // Outside the recipe's query, so a read-back that fails leaves the recipe
    // as it stands rather than putting the error line in its place: what a
    // recipe whose read failed again should say is chrispezza/barback#127's
    // decision. The favourite stays as the screen holds it: the toggle owns it
    // (useToggleFavorite flips it at the tap, then settles it on the bar's
    // answer and reads the recipe back), and a read answered before the
    // toggle reaches the bar would take the flip away.
    const asked = ++linesAsked.current;
    const key = ['cocktail', barId, slug];
    api<ItemResponse<Cocktail>>(`/cocktails/${slug}`, { barId }).then(
      (answer) => {
        if (asked !== linesAsked.current) return;
        queryClient.setQueryData<ItemResponse<Cocktail>>(key, (held) =>
          held && { ...answer, data: { ...answer.data, is_favorited: held.data.is_favorited } },
        );
      },
      () => undefined,
    );
  }, [shelfFetching]);

  // Where the focus goes after a list write (ADR-003 Consequences: focus
  // management handled deliberately; frontend-spec §7). A list action is held
  // while its write is out with aria-disabled, never disabled: Chromium drops
  // the focus from a button that becomes disabled, and it does not come back.
  // Once the list is read back the action is replaced: a line's List it by
  // the word Listed, Add missing by "Already on the list.". Neither is a
  // control, so the focus falls to <body> with the button, and it is put on
  // what replaced the action instead: made focusable for the purpose (tabIndex
  // -1, never a Tab stop), as RouteEffects lands on a screen's heading
  // (src/app.tsx), and an announcement as that is, with no ring of its own.
  // Only focus that fell is moved: a reader who has moved on keeps their
  // place. A refused write leaves the action where it was, still focused, and
  // nothing to wait for (listThem). What replaced the action is looked for in
  // the page as it stands, not in what a render knew: an effect can run after
  // the tap that a render before it scheduled.
  const screen = useRef<HTMLElement>(null);
  const alreadyListed = useRef<HTMLParagraphElement>(null);
  const pressed = useRef<ListAction | null>(null);
  // Another recipe opened in this one's place (a card "In the same vein")
  // starts with nothing pressed.
  useEffect(() => {
    pressed.current = null;
  }, [slug]);
  useEffect(() => {
    const action = pressed.current;
    if (action === null) return;
    const landing =
      action === 'missing'
        ? alreadyListed.current
        : (screen.current?.querySelector<HTMLElement>(`[data-ingredient-id="${action.line}"] .listed-mark`) ?? null);
    if (landing === null) return;
    pressed.current = null;
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    landing.focus({ preventScroll: true, focusVisible: false });
  });

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

  // Every list action is held until the list is read back after a write
  // (useShoppingMutation), so a second tap in that round trip sends nothing.
  const listWriteOut = shoppingMutation.isPending;
  const listThem = (ingredientIds: number[], action: ListAction) => {
    if (listWriteOut) return;
    pressed.current = action;
    shoppingMutation.mutate(
      { ingredientIds, action: 'add' },
      {
        // Refused: the action stands, and keeps the focus; nothing will replace it.
        onError: () => {
          if (pressed.current === action) pressed.current = null;
        },
      },
    );
  };

  // "In the same vein" draws on two stock answers: /similar's, whose in_shelf
  // is the matcher's against the user's shelf, and a held child brand read off
  // the shelf (chrispezza/barback#20). Neither from a read whose refetch
  // failed, which keeps its last answer beside the error (unlessFailed): no
  // card from a /similar read that failed, and no brand off a shelf that
  // failed, where a card reads its own line flags instead, as on the Index and
  // Tonight (chrispezza/barback#104). The section says so in the error voice,
  // and its Retry asks again for whichever failed (ADR-007 Consequences;
  // chrispezza/barback#144). A shelf that failed beside no card leaves
  // nothing to say.
  const shelfAnswer = unlessFailed(shelf);
  const shelfIdx = shelfAnswer ? shelfIndex(shelfAnswer.data) : undefined;
  const similarCards = unlessFailed(similar)?.slice(0, 4) ?? [];
  const similarFailed = similar.isError || (shelf.isError && similarCards.length > 0);
  const retrySimilar = () => {
    if (similar.isError) void similar.refetch();
    if (shelf.isError) void shelf.refetch();
  };

  return (
    <main class="screen screen--narrow" ref={screen}>
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
            <li key={entry.ingredient.id} class="recipe-ing-row" data-ingredient-id={entry.ingredient.id}>
              <div class="recipe-ing-main">
                <ShelfRow
                  name={entry.ingredient.name}
                  brand={measure(entry)}
                  empty={isMissing}
                  optional={entry.optional}
                />
              </div>
              {/* The words Tonight lists a bottle with (the design system's
                  Iconography: affordances are words), named for the bottle,
                  the words first (WCAG 2.5.3, label in name). */}
              {isMissing &&
                (isListed ? (
                  <span class="listed-mark" tabIndex={-1}>
                    Listed
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-disabled={listWriteOut ? 'true' : undefined}
                    aria-label={`List it: ${entry.ingredient.name}`}
                    onClick={() => listThem([entry.ingredient.id], { line: entry.ingredient.id })}
                  >
                    List it
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
            aria-disabled={listWriteOut ? 'true' : undefined}
            onClick={() => listThem(unlisted.map((m) => m.ingredient.id), 'missing')}
          >
            Add missing to the list
          </Button>
        </p>
      )}
      {missing.length > 0 && unlisted.length === 0 && (
        <p class="recipe-aside" tabIndex={-1} ref={alreadyListed}>
          Already on the list.
        </p>
      )}

      <section>
        <p>{cocktail.instructions}</p>
        {cocktail.garnish && (
          <p class="recipe-aside">Garnish: {cocktail.garnish}</p>
        )}
      </section>

      {(similarCards.length > 0 || similarFailed) && (
        <section class="similar-section">
          <MatchHeader label="In the same vein" align="left" />
          {similarFailed && <ErrorLine onRetry={retrySimilar} />}
          {similarCards.length > 0 && (
            <ul class="card-list">
              {similarCards.map((c) => (
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
          )}
        </section>
      )}
    </main>
  );
}
