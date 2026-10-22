/**
 * Segmented control over the drink families, in the caps utility voice.
 * One Tab stop (roving tabindex): ArrowLeft/ArrowRight move the focus, wrapping,
 * Home/End jump to the ends, and Enter or Space selects the focused family.
 */
export interface FamilyFilterBarProps {
  /** Family labels, typically the five: Sour, Old Fashioned, Highball, Martini, Flip. */
  families: string[];
  /** Currently selected family (brass fill). It holds the bar's Tab stop. */
  value?: string;
  onChange?: (family: string) => void;
  /** Families with no matches — rendered sage and non-interactive. */
  disabled?: string[];
}
export function FamilyFilterBar(props: FamilyFilterBarProps): JSX.Element;
