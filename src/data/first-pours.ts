// First pours: the canonical drinks a new bar aspires to — a few per family.
// Client-owned editorial layer (ADR-002); canonical slugs without the bar-id
// suffix, resolved at runtime, misses dropped with a dev warning.
export const FIRST_POUR_SLUGS: string[] = [
  // Sours
  'daiquiri',
  'whiskey-sour',
  'margarita',
  'gimlet',
  'french-75',
  // Spirit-forward
  'old-fashioned',
  'manhattan',
  'negroni',
  'martini',
  'boulevardier',
  // Highballs
  'gin-tonic',
  'mojito',
  'dark-n-stormy',
  'paloma',
  'moscow-mule',
  // Tiki
  'mai-tai',
  'pina-colada',
  // Dessert
  'espresso-martini',
  'white-russian',
];
