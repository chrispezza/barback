import { fractionGlyph } from '../data/ratios';
import type { CocktailIngredientEntry } from './types';

// A recipe line's measure as Bar Assistant v5.15.3 sends it: `amount`,
// `amount_max` and `units` as authored, and `formatted.<unit>` converted
// (app/Http/Resources/CocktailIngredientResource.php:52-54, 61;
// app/Http/Resources/AmountFormats.php:49-57). AmountValueObject::convertTo
// rounds a converted minimum to four places and leaves the maximum as the
// converter returned it, so 25 ml tops out at 0.8333333333333334 oz
// (app/Models/ValueObjects/AmountValueObject.php:29-35).

/** Lines poured by volume read in ounces; the rest keep their own unit. */
const VOLUMETRIC = new Set(['ml', 'cl', 'oz']);

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * The measure only — the row prints the ingredient name above it.
 *
 * A pour reads in ounces. A dash, a barspoon or a leaf keeps the unit it was
 * authored in, never converted (2 dash, not 0.02 oz). Every bound is typeset
 * as a fraction glyph, never a decimal (Content fundamentals): 0.5 barspoon
 * reads "½ barspoon". A range keeps both bounds, joined by an en dash: 22.5–30
 * ml reads "¾–1 oz", 2–3 dash "2–3 dash". A maximum that is unset or zero is no
 * range, as upstream prints none (AmountValueObject.php:45), and nor is one that
 * reads the same as the minimum.
 *
 * An amount Unicode has no glyph for still prints its decimal through
 * fractionGlyph (chrispezza/barback#86).
 */
export function measure(
  entry: Pick<CocktailIngredientEntry, 'amount' | 'amount_max' | 'units' | 'formatted'>,
): string {
  const [min, max, units] = VOLUMETRIC.has(entry.units)
    ? [entry.formatted.oz.amount, entry.formatted.oz.amount_max, 'oz']
    : [entry.amount, entry.amount_max, entry.units];
  const low = fractionGlyph(round4(min));
  const high = max ? fractionGlyph(round4(max)) : low;
  return high === low ? `${low} ${units}` : `${low}–${high} ${units}`;
}
