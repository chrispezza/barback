import type { Cocktail } from '../api/types';

export interface RatioPart {
  value: string; // display form: "2", "¾" — never a float
  label: string; // "SPIRIT", "CITRUS", "SWEET"
}

export interface RatioTemplate {
  cocktailSlug: string; // normalized Bar Assistant slug (join key, ADR-002)
  parts: RatioPart[];
}

// Bar Assistant suffixes slugs with the bar id ("daiquiri-1"); normalize
// before joining. Skeleton-grade heuristic — revisit if a curated slug
// legitimately ends in "-<digits>".
export function normalizeSlug(slug: string): string {
  return slug.replace(/-\d+$/, '');
}

// PLACEHOLDER seed set — grows with curation.
export const RATIOS: RatioTemplate[] = [
  {
    cocktailSlug: 'daiquiri',
    parts: [
      { value: '2', label: 'RUM' },
      { value: '¾', label: 'LIME' },
      { value: '¾', label: 'SYRUP' },
    ],
  },
  {
    cocktailSlug: 'whiskey-sour',
    parts: [
      { value: '2', label: 'WHISKEY' },
      { value: '¾', label: 'LEMON' },
      { value: '¾', label: 'SYRUP' },
    ],
  },
  {
    cocktailSlug: 'margarita',
    parts: [
      { value: '2', label: 'TEQUILA' },
      { value: '1', label: 'LIME' },
      { value: '¾', label: 'ORANGE LIQUEUR' },
    ],
  },
  {
    cocktailSlug: 'old-fashioned',
    parts: [
      { value: '2', label: 'WHISKEY' },
      { value: '¼', label: 'SYRUP' },
      { value: '2 d', label: 'BITTERS' },
    ],
  },
  {
    cocktailSlug: 'manhattan',
    parts: [
      { value: '2', label: 'WHISKEY' },
      { value: '1', label: 'VERMOUTH' },
    ],
  },
  {
    cocktailSlug: 'gimlet',
    parts: [
      { value: '2', label: 'GIN' },
      { value: '¾', label: 'LIME' },
      { value: '¾', label: 'SYRUP' },
    ],
  },
  {
    cocktailSlug: 'martini',
    parts: [
      { value: '2', label: 'GIN' },
      { value: '1', label: 'VERMOUTH' },
    ],
  },
  {
    cocktailSlug: 'negroni',
    parts: [
      { value: '1', label: 'GIN' },
      { value: '1', label: 'CAMPARI' },
      { value: '1', label: 'VERMOUTH' },
    ],
  },
  {
    cocktailSlug: 'sazerac',
    parts: [
      { value: '2', label: 'RYE' },
      { value: '¼', label: 'SYRUP' },
      { value: '3 d', label: 'BITTERS' },
    ],
  },
  // Vintage equal-parts stirred drinks — ratios as printed (Winter 1884).
  {
    cocktailSlug: 'manhattan-cocktail-1884',
    parts: [
      { value: '1', label: 'WHISKEY' },
      { value: '1', label: 'VERMOUTH' },
    ],
  },
  {
    cocktailSlug: 'turf-club-cocktail-1884',
    parts: [
      { value: '1', label: 'GIN' },
      { value: '1', label: 'VERMOUTH' },
    ],
  },
];

export function ratioForSlug(slug: string): RatioTemplate | undefined {
  return RATIOS.find((r) => r.cocktailSlug === normalizeSlug(slug));
}

// Every vulgar fraction Unicode encodes (Latin-1 ¼ ½ ¾, U+2150–215E), keyed
// by its value to two places. Upstream sends ounces as ml / 30 to four places
// (recipe-utils Unit::toOz, AmountValueObject::convertTo), so metric pours
// land on sixths, eighths and fifths: 25 ml is 0.8333, 5 ml 0.1667, 24 ml 0.8.
// A value with no glyph (12.5 ml is 0.4167) has no key and keeps its decimal.
// Matching is on two places, so anything that rounds to a key takes its
// glyph; an eighth's key is itself rounded up (⅛ is 0.13), so its window runs
// 0.01 oz above the true value: 4 ml (0.1333) reads ⅛.
const FRACTIONS: Record<string, string> = {
  '0.1': '⅒',
  '0.11': '⅑',
  '0.13': '⅛',
  '0.14': '⅐',
  '0.17': '⅙',
  '0.2': '⅕',
  '0.25': '¼',
  '0.33': '⅓',
  '0.38': '⅜',
  '0.4': '⅖',
  '0.5': '½',
  '0.6': '⅗',
  '0.63': '⅝',
  '0.67': '⅔',
  '0.75': '¾',
  '0.8': '⅘',
  '0.83': '⅚',
  '0.88': '⅞',
};

/** 0.75 → "¾", 0.8333 → "⅚", 1.5 → "1½", 2 → "2" — fraction glyphs, never
 *  decimals. The one exception is a fraction Unicode has no glyph for
 *  (0.4167 → "0.42"), which still falls back to two decimal places. */
export function fractionGlyph(n: number): string {
  const whole = Math.floor(n);
  const frac = Number((n - whole).toFixed(2));
  if (frac === 0) return String(whole);
  const glyph = FRACTIONS[String(frac)];
  if (!glyph) return String(Number(n.toFixed(2)));
  return whole > 0 ? `${whole}${glyph}` : glyph;
}

const VOLUMETRIC = new Set(['oz', 'ml', 'cl']);

/**
 * The signature element should lead every recipe, not just curated ones: when
 * no template exists, read the skeleton off the recipe itself — the first
 * three measured, non-optional parts in ounces, labelled by ingredient.
 * Dashes, rinses and barspoons are seasoning, not structure, and are skipped.
 */
export function deriveRatio(cocktail: Cocktail): RatioTemplate | undefined {
  const parts = cocktail.ingredients
    .filter((e) => !e.optional && VOLUMETRIC.has(e.units) && e.formatted.oz.amount > 0)
    .slice(0, 3);
  if (parts.length < 2) return undefined;
  return {
    cocktailSlug: normalizeSlug(cocktail.slug),
    parts: parts.map((e) => ({
      value: fractionGlyph(e.formatted.oz.amount),
      label: e.ingredient.name,
    })),
  };
}
