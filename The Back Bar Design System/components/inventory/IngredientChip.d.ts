/**
 * The atomic unit of The Back Bar: one ingredient, in or out of the bar.
 * @startingPoint section="Inventory" subtitle="Ingredient chip in all stock states" viewport="700x180"
 */
export interface IngredientChipProps {
  /** Ingredient name. Rendered in italic Caslon — italic is reserved for ingredients. */
  label: string;
  /** default = outlined, have = brass fill (you have it), absent = sage (calm absence). */
  state?: "default" | "have" | "absent";
  /** Optional trailing count, e.g. number of bottles. */
  count?: number;
  disabled?: boolean;
  onToggle?: () => void;
}
export function IngredientChip(props: IngredientChipProps): JSX.Element;
