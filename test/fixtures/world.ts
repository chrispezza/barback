// The fixture world (ADR-011): one small bar, described as seeds. Both the
// Vitest tests and the Playwright fake (e2e/support/fake-bar.ts) build their
// upstream-shaped resources from this, through test/fixtures/upstream.ts.
//
// Names are chosen so the client's curated slugs resolve: the staples file
// (src/data/staples.ts) and the classics roster (src/data/first-pours.ts) name
// canonical slugs, which upstream completes with the bar id ("club-soda-1").
// Some roster slugs are deliberately absent, so the "missing slug is dropped"
// path is exercised too.

export const BAR_ID = 1
export const USER_ID = 1

export interface IngredientSeed {
  id: number
  name: string
  /** Direct parent in the upstream hierarchy; omitted for a root. */
  parentId?: number
  strength?: number
}

export interface CocktailLineSeed {
  ingredientId: number
  amount: number
  units: string
  optional?: boolean
  /** Upstream `is_specified`: true means only this exact ingredient will do;
   *  false (the default) lets a descendant on the shelf satisfy the line. */
  isSpecified?: boolean
  substituteIds?: number[]
}

export interface CocktailSeed {
  id: number
  name: string
  lines: CocktailLineSeed[]
  instructions: string
  garnish?: string
  /** Tag ids (family tags and any others). */
  tagIds?: number[]
}

export interface TagSeed {
  id: number
  name: string
}

export interface WorldSeed {
  barId: number
  user: { id: number; name: string; email: string; password: string }
  ingredients: IngredientSeed[]
  cocktails: CocktailSeed[]
  tags: TagSeed[]
  /** Ingredient ids on the user's shelf. */
  shelf: number[]
  /** Ingredient ids on the user's shopping list, in list order. */
  list: number[]
  /** Favorited cocktail ids. */
  favorites: number[]
}

// Ingredient ids, named so specs read as prose.
export const I = {
  spirits: 1,
  rum: 2,
  whiteRum: 3,
  darkRum: 4,
  whisky: 5,
  scotch: 6,
  islayScotch: 7,
  laphroaig10: 8,
  bourbon: 9,
  rye: 10,
  gin: 11,
  londonDryGin: 12,
  tequila: 13,
  cognac: 14,
  vodka: 15,
  liqueurs: 20,
  cointreau: 21,
  campari: 22,
  coffeeLiqueur: 23,
  wines: 30,
  sweetVermouth: 31,
  dryVermouth: 32,
  juices: 40,
  limeJuice: 41,
  lemonJuice: 42,
  syrups: 50,
  simpleSyrup: 51,
  honeySyrup: 52,
  bitters: 60,
  angostura: 61,
  beverages: 70,
  clubSoda: 71,
  tonic: 72,
  gingerBeer: 73,
  other: 80,
  eggWhite: 81,
  mint: 82,
  espresso: 83,
} as const

export const C = {
  daiquiri: 1,
  whiskeySour: 2,
  margarita: 3,
  gimlet: 4,
  oldFashioned: 5,
  manhattan: 6,
  negroni: 7,
  penicillin: 8,
  robRoy: 9,
  ginTonic: 10,
  darkNStormy: 11,
  mojito: 12,
  espressoMartini: 13,
  martini: 14,
  bobbyBurns: 15,
} as const

export const T = {
  sour: 101,
  spiritForward: 102,
  highball: 103,
  tiki: 104,
  dessert: 105,
  classic: 110,
} as const

const ingredients: IngredientSeed[] = [
  { id: I.spirits, name: 'Spirits' },
  { id: I.rum, name: 'Rum', parentId: I.spirits, strength: 40 },
  { id: I.whiteRum, name: 'White rum', parentId: I.rum, strength: 40 },
  { id: I.darkRum, name: 'Dark rum', parentId: I.rum, strength: 40 },
  { id: I.whisky, name: 'Whisky', parentId: I.spirits, strength: 40 },
  { id: I.scotch, name: 'Scotch whisky', parentId: I.whisky, strength: 40 },
  { id: I.islayScotch, name: 'Islay Scotch', parentId: I.scotch, strength: 43 },
  { id: I.laphroaig10, name: 'Laphroaig 10', parentId: I.islayScotch, strength: 40 },
  { id: I.bourbon, name: 'Bourbon whiskey', parentId: I.whisky, strength: 45 },
  { id: I.rye, name: 'Rye whiskey', parentId: I.whisky, strength: 45 },
  { id: I.gin, name: 'Gin', parentId: I.spirits, strength: 40 },
  { id: I.londonDryGin, name: 'London dry gin', parentId: I.gin, strength: 43 },
  { id: I.tequila, name: 'Tequila', parentId: I.spirits, strength: 40 },
  { id: I.cognac, name: 'Cognac', parentId: I.spirits, strength: 40 },
  { id: I.vodka, name: 'Vodka', parentId: I.spirits, strength: 40 },
  { id: I.liqueurs, name: 'Liqueurs' },
  { id: I.cointreau, name: 'Cointreau', parentId: I.liqueurs, strength: 40 },
  { id: I.campari, name: 'Campari', parentId: I.liqueurs, strength: 25 },
  { id: I.coffeeLiqueur, name: 'Coffee liqueur', parentId: I.liqueurs, strength: 20 },
  { id: I.wines, name: 'Fortified wine' },
  { id: I.sweetVermouth, name: 'Sweet vermouth', parentId: I.wines, strength: 16 },
  { id: I.dryVermouth, name: 'Dry vermouth', parentId: I.wines, strength: 18 },
  { id: I.juices, name: 'Juices' },
  { id: I.limeJuice, name: 'Lime juice', parentId: I.juices },
  { id: I.lemonJuice, name: 'Lemon juice', parentId: I.juices },
  { id: I.syrups, name: 'Sweeteners' },
  { id: I.simpleSyrup, name: 'Simple syrup', parentId: I.syrups },
  { id: I.honeySyrup, name: 'Honey syrup', parentId: I.syrups },
  { id: I.bitters, name: 'Bitters' },
  { id: I.angostura, name: 'Angostura aromatic bitters', parentId: I.bitters, strength: 44.7 },
  { id: I.beverages, name: 'Beverages' },
  { id: I.clubSoda, name: 'Club soda', parentId: I.beverages },
  { id: I.tonic, name: 'Tonic', parentId: I.beverages },
  { id: I.gingerBeer, name: 'Ginger beer', parentId: I.beverages },
  { id: I.other, name: 'Other' },
  { id: I.eggWhite, name: 'Egg white', parentId: I.other },
  { id: I.mint, name: 'Mint', parentId: I.other },
  { id: I.espresso, name: 'Espresso', parentId: I.other },
]

const cocktails: CocktailSeed[] = [
  {
    id: C.daiquiri,
    name: 'Daiquiri',
    tagIds: [T.sour, T.classic],
    lines: [
      { ingredientId: I.whiteRum, amount: 60, units: 'ml' },
      { ingredientId: I.limeJuice, amount: 22.5, units: 'ml' },
      { ingredientId: I.simpleSyrup, amount: 22.5, units: 'ml' },
    ],
    instructions: 'Shake with ice and fine-strain into a chilled coupe.',
    garnish: 'Lime wheel',
  },
  {
    id: C.whiskeySour,
    name: 'Whiskey Sour',
    tagIds: [T.sour],
    lines: [
      { ingredientId: I.bourbon, amount: 60, units: 'ml' },
      { ingredientId: I.lemonJuice, amount: 22.5, units: 'ml' },
      { ingredientId: I.simpleSyrup, amount: 22.5, units: 'ml' },
      { ingredientId: I.eggWhite, amount: 15, units: 'ml', optional: true },
    ],
    instructions: 'Dry shake, then shake with ice. Strain over a large cube.',
  },
  {
    id: C.margarita,
    name: 'Margarita',
    tagIds: [T.sour],
    lines: [
      { ingredientId: I.tequila, amount: 50, units: 'ml' },
      { ingredientId: I.limeJuice, amount: 25, units: 'ml' },
      { ingredientId: I.cointreau, amount: 20, units: 'ml' },
    ],
    instructions: 'Shake with ice and strain into a salt-rimmed glass.',
  },
  {
    id: C.gimlet,
    name: 'Gimlet',
    tagIds: [T.sour],
    lines: [
      { ingredientId: I.gin, amount: 60, units: 'ml' },
      { ingredientId: I.limeJuice, amount: 22.5, units: 'ml' },
      { ingredientId: I.simpleSyrup, amount: 22.5, units: 'ml' },
    ],
    instructions: 'Shake with ice and strain into a chilled coupe.',
  },
  {
    id: C.oldFashioned,
    name: 'Old Fashioned',
    tagIds: [T.spiritForward, T.classic],
    lines: [
      { ingredientId: I.bourbon, amount: 60, units: 'ml' },
      { ingredientId: I.simpleSyrup, amount: 7.5, units: 'ml' },
      { ingredientId: I.angostura, amount: 2, units: 'dash' },
    ],
    instructions: 'Stir with ice and strain over a large cube.',
    garnish: 'Orange peel',
  },
  {
    id: C.manhattan,
    name: 'Manhattan',
    tagIds: [T.spiritForward],
    lines: [
      { ingredientId: I.rye, amount: 60, units: 'ml' },
      { ingredientId: I.sweetVermouth, amount: 30, units: 'ml' },
      { ingredientId: I.angostura, amount: 2, units: 'dash' },
    ],
    instructions: 'Stir with ice and strain into a chilled coupe.',
  },
  {
    id: C.negroni,
    name: 'Negroni',
    tagIds: [T.spiritForward],
    lines: [
      { ingredientId: I.gin, amount: 30, units: 'ml' },
      { ingredientId: I.campari, amount: 30, units: 'ml' },
      { ingredientId: I.sweetVermouth, amount: 30, units: 'ml' },
    ],
    instructions: 'Stir with ice and strain over a large cube.',
  },
  {
    // Calls the parent (Islay Scotch) of a brand the shelf holds (Laphroaig 10).
    id: C.penicillin,
    name: 'Penicillin',
    tagIds: [T.sour],
    lines: [
      { ingredientId: I.islayScotch, amount: 60, units: 'ml' },
      { ingredientId: I.lemonJuice, amount: 22.5, units: 'ml' },
      { ingredientId: I.honeySyrup, amount: 22.5, units: 'ml' },
    ],
    instructions: 'Shake with ice and strain over fresh ice.',
  },
  {
    // Calls the grandparent (Scotch whisky) of the brand on the shelf.
    id: C.robRoy,
    name: 'Rob Roy',
    tagIds: [T.spiritForward],
    lines: [
      { ingredientId: I.scotch, amount: 60, units: 'ml' },
      { ingredientId: I.sweetVermouth, amount: 30, units: 'ml' },
      { ingredientId: I.angostura, amount: 2, units: 'dash' },
    ],
    instructions: 'Stir with ice and strain into a chilled coupe.',
  },
  {
    id: C.ginTonic,
    name: 'Gin Tonic',
    tagIds: [T.highball],
    lines: [
      { ingredientId: I.gin, amount: 50, units: 'ml' },
      { ingredientId: I.tonic, amount: 100, units: 'ml' },
    ],
    instructions: 'Build over ice and stir once.',
  },
  {
    id: C.darkNStormy,
    name: "Dark 'n' Stormy",
    tagIds: [T.highball],
    lines: [
      { ingredientId: I.darkRum, amount: 60, units: 'ml', isSpecified: true },
      { ingredientId: I.gingerBeer, amount: 100, units: 'ml' },
      { ingredientId: I.limeJuice, amount: 10, units: 'ml', optional: true },
    ],
    instructions: 'Build over ice; float the rum.',
  },
  {
    id: C.mojito,
    name: 'Mojito',
    tagIds: [T.highball],
    lines: [
      { ingredientId: I.whiteRum, amount: 45, units: 'ml' },
      { ingredientId: I.limeJuice, amount: 20, units: 'ml' },
      { ingredientId: I.simpleSyrup, amount: 15, units: 'ml' },
      { ingredientId: I.mint, amount: 6, units: 'leaves' },
      { ingredientId: I.clubSoda, amount: 60, units: 'ml', substituteIds: [I.tonic] },
    ],
    instructions: 'Muddle the mint gently, build over crushed ice, top with soda.',
  },
  {
    id: C.espressoMartini,
    name: 'Espresso Martini',
    tagIds: [T.dessert],
    lines: [
      { ingredientId: I.vodka, amount: 50, units: 'ml' },
      { ingredientId: I.coffeeLiqueur, amount: 20, units: 'ml' },
      { ingredientId: I.espresso, amount: 30, units: 'ml' },
    ],
    instructions: 'Shake hard with ice and fine-strain.',
  },
  {
    id: C.martini,
    name: 'Martini',
    tagIds: [T.spiritForward],
    lines: [
      { ingredientId: I.gin, amount: 60, units: 'ml' },
      { ingredientId: I.dryVermouth, amount: 10, units: 'ml' },
    ],
    instructions: 'Stir with ice and strain into a chilled coupe.',
  },
  {
    // No family tag: appears only under "All".
    id: C.bobbyBurns,
    name: 'Bobby Burns',
    tagIds: [],
    lines: [
      { ingredientId: I.scotch, amount: 45, units: 'ml' },
      { ingredientId: I.sweetVermouth, amount: 25, units: 'ml' },
    ],
    instructions: 'Stir with ice and strain.',
  },
]

const tags: TagSeed[] = [
  { id: T.sour, name: 'family:sour' },
  { id: T.spiritForward, name: 'family:spirit-forward' },
  { id: T.highball, name: 'family:highball' },
  { id: T.tiki, name: 'family:tiki' },
  { id: T.dessert, name: 'family:dessert' },
  { id: T.classic, name: 'Classic' },
]

/**
 * A working home bar: the staples are all on the shelf (so nothing auto-queues
 * unless a spec takes one away), a few drinks pour, a few are one bottle away.
 */
export function defaultWorld(): WorldSeed {
  return {
    barId: BAR_ID,
    user: { id: USER_ID, name: 'Bar Owner', email: 'admin@example.com', password: 'password' },
    ingredients: ingredients.map((i) => ({ ...i })),
    cocktails: cocktails.map((c) => ({
      ...c,
      lines: c.lines.map((l) => ({ ...l, substituteIds: l.substituteIds ? [...l.substituteIds] : undefined })),
      tagIds: c.tagIds ? [...c.tagIds] : undefined,
    })),
    tags: tags.map((t) => ({ ...t })),
    shelf: [
      I.whiteRum,
      I.bourbon,
      I.gin,
      I.laphroaig10,
      I.sweetVermouth,
      I.limeJuice,
      I.lemonJuice,
      I.simpleSyrup,
      I.angostura,
      I.clubSoda,
      I.tonic,
    ],
    list: [],
    favorites: [],
  }
}

/** An empty bar: nothing on the shelf, nothing listed, nothing favorited. */
export function bareWorld(): WorldSeed {
  return { ...defaultWorld(), shelf: [], list: [], favorites: [] }
}
