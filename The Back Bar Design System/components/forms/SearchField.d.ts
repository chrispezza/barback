/** Search input — cream text on green-800, brass caret, 2px corners. Never a pill. */
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
