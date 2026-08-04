import { ShoppingListItem } from '@ds/shopping/ShoppingListItem';
import { useBarId, useIngredientReach, useIngredientUnlocks } from '../api/queries';

interface ShoppingRowProps {
  ingredientId: number;
  name: string;
  onCheckOff: () => void;
}

/**
 * DS ShoppingListItem fed with the live "unlocks N" count. A zero unlock is
 * honest but discouraging — it means "completes nothing by itself", not
 * "useless" — so those rows say what the bottle builds toward instead.
 */
export function ShoppingRow({ ingredientId, name, onCheckOff }: ShoppingRowProps) {
  const barId = useBarId();
  const { data: unlocks } = useIngredientUnlocks(barId, ingredientId);
  const reach = useIngredientReach(barId, ingredientId, unlocks === 0);
  const note =
    unlocks === 0 && reach
      ? `in ${reach.count} drink${reach.count === 1 ? '' : 's'}${
          reach.via ? ` as ${reach.via}` : ''
        }`
      : undefined;
  return (
    <ShoppingListItem
      name={name}
      unlocks={unlocks === 0 ? undefined : unlocks}
      note={note}
      onToggle={onCheckOff}
    />
  );
}
