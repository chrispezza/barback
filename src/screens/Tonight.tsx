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
  snapshotStamp,
  useBarId,
  useBars,
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

/** The shelf read as the pour section's empty states use it: its total once read. */
type ShelfRead = number | 'pending' | 'failed';

/**
 * Which empty state the pour section shows, if any. Only bare needs the
 * shelf, and is decided by it alone. The others say only what the two counts
 * support, which holds whether or not the shelf is bare, so a failed shelf
 * read does not hold them back. While the shelf is on its way they wait, so a
 * bare shelf never shows another state first.
 */
function pourEmptyState(
  shelf: ShelfRead,
  canMakeTotal: number | undefined,
  nearMissTotal: number | undefined,
  familyActive: boolean,
): 'bare' | 'near' | 'family' | 'bar' | undefined {
  if (shelf === 0) return 'bare';
  if (shelf === 'pending' || canMakeTotal !== 0 || nearMissTotal === undefined) return undefined;
  if (nearMissTotal > 0) return 'near';
  return familyActive ? 'family' : 'bar';
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
  const profileQuery = useProfile();
  const profile = profileQuery.data;
  const shoppingList = useShoppingList(barId, profile?.id);
  const checkOff = useCheckOff(barId, profile?.id);
  const { route } = useLocation();
  const [showAllPour, setShowAllPour] = useState(false);

  // A cold start with the API out of reach (ADR-007; chrispezza/barback#63):
  // /bars and /profile fail first, and every read keyed on them stays
  // disabled, so it never errors on its own. A section whose prerequisite
  // failed says so in the error voice, as one whose own read failed does.
  const bars = useBars();
  const barsFailed = barId === undefined && bars.isError;
  const profileFailed = profile?.id === undefined && profileQuery.isError;
  /** Ask again for what failed: the bootstrap a section waits on, and its own reads. */
  function retry(...own: { isError: boolean; refetch: () => Promise<unknown> }[]) {
    if (barsFailed) void bars.refetch();
    if (profileFailed) void profileQuery.refetch();
    for (const read of own) if (read.isError) void read.refetch();
  }

  const canMakeTotal = canMake.data?.meta?.total;
  const pourCards = canMake.data?.data ?? [];

  const listItems = shoppingList.data?.data ?? [];
  // A list Tonight cannot read, whichever read failed, is shown as the stamped
  // snapshot alone: read-only, and nothing else in the rail writes (ADR-007
  // Decision and Consequences; chrispezza/barback#62). The cached rows a
  // failed refetch leaves behind are not shown beside it.
  const listUnavailable = shoppingList.isError || barsFailed || profileFailed;
  const snapshot = listUnavailable ? readListSnapshot() : null;

  // Dashboard lead: whole-bar counts, deliberately unscoped by family — the
  // line is the bar's status; the scoped story is told by the sections below.
  const barCanMake = useCocktails(barId, { on_shelf: true }, 1);
  const barNearMiss = useCocktails(barId, { missing_ingredients: 1 }, 1);
  const statusReady =
    barCanMake.data?.meta !== undefined &&
    barNearMiss.data?.meta !== undefined &&
    shoppingList.data !== undefined;
  // Once a read the line waits on has failed (the bootstrap included, through
  // listUnavailable), the count is not under way: the line says nothing
  // rather than "Counting the bar…" for good.
  const statusFailed = listUnavailable || barCanMake.isError || barNearMiss.isError;

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

  // What the pour section says when nothing pours (frontend-spec §5 "Empty
  // states are directive", §6 family-aware empty states). A bare shelf is a
  // fact about the shelf, never about the counts under a family: the family
  // only refines Tonight's stock axis (§6), so a stocked shelf with nothing in
  // the family within reach is pointed at the family, not told to stock up.
  // A shelf read that failed says nothing about bareness, even with an older
  // answer in hand; the section says the read failed instead.
  // A count still on screen from the previous family (placeholderData, while
  // the new family's read is under way) says nothing about this one.
  const pourEmpty = pourEmptyState(
    shelf.isError
      ? 'failed'
      : shelf.data
        ? (shelf.data.meta?.total ?? shelf.data.data.length)
        : 'pending',
    canMake.isPlaceholderData ? undefined : canMakeTotal,
    nearMiss.isPlaceholderData ? undefined : nearMiss.data?.meta?.total,
    scope !== undefined,
  );
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
  // Queue only against a list just read (ADR-008 with ADR-007). Not while the
  // list cannot be read: the rail shows the snapshot alone. Nor while a read
  // is under way: the rows in hand may be the stale ones a failing refetch
  // leaves behind, and that failure is known only once its retry fails.
  const listRead = shoppingList.isSuccess && !shoppingList.isFetching && !listUnavailable;
  useEffect(() => {
    if (profile?.id === undefined || staplesOut.length === 0) return;
    if (!listRead) return; // don't queue against a stale view
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
  }, [staplesOut.map((s) => s.id).join(','), profile?.id, listRead]);

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
      {(statusReady || !statusFailed) && (
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
      )}
      <FamilyPicker />

      {/* Grid areas put the list ABOVE the near-miss stack on one column —
          the actionable gap must never hide under 38 drink cards. */}
      <div class="tonight-grid">
        <section class="tonight-pour" id="pour" tabIndex={-1}>
          <MatchHeader label={scope ? `${scope} you can pour` : 'You can pour'} count={canMakeTotal} />
          {/* The shelf is this section's too: it decides a bare shelf, and the
              cards read held child brands off it. One line for whatever failed. */}
          {(canMake.isError || shelf.isError || barsFailed) && (
            <ErrorLine onRetry={() => retry(canMake, shelf)} />
          )}
          {pourEmpty === 'near' && (
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
          {pourEmpty === 'family' && family !== undefined && scope !== undefined && (
            <EmptyState
              title={`No ${scope} pour yet`}
              body="None is one bottle away either — browse them to see what they call for."
              action={
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => route(`/drinks?family=${family.def.tag.replace('family:', '')}`)}
                  >
                    {`Browse ${scope}`}
                  </Button>{' '}
                  <Button variant="ghost" size="sm" onClick={() => route('/tonight')}>
                    Show all families
                  </Button>
                </>
              }
            />
          )}
          {(pourEmpty === 'bare' || pourEmpty === 'bar') && (
            <EmptyState
              title={pourEmpty === 'bare' ? 'The shelf is bare' : 'Nothing pours yet'}
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
          {(nearMiss.isError || barsFailed) && <ErrorLine onRetry={() => retry(nearMiss)} />}
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
          {!listUnavailable && buyNext && (
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
            count={listUnavailable ? undefined : listItems.length}
            tone="gap"
          />
          {listUnavailable ? (
            snapshot ? (
              <div>
                <p class="recipe-aside">
                  Offline — the list as it stood{' '}
                  {snapshotStamp(new Date(snapshot.at), new Date())}.
                </p>
                <ul class="snapshot-list">
                  {snapshot.names.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <ErrorLine onRetry={() => retry(shoppingList)} />
            )
          ) : (
            <>
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
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
