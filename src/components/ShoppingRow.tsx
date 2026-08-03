import { ShoppingListItem } from '@ds/shopping/ShoppingListItem';
import { useBarId, useIngredientUnlocks } from '../api/queries';

interface ShoppingRowProps {
  ingredientId: number;
  name: string;
  onCheckOff: () => void;
}

/** DS ShoppingListItem fed with the live "unlocks N" count. */
export function ShoppingRow({ ingredientId, name, onCheckOff }: ShoppingRowProps) {
  const barId = useBarId();
  const { data: unlocks } = useIngredientUnlocks(barId, ingredientId);
  return (
    <ShoppingListItem name={name} unlocks={unlocks} onToggle={onCheckOff} />
  );
}
