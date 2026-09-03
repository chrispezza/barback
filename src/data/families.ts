import type { RatioPart } from './ratios';

export interface FamilyDef {
  tag: string; // must match the API tag exactly (reserved "family:" prefix)
  displayName: string; // rendered in caps utility voice
  plural: string; // lowercase, for scoped copy: "sours you can pour"
  order: number;
  canonicalRatio: RatioPart[];
  blurb: string;
}

// PLACEHOLDER taxonomy — final names/count are Chris's curation call
// (frontend-spec §8). Edit here + rerun the tag script; nothing else changes.
export const FAMILIES: FamilyDef[] = [
  {
    tag: 'family:sour',
    plural: 'sours',
    displayName: 'SOUR',
    order: 1,
    canonicalRatio: [
      { value: '2', label: 'SPIRIT' },
      { value: '¾', label: 'CITRUS' },
      { value: '¾', label: 'SWEET' },
    ],
    blurb: 'Spirit brightened by citrus, balanced by sweet.',
  },
  {
    tag: 'family:spirit-forward',
    plural: 'spirit-forward drinks',
    displayName: 'SPIRIT-FORWARD',
    order: 2,
    canonicalRatio: [
      { value: '2', label: 'SPIRIT' },
      { value: '1', label: 'VERMOUTH' },
    ],
    blurb: 'Stirred, undiluted by juice; the spirit carries the drink.',
  },
  {
    tag: 'family:highball',
    plural: 'highballs',
    displayName: 'HIGHBALL',
    order: 3,
    canonicalRatio: [
      { value: '1', label: 'SPIRIT' },
      { value: '2', label: 'LENGTHENER' },
    ],
    blurb: 'Spirit stretched long over ice and effervescence.',
  },
  {
    tag: 'family:tiki',
    plural: 'tiki drinks',
    displayName: 'TIKI',
    order: 4,
    canonicalRatio: [
      { value: '2', label: 'RUM' },
      { value: '1', label: 'CITRUS' },
      { value: '1', label: 'SWEET' },
    ],
    blurb: 'Layered rums and syrups; the sour taken somewhere baroque.',
  },
  {
    tag: 'family:dessert',
    plural: 'dessert drinks',
    displayName: 'DESSERT',
    order: 5,
    canonicalRatio: [
      { value: '2', label: 'SPIRIT' },
      { value: '1', label: 'CREAM' },
      { value: '1', label: 'SWEET' },
    ],
    blurb: 'Rich, after-dinner weight; cream and sugar do the talking.',
  },
];

export function familyByTag(tag: string | null): FamilyDef | undefined {
  return FAMILIES.find((f) => f.tag === tag);
}
