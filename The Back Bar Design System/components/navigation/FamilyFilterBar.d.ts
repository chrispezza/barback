/** Segmented control over the drink families, in the caps utility voice. */
export interface FamilyFilterBarProps {
  /** Family labels, typically the five: Sour, Old Fashioned, Highball, Martini, Flip. */
  families: string[];
  /** Currently selected family (brass fill). */
  value?: string;
  onChange?: (family: string) => void;
  /** Families with no matches — rendered sage and non-interactive. */
  disabled?: string[];
}
export function FamilyFilterBar(props: FamilyFilterBarProps): JSX.Element;
