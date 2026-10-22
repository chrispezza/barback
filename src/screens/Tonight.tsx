import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { EmptyState } from '@ds/feedback/EmptyState';
import { SearchField } from '@ds/forms/SearchField';
import { IngredientChip } from '@ds/inventory/IngredientChip';
import {
  readListSnapshot,
  useBarId,
  useCheckOff,
  useCocktails,
  useIngredientUnlocks,
  useProfile,
  useRecommendations,
  useShelf,
  useShoppingList,
  useShoppingMutation,
  useStaples,
} from '../api/queries';
import { shelfIndex, type RecommendedIngredient } from '../api/types';
import { useIngredientSearch } from '../api/search';
import { FamilyPicker, useActiveFamily } from '../components/FamilyPicker';
import { ErrorLine } from '../components/ErrorLine';
import { showToast } from '../components/toasts';
import { ShoppingRow } from '../components/ShoppingRow';
import {
  buyNextGroups,
  favoriteGaps,
  forgetQueued,
  forgetRestocked,
  queuedThisSession,
  rankFavoriteNeeds,
  rememberQueued,
  restockSuggestions,
  staplesToQueue,
} from '../data/buy-next';
import { cardIngredients } from '../data/match';
import { STAPLE_SLUGS } from '../data/staples';
import { useDebounced } from '../hooks';

/** On one column the pour stack is capped; this many cards show before "Show all". */
const POUR_PREVIEW = 4;

/** The one bottle to buy next, with its reason in the aside voice. */
function BuyNextCard({
  id,
  name,
  reason,
  disabled,
  onList,
}: {
  id: number;
  name: string;
  reason?: string;
  disabled: boolean;
  onList: () => void;
}) {
  const barId = useBarId();
  const { data: unlocks } = useIngredientUnlocks(barId, id);
  const line =
    reason ??
    (unlocks !== undefined && unlocks > 0
      ? `opens ${unlocks} drink${unlocks === 1 ? '' : 's'} tonight`
      : 'ranked highest for your shelf');
  return (
    <section class="buy-next">
      <MatchHeader label="Buy next" align="left" />
      <div class="buy-next-card">
        <div class="buy-next-main">
          <span class="buy-next-name">{name}</span>
          <span class="buy-next-reason">{line}</span>
        </div>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={onList}>
          List it
        </Button>
      </div>
    </section>
  );
}

/** One restock suggestion: live "unlocks N" (same voice as the shopping list). */
function RestockRow({
  suggestion,
  onList,
  disabled,
}: {
  suggestion: RecommendedIngredient;
  onList: () => void;
  disabled: boolean;
}) {
  const barId = useBarId();
  const { data: unlocks } = useIngredientUnlocks(barId, suggestion.id);
  return (
    <div class="restock-row">
      <span class="restock-name">{suggestion.name}</span>
      {unlocks !== undefined && unlocks > 0 && (
        <span class="restock-unlocks">unlocks {unlocks}</span>
      )}
      <Button size="sm" variant="ghost" disabled={disabled} onClick={onList}>
        List it
      </Button>
    </div>
  );
}

export function Tonight() {
  const barId = useBarId();
  const family = useActiveFamily();
  const familyFilter = family?.tagId !== undefined ? { tag_id: family.tagId } : {};
  // Scoped copy: "sours you can pour" — the whole-bar line above stays whole-bar.
  const scope = family?.tagId !== undefined ? family.def.plural : undefined;

  const canMake = useCocktails(barId, { on_shelf: true, ...familyFilter });
  const nearMiss = useCocktails(barId, { missing_ingredients: 1, ...familyFilter });
  const { data: profile } = useProfile();
  const shoppingList = useShoppingList(barId, profile?.id);
  const checkOff = useCheckOff(barId, profile?.id);
  const { route } = useLocation();
  const [showAllPour, setShowAllPour] = useState(false);

  const canMakeTotal = canMake.data?.meta?.total;
  const pourCards = canMake.data?.data ?? [];
  const shelfIsBare = canMakeTotal === 0 && nearMiss.data?.meta?.total === 0;

  const listItems = shoppingList.data?.data ?? [];
  const snapshot = shoppingList.isError ? readListSnapshot() : null;

  // Dashboard lead: whole-bar counts, deliberately unscoped by family — the
  // line is the bar's status; the scoped story is told by the sections below.
  const barCanMake = useCocktails(barId, { on_shelf: true }, 1);
  const barNearMiss = useCocktails(barId, { missing_ingredients: 1 }, 1);
  const statusReady =
    barCanMake.data?.meta !== undefined &&
    barNearMiss.data?.meta !== undefined &&
    shoppingList.data !== undefined;

  // Restock (frontend-spec §2, §9; ADR-008): ranked by the server against the
  // user's shelf, the one Barback writes, so it already leaves out what that
  // shelf holds (chrispezza/barback#22). The client filter in data/buy-next.ts
  // stays as a safety net for what the ranking cannot see: the list, staples,
  // favourites and held child brands (ADR-001: never an upstream patch).
  const recommendations = useRecommendations(barId, profile?.id);
  const shelf = useShelf(barId);
  // GET /cocktails carries no variant flags: the cards and the favourites gaps
  // read a held child brand off the shelf (chrispezza/barback#20).
  const shelfIdx = shelf.data ? shelfIndex(shelf.data.data) : undefined;
  const shoppingMutation = useShoppingMutation(barId, profile?.id);
  const ownedOrListed = new Set([
    ...listItems.map((item) => item.ingredient.id),
    ...(shelf.data?.data.map((i) => i.id) ?? []),
  ]);
  // Free-form add: same type-ahead the Shelf uses, writing to the list.
  const [listQuery, setListQuery] = useState('');
  const listResults = useIngredientSearch(useDebounced(listQuery, 200));
  const listedIds = new Set(listItems.map((item) => item.ingredient.id));

  // Listing a bottle from a suggestion moves it out of that group and into the
  // list — off-screen on a phone — so every "List it" leaves a receipt.
  function listIt(id: number, name: string) {
    shoppingMutation.mutate(
      { ingredientIds: [id], action: 'add' },
      { onSuccess: () => showToast({ message: `${name} — listed.` }) },
    );
  }

  // Par-level staples: the curated file IS the standing order, so a staple
  // that leaves the shelf is queued automatically — with attribution (toast +
  // 'Staple' detail on the row). Once per emptying: data/buy-next.ts holds a
  // queued staple for the page session, so leaving Tonight does not forget it,
  // until this screen reads it back on the shelf. Opt out by editing
  // data/staples.ts.
  const staples = useStaples(barId, STAPLE_SLUGS);
  const stapleIds = new Set((staples.data ?? []).map((s) => s.id));
  // What this mount has sent. A failed write leaves the session memory so the
  // next mount sends it again; this mount does not, or a lasting failure would
  // loop (mutations do not retry).
  const sentThisMount = useRef(new Set<number>());
  const staplesOut = staplesToQueue(
    staples.data ?? [],
    listedIds,
    new Set([...queuedThisSession, ...sentThisMount.current]),
  );
  useEffect(() => {
    if (staples.data === undefined) return;
    forgetRestocked(staples.data);
    for (const s of staples.data) if (s.in_shelf) sentThisMount.current.delete(s.id);
  }, [staples.data]);
  useEffect(() => {
    if (profile?.id === undefined || staplesOut.length === 0) return;
    if (shoppingList.data === undefined) return; // don't queue against a stale view
    const ids = staplesOut.map((s) => s.id);
    const queuedNames = staplesOut.map((s) => s.name).join(', ');
    rememberQueued(ids);
    for (const id of ids) sentThisMount.current.add(id);
    shoppingMutation
      .mutateAsync(
        { ingredientIds: ids, action: 'add' },
        { onSuccess: () => showToast({ message: `Staples out — queued: ${queuedNames}.` }) },
      )
      // The promise settles after Tonight unmounts too; mutate's onError would not.
      .catch(() => forgetQueued(ids));
  }, [staplesOut.map((s) => s.id).join(','), profile?.id, shoppingList.data === undefined]);

  // What the favorited drinks still need — aspiration outranks the generic
  // server ranking, so these pin above Restock next (data/buy-next.ts).
  const favorites = useCocktails(barId, { favorites: true }, 100);
  const favoriteNeeds = rankFavoriteNeeds(
    favoriteGaps(favorites.data?.data ?? [], ownedOrListed, shelfIdx),
  );
  // Staples and favorite gaps own their groups; both stay out of the
  // general suggestions, as does a parent a held brand already covers.
  const suggestions = restockSuggestions(
    recommendations.data ?? [],
    ownedOrListed,
    stapleIds,
    favoriteNeeds,
    shelfIdx,
  );
  // Buy next: one decision-ready bottle, which leaves the group it came from.
  const {
    pick: buyNext,
    favoriteNeeds: favoriteNeedsShown,
    suggestions: suggestionsShown,
  } = buyNextGroups(favoriteNeeds, suggestions);

  return (
    <main class="screen">
      <h1>Tonight</h1>
      {/* The three numbers are also the way to their sections — on one column
          the list can sit a long way down. Plain hash links: preact-iso leaves
          them to the browser, which also moves focus to the target. */}
      <p class="bar-status" aria-busy={!statusReady}>
        {statusReady ? (
          <>
            You can pour{' '}
            <a href="#pour"><strong>{barCanMake.data?.meta?.total}</strong></a> ·{' '}
            <a href="#near"><strong>{barNearMiss.data?.meta?.total}</strong></a> one bottle away ·{' '}
            <a href="#buy"><strong>{listItems.length}</strong></a> to buy
          </>
        ) : (
          <span class="recipe-aside">Counting the bar…</span>
        )}
      </p>
      <FamilyPicker />

      {/* Grid areas put the list ABOVE the near-miss stack on one column —
          the actionable gap must never hide under 38 drink cards. */}
      <div class="tonight-grid">
        <section class="tonight-pour" id="pour" tabIndex={-1}>
          <MatchHeader label={scope ? `${scope} you can pour` : 'You can pour'} count={canMakeTotal} />
          {canMake.isError && <ErrorLine onRetry={() => void canMake.refetch()} />}
          {canMakeTotal === 0 && !shelfIsBare && (
            <EmptyState body="Nothing pours yet — the bottles below are one purchase away." />
          )}
          <ul class={showAllPour ? 'card-list' : 'card-list card-list--capped'}>
            {pourCards.map((c) => (
              <li key={c.id}>
                <DrinkCard
                  name={c.name}
                  favorited={c.is_favorited}
                  href={`/drinks/${c.slug}`}
                  ingredients={cardIngredients(c, shelfIdx)}
                  match="full"
                />
              </li>
            ))}
          </ul>
          {!showAllPour && pourCards.length > POUR_PREVIEW && (
            <p class="show-all-row">
              <Button variant="ghost" size="sm" onClick={() => setShowAllPour(true)}>
                Show all {canMakeTotal ?? pourCards.length}
              </Button>
            </p>
          )}
          {shelfIsBare && (
            <EmptyState
              title="The shelf is bare"
              body={
                suggestions.length > 0
                  ? `Start with ${suggestions
                      .slice(0, 3)
                      .map((s) => s.name)
                      .join(', ')} — they open the most drinks.`
                  : 'Add a spirit, a citrus and a sweetener and the first drinks open up.'
              }
              action={
                <>
                  <Button variant="secondary" size="sm" onClick={() => route('/shelf')}>
                    Stock the shelf
                  </Button>{' '}
                  <Button variant="ghost" size="sm" onClick={() => route('/first-pours')}>
                    Start with the classics
                  </Button>
                </>
              }
            />
          )}
        </section>

        <section class="tonight-near" id="near" tabIndex={-1}>
          <MatchHeader
            label={scope ? `${scope} one bottle away` : 'One bottle away'}
            count={nearMiss.data?.meta?.total}
            tone="gap"
          />
          {nearMiss.isError && <ErrorLine onRetry={() => void nearMiss.refetch()} />}
          <ul class="card-list">
            {nearMiss.data?.data.map((c) => (
              <li key={c.id}>
                <DrinkCard
                  name={c.name}
                  favorited={c.is_favorited}
                  href={`/drinks/${c.slug}`}
                  ingredients={cardIngredients(c, shelfIdx)}
                  match="near"
                />
              </li>
            ))}
          </ul>
        </section>

        <aside class="tonight-rail" id="buy" tabIndex={-1}>
          {buyNext && (
            <BuyNextCard
              id={buyNext.id}
              name={buyNext.name}
              reason={buyNext.reason}
              disabled={shoppingMutation.isPending}
              onList={() => listIt(buyNext.id, buyNext.name)}
            />
          )}
          <MatchHeader
            label="To buy"
            count={shoppingList.isError ? undefined : listItems.length}
            tone="gap"
          />
          {shoppingList.isError && snapshot && (
            <div>
              <p class="recipe-aside">
                Offline — the list as it stood{' '}
                {new Date(snapshot.at).toLocaleString(undefined, {
                  weekday: 'long',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                .
              </p>
              <ul class="snapshot-list">
                {snapshot.names.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          )}
          {shoppingList.isError && !snapshot && (
            <ErrorLine onRetry={() => void shoppingList.refetch()} />
          )}
          <SearchField
            value={listQuery}
            label="Add to the list"
            placeholder="Search ingredients"
            onChange={setListQuery}
            onClear={() => setListQuery('')}
          />
          {listQuery.trim().length >= 1 && (
            <div class="chip-row">
              {listResults.data?.map((hit) => {
                const isListed = listedIds.has(hit.id);
                return (
                  <IngredientChip
                    key={hit.id}
                    label={hit.name}
                    state={isListed ? 'have' : 'default'}
                    disabled={shoppingMutation.isPending}
                    onToggle={() =>
                      shoppingMutation.mutate({
                        ingredientIds: [hit.id],
                        action: isListed ? 'remove' : 'add',
                      })
                    }
                  />
                );
              })}
              {listResults.data?.length === 0 && (
                <p class="recipe-aside">Nothing by that name.</p>
              )}
            </div>
          )}
          {listItems.length === 0 ? (
            <p class="recipe-aside">
              Nothing to buy yet — a near miss puts its bottle here.
            </p>
          ) : (
            <div>
              {listItems.map((item) => (
                <ShoppingRow
                  key={item.ingredient.id}
                  ingredientId={item.ingredient.id}
                  name={item.ingredient.name}
                  isStaple={stapleIds.has(item.ingredient.id)}
                  onCheckOff={() => {
                    if (!checkOff.isPending) {
                      checkOff.mutate({ ingredientId: item.ingredient.id });
                    }
                  }}
                  onDrop={() => {
                    if (!shoppingMutation.isPending) {
                      shoppingMutation.mutate({
                        ingredientIds: [item.ingredient.id],
                        action: 'remove',
                      });
                    }
                  }}
                />
              ))}
              <p class="print-row">
                <Button variant="ghost" size="sm" onClick={() => window.print()}>
                  Print the list
                </Button>
              </p>
            </div>
          )}

          {favoriteNeedsShown.length > 0 && (
            <section class="restock-section">
              <MatchHeader label="For your favorites" align="left" tone="gap" />
              {favoriteNeedsShown.map((f) => (
                <div class="restock-row" key={f.id}>
                  <span class="restock-name">{f.name}</span>
                  <span class="restock-unlocks">
                    in {f.count} favorite{f.count === 1 ? '' : 's'}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={shoppingMutation.isPending}
                    onClick={() => listIt(f.id, f.name)}
                  >
                    List it
                  </Button>
                </div>
              ))}
            </section>
          )}

          {suggestionsShown.length > 0 && (
            <section class="restock-section">
              <MatchHeader label="Restock next" align="left" />
              {suggestionsShown.map((s) => (
                <RestockRow
                  key={s.id}
                  suggestion={s}
                  disabled={shoppingMutation.isPending}
                  onList={() => listIt(s.id, s.name)}
                />
              ))}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
