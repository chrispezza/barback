/**
 * The system's button — letterspaced caps, 2px corners, 44px minimum height.
 * Intentional addition: the brief specifies button typography but no button
 * component; screens need one.
 */
export interface ButtonProps {
  children?: React.ReactNode;
  /** primary = brass fill; secondary = brass outline; ghost = text only; destructive = oxblood outline (removals only). */
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "md" | "sm";
  disabled?: boolean;
  onClick?: () => void;
}
export function Button(props: ButtonProps): JSX.Element;
