/** Text-only toast pinned to the bottom edge on a brass rule — no card, no icon. */
export interface ToastProps {
  /** One short sentence, sentence case. */
  message: string;
  /** Caps-utility action, usually "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  /** destructive swaps the rule to oxblood (removals only). */
  tone?: "neutral" | "destructive";
}
export function Toast(props: ToastProps): JSX.Element;
