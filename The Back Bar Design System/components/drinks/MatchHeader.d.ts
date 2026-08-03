/** Section header: count + fleuron dividers ("14 DRINKS", "ONE BOTTLE AWAY · 6"). */
export interface MatchHeaderProps {
  /** Header text, rendered uppercase in the caps utility voice. */
  label: string;
  /** Optional count appended after a middle dot. */
  count?: number;
  /** neutral = cream/brass; gap = rose (one bottle away, shopping list). */
  tone?: "neutral" | "gap";
  /** center = rules on both sides; left = rule trails to the right only. */
  align?: "center" | "left";
}
export function MatchHeader(props: MatchHeaderProps): JSX.Element;
