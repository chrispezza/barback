/** The double-rule frame (3px + 1px offset) — modals and page frames only, never cards. */
export interface ModalFrameProps {
  /** Caps-utility eyebrow above the title. */
  eyebrow?: string;
  /** Display-face title. */
  title?: string;
  children?: React.ReactNode;
  /** Footer actions, right aligned above a hairline. */
  footer?: React.ReactNode;
  /** Render over a full-screen scrim. */
  overlay?: boolean;
  onDismiss?: () => void;
}
export function ModalFrame(props: ModalFrameProps): JSX.Element;
