/** Quantity stepper — bottle counts, parts, servings. Fully keyboard operable. */
export interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Optional caps-utility unit label, e.g. "BTL". */
  unit?: string;
  onChange?: (next: number) => void;
}
export function QuantityStepper(props: QuantityStepperProps): JSX.Element;
