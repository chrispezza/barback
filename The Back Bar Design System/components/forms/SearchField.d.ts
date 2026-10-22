/**
 * Search input — cream text on green-800, brass caret, 2px corners. Never a pill.
 * The input itself, and Clear, are 44px targets inside a 44px frame.
 */
export interface SearchFieldProps {
  value?: string;
  /** Italic sage placeholder — always directive, e.g. "Search the shelf". */
  placeholder?: string;
  /** Optional caps-utility label rendered inside the field. */
  label?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  onClear?: () => void;
}
export function SearchField(props: SearchFieldProps): JSX.Element;
