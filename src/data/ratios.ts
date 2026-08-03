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
];

export function ratioForSlug(slug: string): RatioTemplate | undefined {
  return RATIOS.find((r) => r.cocktailSlug === normalizeSlug(slug));
}
