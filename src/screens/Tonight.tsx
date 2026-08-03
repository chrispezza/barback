import { useLocation } from 'preact-iso';
import { DrinkCard } from '@ds/drinks/DrinkCard';
import { MatchHeader } from '@ds/drinks/MatchHeader';
import { EmptyState } from '@ds/feedback/EmptyState';
import {
  useBarId,
  useCheckOff,
  useCocktails,
  useProfile,
  useShoppingList,
} from '../api/queries';
import type { Cocktail } from '../api/types';
import { FamilyPicker, useActiveFamily } from '../components/FamilyPicker';
import { ShoppingRow } from '../components/ShoppingRow';

function toCardIngredients(cocktail: Cocktail) {
  return cocktail.ingredients.map((entry) => ({
    name: entry.ingredient.name,
    have: entry.in_shelf || entry.optional,
  }));
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
              body="Add a spirit, a citrus and a sweetener and the first drinks open up."
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
                  onCheckOff={() =>
                    checkOff.mutate({ ingredientId: item.ingredient.id })
                  }
                />
              ))}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
