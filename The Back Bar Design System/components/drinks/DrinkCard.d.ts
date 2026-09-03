/**
 * A drink in a list — display-face name, family tag, italic ingredient run
 * coloured per stock state, and a rose missing-line when something is absent.
 * With `href` the card is a link; without it, a button.
 * @startingPoint section="Drinks" subtitle="Drink card across all four match states" viewport="700x400"
 */
export interface DrinkCardProps {
  name: string;
  /** Family tag, e.g. "Sour" — rendered in the caps utility voice. */
  family?: string;
  /** Ingredient run; `have: false` renders sage and feeds the rose missing-line.
   *  `optional: true` renders cream-400 with an "optional" mark and never counts as missing. */
  ingredients: { name: string; have: boolean; optional?: boolean }[];
  /** full = can pour (brass name + "Can pour"), partial, near (exactly one missing), none. */
  match?: "full" | "partial" | "near" | "none";
  /** Brass ◆ before the name, announced as "Favorited". */
  favorited?: boolean;
  /** Destination — makes the card a real link. */
  href?: string;
  /** Fires on a plain click (modifier clicks fall through to the link). */
  onSelect?: () => void;
}
export function DrinkCard(props: DrinkCardProps): JSX.Element;
