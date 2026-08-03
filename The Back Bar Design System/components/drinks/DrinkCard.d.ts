/**
 * A drink in a list — display-face name, family tag, italic ingredient run
 * coloured per stock state, and a rose missing-line when something is absent.
 * @startingPoint section="Drinks" subtitle="Drink card across all four match states" viewport="700x400"
 */
export interface DrinkCardProps {
  name: string;
  /** Family tag, e.g. "Sour" — rendered in the caps utility voice. */
  family?: string;
  /** Ingredient run; `have: false` renders sage and feeds the rose missing-line. */
  ingredients: { name: string; have: boolean }[];
  /** full = can pour (brass name + "Can pour"), partial, near (exactly one missing), none. */
  match?: "full" | "partial" | "near" | "none";
  onSelect?: () => void;
}
export function DrinkCard(props: DrinkCardProps): JSX.Element;
