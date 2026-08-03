import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { EmptyState } from '@ds/feedback/EmptyState';
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
} from '../api/queries';
import { isStocked, type Cocktail, type RecommendedIngredient } from '../api/types';
import { FamilyPicker, useActiveFamily } from '../components/FamilyPicker';
import { ShoppingRow } from '../components/ShoppingRow';

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
  const suggestions = (recommendations.data ?? [])
    .filter((r) => !ownedOrListed.has(r.id))
    .slice(0, 5);

  return (
    <main class="screen">
      <h1>Tonight</h1>
      <FamilyPicker />

      <div class="tonight-grid">
        <div>
          <MatchHeader label="You can pour" count={canMakeTotal} />
          {canMakeTotal === 0 && !shelfIsBare && (
            <EmptyState body="Nothing pours yet — the bottles below are one purchase away." />
          )}
          <ul class="card-list">
            {canMake.data?.data.map((c) => (
              <li key={c.id}>
                <DrinkCard
                  name={c.name}
                  ingredients={toCardIngredients(c)}
                  match="full"
                  onSelect={() => route(`/drinks/${c.slug}`)}
                />
              </li>
            ))}
          </ul>

          <MatchHeader label="One bottle away" count={nearMiss.data?.meta?.total} tone="gap" />
          <ul class="card-list">
            {nearMiss.data?.data.map((c) => (
              <li key={c.id}>
                <DrinkCard
                  name={c.name}
                  ingredients={toCardIngredients(c)}
                  match="near"
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
        </div>

        <aside class="tonight-rail">
          <MatchHeader label="The list" count={listItems.length} tone="gap" />
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
