import { Button } from '@ds/core/Button';
import { ShoppingListItem } from '@ds/shopping/ShoppingListItem';
import { useBarId, useIngredientReach, useIngredientUnlocks } from '../api/queries';
import { unlessFailed, useUnlockFamilies, type FamilyUnlocks } from '../api/unlocks';
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

/** A space no line breaks at (U+00A0). */
const NBSP = '\u00A0';

/**
 * What the row's one line puts between two facts: a "·" held to the fact
 * before it by a no-break space, then an ordinary space, where a line that
 * wraps breaks. Beside the row's Remove, the desktop rail's line is 171px
 * wide, the 390px phone's 201px, and the line of a bottle that opens three
 * families runs past both: it wraps after a "·", never with one opening the
 * next line.
 */
const SEPARATOR = `${NBSP}· `;

/**
 * "2 tiki drinks" as one phrase no line breaks inside: the count held to its
 * family's name (a number stated flatly, never cut from its noun) and the
 * name's words to each other. The hyphen of "spirit-forward" stays the one
 * break within a phrase: a non-breaking hyphen (U+2011) would make
 * "2 spirit-forward drinks ·" 177px that cannot break, and at a 320px viewport,
 * the width WCAG 1.4.10 reflows to, the line is 131px wide, so the phrase
 * would overflow it into the row's Remove. A string cannot let a phrase
 * break only when it must; the DS line could (chrispezza/barback#91).
 */
function phrase(count: number, noun: string): string {
  return `${count}${NBSP}${noun.split(' ').join(NBSP)}`;
}

/**
 * What a row says of the families its bottle unlocks (frontend-spec §6
 * Journey 3, "unlocks 4 sours, 2 tiki"): "2 sours · 2 tiki drinks · 1
 * highball", in the order unlocksByFamily gives, a number stated flatly before
 * each family's own name, each phrase whole on its line (phrase, SEPARATOR).
 * families.ts names the plural only, so one drink drops its final "s", as the
 * Index's family summary does (Drinks.tsx familyNoun) until FamilyDef carries
 * a singular (chrispezza/barback#85). Undefined when no unlocked drink has a
 * family.
 */
export function familiesDetail(families: readonly FamilyUnlocks[]): string | undefined {
  if (families.length === 0) return undefined;
  return families
    .map(({ family, count }) => phrase(count, count === 1 ? family.plural.replace(/s$/, '') : family.plural))
    .join(SEPARATOR);
}

/**
 * The DS row sets the "·" between its count and its detail aria-hidden, with
 * no space on either side, so assistive tech hears the two run together:
 * "Unlocks 2" and "2 sours" as "Unlocks 22 sours", "Unlocks 1" and "Staple" as
 * "Unlocks 1Staple". A hair space opening the detail parts them; on screen it
 * adds under 2 px beside the separator. A line may break after it, as after
 * every other "·". A no-break space here (U+202F) would hold "Unlocks N ·" to
 * the first family, and where the two do not fit one line the break would
 * fall inside the DS's own "Unlocks N" instead: on the 171px rail,
 * "Unlocks 12 · 12 dessert drinks ·" is 211px.
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
  // A count whose read failed is not known, though the last one is still in
  // hand: it was worked out against the shelf as it stood then (ADR-007
  // Consequences, no stock answer is ever served stale). The row then says
  // what it says before its first answer: the name, and a staple's
  // attribution (unlessFailed).
  const unlocks = unlessFailed(useIngredientUnlocks(barId, ingredientId));
  const families = useUnlockFamilies(barId, ingredientId);
  const reach = useIngredientReach(barId, ingredientId, !isStaple && unlocks === 0);
  // The row states a count once it is read and is not 0.
  const counted = unlocks !== undefined && unlocks !== 0;
  const named = counted && families ? familiesDetail(families) : undefined;
  const detail = isStaple
    ? [named, 'Staple'].filter((part) => part !== undefined).join(SEPARATOR)
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
      {/* The word, not a glyph: affordances are words in the caps utility
          voice, and the only marks are ◆, ✓ and · (the design system's
          "Iconography"). Named for the bottle, the word first (WCAG 2.5.3). */}
      {onDrop && (
        <Button variant="ghost" size="sm" onClick={onDrop} aria-label={`Remove ${name} from the list`}>
          Remove
        </Button>
      )}
    </div>
  );
}
