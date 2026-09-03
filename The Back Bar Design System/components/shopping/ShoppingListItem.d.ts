/**
 * A bottle to buy — rose accent, with the number of drinks the purchase unlocks.
 * Checking it off moves the bottle to the shelf.
 * @startingPoint section="Shopping" subtitle="Shopping list item, checked and unchecked" viewport="700x200"
 */
export interface ShoppingListItemProps {
  name: string;
  /** How many drinks this purchase unlocks (rose, actionable). */
  unlocks?: number;
  /** Secondary fact in the same caps line as unlocks, e.g. "Staple" or "In 12 drinks as Islay Scotch". */
  detail?: string;
  /** Optional trailing editorial note in italic, e.g. "any London dry". */
  note?: string;
  checked?: boolean;
  onToggle?: () => void;
}
export function ShoppingListItem(props: ShoppingListItemProps): JSX.Element;
