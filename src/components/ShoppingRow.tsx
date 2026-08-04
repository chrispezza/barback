import { Button } from '@ds/core/Button';
import { ShoppingListItem } from '@ds/shopping/ShoppingListItem';
import { useBarId, useIngredientReach, useIngredientUnlocks } from '../api/queries';

interface ShoppingRowProps {
  ingredientId: number;
  name: string;
  /** Auto-queued par staple — the row says so (attribution over surprise). */
  isStaple?: boolean;
  onCheckOff: () => void;
  /** Remove from the list without shelving — mistakes and changed minds. */
  onDrop?: () => void;
}

/**
 * DS ShoppingListItem fed with the live "unlocks N" count. A zero unlock is
 * honest but discouraging — it means "completes nothing by itself", not
 * "useless" — so those rows say what the bottle builds toward instead.
 */
export function ShoppingRow({
  ingredientId,
  name,
  isStaple,
  onCheckOff,
  onDrop,
}: ShoppingRowProps) {
  const barId = useBarId();
  const { data: unlocks } = useIngredientUnlocks(barId, ingredientId);
  const reach = useIngredientReach(barId, ingredientId, !isStaple && unlocks === 0);
  const note = isStaple
    ? 'staple'
    : unlocks === 0 && reach
      ? `in ${reach.count} drink${reach.count === 1 ? '' : 's'}${
          reach.via ? ` as ${reach.via}` : ''
        }`
      : undefined;
  return (
    <div class="shopping-row-line">
      <div class="shopping-row-main">
        <ShoppingListItem
          name={name}
          unlocks={unlocks === 0 ? undefined : unlocks}
          note={note}
          onToggle={onCheckOff}
        />
      </div>
      {onDrop && (
        <Button variant="ghost" size="sm" onClick={onDrop}>
          ✕<span class="visually-hidden"> Remove {name} from the list</span>
        </Button>
      )}
    </div>
  );
}
