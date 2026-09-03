/**
 * The system's button — letterspaced caps, 2px corners, 44px minimum height
 * in both sizes (the compact size trades horizontal padding, never height).
 * Intentional addition: the brief specifies button typography but no button
 * component; screens need one.
 */
export interface ButtonProps {
  children?: React.ReactNode;
  /** primary = brass fill; secondary = brass outline; ghost = text only; destructive = oxblood outline (removals only). */
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "md" | "sm";
  /** Defaults to "button"; pass "submit" for the one button that submits a form. */
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: () => void;
  "aria-label"?: string;
  title?: string;
}
export function Button(props: ButtonProps): JSX.Element;
