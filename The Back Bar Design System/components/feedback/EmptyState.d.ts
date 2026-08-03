/** Empty state — italic Caslon, always directive ("Add a citrus and a sweetener"), never apologetic. */
export interface EmptyStateProps {
  /** Display-face line, e.g. "Nothing pours yet". */
  title?: string;
  /** Italic body copy — tell the reader what to do next, don't apologise. */
  body?: string;
  /** Optional action node, typically a Button. */
  action?: React.ReactNode;
}
export function EmptyState(props: EmptyStateProps): JSX.Element;
