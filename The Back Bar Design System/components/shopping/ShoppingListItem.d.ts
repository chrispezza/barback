/**
 * A bottle to buy — rose accent, with the number of drinks the purchase unlocks.
 * Checking it off moves the bottle to the shelf.
 * @startingPoint section="Shopping" subtitle="Shopping list item, checked and unchecked" viewport="700x200"
 */
export interface ShoppingListItemProps {
  name: string;
  /** How many drinks this purchase unlocks. */
  unlocks?: number;
  /** Optional trailing editorial note, e.g. "any London dry". */
  note?: string;
  checked?: boolean;
  onToggle?: () => void;
}
export function ShoppingListItem(props: ShoppingListItemProps): JSX.Element;
