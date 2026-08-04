import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { EmptyState } from '@ds/feedback/EmptyState';
import { SearchField } from '@ds/forms/SearchField';
import { IngredientChip } from '@ds/inventory/IngredientChip';
import {
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
import { isStocked, type Cocktail, type RecommendedIngredient } from '../api/types';
import { useIngredientSearch } from '../api/search';
import { FamilyPicker, useActiveFamily } from '../components/FamilyPicker';
import { ErrorLine } from '../components/ErrorLine';
import { ShoppingRow } from '../components/ShoppingRow';
import { STAPLE_SLUGS } from '../data/staples';
import { useDebounced } from '../hooks';

function toCardIngredients(cocktail: Cocktail) {
  return cocktail.ingredients.map((entry) => ({
    name: entry.ingredient.name,
    have: isStocked(entry) || entry.optional,
  }));
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

  const canMake = useCocktails(barId, { on_shelf: true, ...familyFilter });
  const nearMiss = useCocktails(barId, { missing_ingredients: 1, ...familyFilter });
  const { data: profile } = useProfile();
  const shoppingList = useShoppingList(barId, profile?.id);
  const checkOff = useCheckOff(barId, profile?.id);
  const { route } = useLocation();

  const canMakeTotal = canMake.data?.meta?.total;
  const shelfIsBare = canMakeTotal === 0 && nearMiss.data?.meta?.total === 0;

  const listItems = shoppingList.data?.data ?? [];

  // Dashboard lead: whole-bar counts, deliberately unscoped by family — the
  // line is the bar's status; the scoped story is told by the sections below.
  const barCanMake = useCocktails(barId, { on_shelf: true }, 1);
  const barNearMiss = useCocktails(barId, { missing_ingredients: 1 }, 1);
  const statusReady =
    barCanMake.data?.meta !== undefined &&
    barNearMiss.data?.meta !== undefined &&
    shoppingList.data !== undefined;

  // Restock (frontend-spec §5): server-ranked, minus what's already listed or
  // owned — upstream recommend doesn't exclude on-shelf bottles (ADR-001:
  // client-side filter, never an upstream patch).
  const recommendations = useRecommendations(barId);
  const shelf = useShelf(barId);
  const shoppingMutation = useShoppingMutation(barId, profile?.id);
  const ownedOrListed = new Set([
    ...listItems.map((item) => item.ingredient.id),
    ...(shelf.data?.data.map((i) => i.id) ?? []),
  ]);
  // Free-form add: same type-ahead the Shelf uses, writing to the list.
  const [listQuery, setListQuery] = useState('');
  const listResults = useIngredientSearch(useDebounced(listQuery, 200));
  const listedIds = new Set(listItems.map((item) => item.ingredient.id));

  // Par-level staples: out of stock and not yet queued — pinned, never
  // auto-added; the list only changes by the user's hand.
  const staples = useStaples(barId, STAPLE_SLUGS);
  const staplesOut = (staples.data ?? []).filter(
    (s) => !s.in_shelf && !listedIds.has(s.id),
  );
  const stapleIds = new Set((staples.data ?? []).map((s) => s.id));

  // Staples own their group; keep them out of the general suggestions.
  const suggestions = (recommendations.data ?? [])
    .filter((r) => !ownedOrListed.has(r.id) && !stapleIds.has(r.id))
    .slice(0, 5);

  return (
    <main class="screen">
      <h1>Tonight</h1>
      <p class="bar-status">
        {statusReady ? (
          <>
            You can pour <strong>{barCanMake.data?.meta?.total}</strong> ·{' '}
            <strong>{barNearMiss.data?.meta?.total}</strong> one bottle away ·{' '}
            <strong>{listItems.length}</strong> on the list
          </>
        ) : (
          '…'
        )}
      </p>
      <FamilyPicker />

      {/* Grid areas put the list ABOVE the near-miss stack on one column —
          the actionable gap must never hide under 38 drink cards. */}
      <div class="tonight-grid">
        <section class="tonight-pour">
          <MatchHeader label="You can pour" count={canMakeTotal} />
          {canMake.isError && <ErrorLine onRetry={() => void canMake.refetch()} />}
          {canMakeTotal === 0 && !shelfIsBare && (
            <EmptyState body="Nothing pours yet — the bottles below are one purchase away." />
          )}
          <ul class="card-list">
            {canMake.data?.data.map((c) => (
              <li key={c.id}>
                <DrinkCard
                  name={c.is_favorited ? `♦ ${c.name}` : c.name}
                  ingredients={toCardIngredients(c)}
                  match="full"
                  onSelect={() => route(`/drinks/${c.slug}`)}
                />
              </li>
            ))}
          </ul>
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
            />
          )}
        </section>

        <section class="tonight-near">
          <MatchHeader label="One bottle away" count={nearMiss.data?.meta?.total} tone="gap" />
          {nearMiss.isError && <ErrorLine onRetry={() => void nearMiss.refetch()} />}
          <ul class="card-list">
            {nearMiss.data?.data.map((c) => (
              <li key={c.id}>
                <DrinkCard
                  name={c.is_favorited ? `♦ ${c.name}` : c.name}
                  ingredients={toCardIngredients(c)}
                  match="near"
                  onSelect={() => route(`/drinks/${c.slug}`)}
                />
              </li>
            ))}
          </ul>
        </section>

        <aside class="tonight-rail">
          <MatchHeader label="The list" count={listItems.length} tone="gap" />
          <SearchField
            value={listQuery}
            label="Add to the list"
            placeholder="Search ingredients"
            onChange={setListQuery}
            onClear={() => setListQuery('')}
          />
          {listQuery.trim().length >= 2 && (
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
              Nothing on the list — a near miss puts its bottle here.
            </p>
          ) : (
            <div>
              {listItems.map((item) => (
                <ShoppingRow
                  key={item.ingredient.id}
                  ingredientId={item.ingredient.id}
                  name={item.ingredient.name}
                  onCheckOff={() => {
                    if (!checkOff.isPending) {
                      checkOff.mutate({ ingredientId: item.ingredient.id });
                    }
                  }}
                />
              ))}
            </div>
          )}

          {staplesOut.length > 0 && (
            <section class="restock-section">
              <MatchHeader label="Staples out" align="left" tone="gap" />
              {staplesOut.map((s) => (
                <div class="restock-row" key={s.id}>
                  <span class="restock-name">{s.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={shoppingMutation.isPending}
                    onClick={() =>
                      shoppingMutation.mutate({
                        ingredientIds: [s.id],
                        action: 'add',
                      })
                    }
                  >
                    List it
                  </Button>
                </div>
              ))}
            </section>
          )}

          {suggestions.length > 0 && (
            <section class="restock-section">
              <MatchHeader label="Restock next" align="left" />
              {suggestions.map((s) => (
                <RestockRow
                  key={s.id}
                  suggestion={s}
                  disabled={shoppingMutation.isPending}
                  onList={() =>
                    shoppingMutation.mutate({
                      ingredientIds: [s.id],
                      action: 'add',
                    })
                  }
                />
              ))}
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
