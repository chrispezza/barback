import { Button } from '@ds/core/Button';
import { ShoppingListItem } from '@ds/shopping/ShoppingListItem';
import { useBarId, useIngredientReach, useIngredientUnlocks } from '../api/queries';
import { useUnlockFamilies, type FamilyUnlocks } from '../api/unlocks';
import { reachDetail } from '../data/hierarchy';

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
 * What a row says of the families its bottle unlocks (frontend-spec §6
 * Journey 3, "unlocks 4 sours, 2 tiki"): "2 sours · 2 tiki drinks · 1
 * highball", in the order unlocksByFamily gives, a number stated flatly before
 * each family's own name. families.ts names the plural only, so one drink
 * drops its final "s", as the Index's family summary does (Drinks.tsx
 * familyNoun) until FamilyDef carries a singular (chrispezza/barback#85).
 * Undefined when no unlocked drink has a family.
 */
export function familiesDetail(families: readonly FamilyUnlocks[]): string | undefined {
  if (families.length === 0) return undefined;
  return families
    .map(({ family, count }) => `${count} ${count === 1 ? family.plural.replace(/s$/, '') : family.plural}`)
    .join(' · ');
}

/**
 * The DS row sets the "·" between its count and its detail aria-hidden, with
 * no space on either side, so assistive tech hears the two run together:
 * "Unlocks 2" and "2 sours" as "Unlocks 22 sours", "Unlocks 1" and "Staple" as
 * "Unlocks 1Staple". A hair space opening the detail parts them; on screen it
 * adds under 2 px beside the separator.
 */
const PART = '\u200A';

/**
 * DS ShoppingListItem fed with the live "unlocks N" count. A zero unlock is
 * honest but discouraging — it means "completes nothing by itself", not
 * "useless" — so those rows say what the bottle builds toward instead. A
 * bottle that unlocks drinks names their families after the count, once the
 * tags of those drinks are read; drinks with no family are counted, not
 * named. Every secondary fact goes in the row's one detail line, one voice: a
 * staple's attribution follows the families.
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
  const families = useUnlockFamilies(barId, ingredientId);
  const reach = useIngredientReach(barId, ingredientId, !isStaple && unlocks === 0);
  // The row states a count once it is read and is not 0.
  const counted = unlocks !== undefined && unlocks !== 0;
  const named = counted && families ? familiesDetail(families) : undefined;
  const detail = isStaple
    ? [named, 'Staple'].filter((part) => part !== undefined).join(' · ')
    : unlocks === 0 && reach
      ? reachDetail(reach)
      : named;
  return (
    <div class="shopping-row-line">
      <div class="shopping-row-main">
        <ShoppingListItem
          name={name}
          unlocks={counted ? unlocks : undefined}
          detail={counted && detail ? `${PART}${detail}` : detail}
          onToggle={onCheckOff}
        />
      </div>
      {onDrop && (
        <Button variant="ghost" size="sm" onClick={onDrop} aria-label={`Remove ${name} from the list`}>
          ✕
        </Button>
      )}
    </div>
  );
}
