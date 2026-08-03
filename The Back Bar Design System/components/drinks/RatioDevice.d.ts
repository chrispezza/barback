/**
 * The signature element of The Back Bar — the template ratio behind a drink.
 * @startingPoint section="Drinks" subtitle="The ratio device, 2–4 parts" viewport="700x200"
 */
export interface RatioDeviceProps {
  /** 2–4 parts. `value` is a numeral or fraction glyph ("2", "¾"); `label` is a caps utility word. */
  parts: { value: string; label: string }[];
  /** lg = 44px numerals (detail view), md = 32px, sm = 24px (never below 20px). */
  size?: "lg" | "md" | "sm";
}
export function RatioDevice(props: RatioDeviceProps): JSX.Element;
