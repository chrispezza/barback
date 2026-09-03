/** A single bottle on the shelf — ingredient, bottle detail, quiet remove action. */
export interface ShelfRowProps {
  /** Ingredient name (italic Caslon). */
  name: string;
  /** Brand, e.g. "Plantation 3 Star" — or, on a recipe, the measure ("2 oz"). */
  brand?: string;
  /** Bottle volume, e.g. "750ml". */
  volume?: string;
  /** Remaining amount as a fraction string, e.g. "¾" — never a progress bar. */
  remaining?: string;
  /** Out of stock: name goes sage + struck through (state is never colour alone). */
  empty?: boolean;
  /** Recipe line that is optional: cream-400 name, "optional" in the detail, never struck. */
  optional?: boolean;
  onRemove?: () => void;
}
export function ShelfRow(props: ShelfRowProps): JSX.Element;
