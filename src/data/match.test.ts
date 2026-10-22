import { describe, expect, it } from 'vitest'
import { shelfIndex, type Cocktail, type ShelfIndex } from '../api/types'
import { BarModel, cocktailResource, ingredientResource, type Endpoint } from '../../test/fixtures/upstream'
import { C, I, defaultWorld } from '../../test/fixtures/world'
import { cardIngredients, matchState, type MatchState } from './match'

// Card match state (frontend-spec §2 "Per-ingredient stock color", §7
// DrinkCard). Cocktails are built by the fixture builders in the shape Bar
// Assistant v5.15.3 emits (ADR-011): 'index' is GET /cocktails and /similar
// (Tonight, Index, "In the same vein"), 'show' is GET /cocktails/{id} (the
// Recipe, and the Classics roster, which reads each drink by slug).
//
// The index shape carries no in_shelf_as_* flags, so without the shelf a line
// a child brand or a substitute covers reads as missing on list cards
// (chrispezza/barback#20). The cases up to "list cards with the shelf" are
// read without it; where in_shelf and the line flags disagree, the server's
// in_shelf decides. "list cards with the shelf" pins what the screens paint.

const ENDPOINTS: Endpoint[] = ['index', 'show']

function drink(m: BarModel, id: number, endpoint: Endpoint): Cocktail {
  return cocktailResource(m, m.cocktail(id)!, endpoint)
}

interface Case {
  name: string
  cocktail: number
  /** Shelf edits on top of the default world. */
  add?: number[]
  remove?: number[]
  expected: Exclude<MatchState, 'none'>
}

function modelFor(c: Case): BarModel {
  const m = new BarModel(defaultWorld())
  for (const id of c.add ?? []) m.shelf.add(id)
  for (const id of c.remove ?? []) m.shelf.delete(id)
  return m
}

/** The same answer on either shape: no line depends on hierarchy or substitutes. */
const plainCases: Case[] = [
  { name: 'every line held is full', cocktail: C.daiquiri, expected: 'full' },
  {
    name: 'an optional line off the shelf still leaves it full',
    cocktail: C.whiskeySour, // egg white is optional
    expected: 'full',
  },
  { name: 'one required line missing is near', cocktail: C.negroni, expected: 'near' },
  {
    name: 'one required and one optional line missing is still near',
    cocktail: C.whiskeySour,
    remove: [I.lemonJuice],
    expected: 'near',
  },
  { name: 'two required lines missing is partial', cocktail: C.margarita, expected: 'partial' },
  { name: 'three required lines missing is partial', cocktail: C.espressoMartini, expected: 'partial' },
  {
    // The specified line is held exactly and the world has no descendant of
    // dark rum, so is_specified itself is not exercised here.
    name: 'an optional line off the shelf never counts, alongside a specified line',
    cocktail: C.darkNStormy, // dark rum is is_specified; lime is optional
    add: [I.darkRum, I.gingerBeer],
    remove: [I.limeJuice],
    expected: 'full',
  },
]

/** Show only: a line covered by a child brand or a substitute, which only the
 *  show shape flags, in a case where the upstream matcher agrees. */
const showCases: Case[] = [
  {
    name: 'a held child brand of the called ingredient makes it full',
    cocktail: C.penicillin, // calls Islay Scotch; the shelf holds Laphroaig 10
    add: [I.honeySyrup],
    expected: 'full',
  },
  {
    name: 'a held child brand leaves only the real gap, so it is near',
    cocktail: C.penicillin, // honey syrup missing
    expected: 'near',
  },
  {
    name: 'a held substitute makes it full',
    cocktail: C.mojito, // club soda lists Tonic as a substitute
    add: [I.mint],
    remove: [I.clubSoda],
    expected: 'full',
  },
]

describe('cardIngredients', () => {
  describe.each(ENDPOINTS)('on the %s shape', (endpoint) => {
    it('lists every line in recipe order with its name, stock and optional mark', () => {
      const m = new BarModel(defaultWorld())
      expect(cardIngredients(drink(m, C.whiskeySour, endpoint))).toEqual([
        { name: 'Bourbon whiskey', have: true, optional: false },
        { name: 'Lemon juice', have: true, optional: false },
        { name: 'Simple syrup', have: true, optional: false },
        { name: 'Egg white', have: false, optional: true },
      ])
    })

    it('marks a required line off the shelf as not had', () => {
      const m = new BarModel(defaultWorld())
      expect(cardIngredients(drink(m, C.negroni, endpoint))).toEqual([
        { name: 'Gin', have: true, optional: false },
        { name: 'Campari', have: false, optional: false },
        { name: 'Sweet vermouth', have: true, optional: false },
      ])
    })
  })

  it('marks a line a child brand covers as had, on the show shape', () => {
    const m = new BarModel(defaultWorld())
    const run = cardIngredients(drink(m, C.penicillin, 'show'))
    expect(run[0]).toEqual({ name: 'Islay Scotch', have: true, optional: false })
  })

  it('marks a line a substitute covers as had, on the show shape', () => {
    const m = new BarModel(defaultWorld())
    m.shelf.delete(I.clubSoda)
    const run = cardIngredients(drink(m, C.mojito, 'show'))
    expect(run.find((i) => i.name === 'Club soda')).toEqual({
      name: 'Club soda',
      have: true,
      optional: false,
    })
  })
})

describe('card match state', () => {
  describe.each(ENDPOINTS)('on the %s shape', (endpoint) => {
    it.each(plainCases)('$name', (c) => {
      const cocktail = drink(modelFor(c), c.cocktail, endpoint)
      // Guard: the case sits where the server's can-pour answer and the
      // counted lines agree.
      expect(cocktail.in_shelf).toBe(c.expected === 'full')
      expect(matchState(cocktail)).toBe(c.expected)
    })
  })

  describe('on the show shape, through the hierarchy and substitutes', () => {
    it.each(showCases)('$name', (c) => {
      const cocktail = drink(modelFor(c), c.cocktail, 'show')
      expect(cocktail.in_shelf).toBe(c.expected === 'full')
      expect(matchState(cocktail)).toBe(c.expected)
    })
  })
})

// One state per drink, whichever screen paints it (frontend-spec §7: DrinkCard
// takes one matchState vocabulary; chrispezza/barback#39). The Index, Classics
// and the Recipe's "In the same vein" can each be handed the same cocktail
// resource, and each paints it with matchState, which owes it one state:
// - full exactly when the server's matcher says it pours (`in_shelf`,
//   CocktailResource.php:133 at v5.15.3), the answer Tonight's count and the
//   family header already use (§2, §6);
// - otherwise from the required lines isStocked leaves uncovered: one is near,
//   two or three partial, four or more none, and none uncovered (only possible
//   where in_shelf and the line flags disagree, chrispezza/barback#20) partial.

interface SameDrinkCase {
  name: string
  cocktail: number
  /** The whole shelf, replacing the default world's. */
  shelf?: number[]
  /** Shelf additions on top of the default world. */
  add?: number[]
  /** What the fixture server answers for in_shelf, as a guard on the case. */
  inShelf: boolean
  expected: MatchState
}

function sameDrinkModel(c: SameDrinkCase): BarModel {
  const world = defaultWorld()
  if (c.shelf) world.shelf = [...c.shelf]
  const m = new BarModel(world)
  for (const id of c.add ?? []) m.shelf.add(id)
  return m
}

/** Same answer on either shape: no line depends on hierarchy or substitutes. */
const sameDrinkPlain: SameDrinkCase[] = [
  {
    name: 'four required lines missing is none',
    cocktail: C.mojito, // only the club soda held
    shelf: [I.clubSoda],
    inShelf: false,
    expected: 'none',
  },
  {
    name: 'five required lines missing is none',
    cocktail: C.mojito,
    shelf: [],
    inShelf: false,
    expected: 'none',
  },
  {
    name: 'three required lines missing is partial; the optional fourth never tips it to none',
    cocktail: C.whiskeySour, // egg white is optional
    shelf: [],
    inShelf: false,
    expected: 'partial',
  },
]

/** Where the server's in_shelf and the per-line flags disagree on one shape. */
const sameDrinkDisagreeing: (SameDrinkCase & { endpoint: Endpoint })[] = [
  {
    // The index shape carries no in_shelf_as_variant, so the Islay Scotch line
    // reads uncovered although the server credits Laphroaig 10 to it.
    name: 'the server says it pours, so it is full, on the index shape',
    cocktail: C.penicillin,
    add: [I.honeySyrup],
    endpoint: 'index',
    inShelf: true,
    expected: 'full',
  },
  {
    // The show shape flags a variant at any depth; the server's matcher does
    // not credit a grandchild to a mid-level ingredient (Scotch whisky).
    name: 'the server says it does not pour, so it is not full, on the show shape',
    cocktail: C.robRoy,
    endpoint: 'show',
    inShelf: false,
    expected: 'partial',
  },
  {
    name: 'nor is a two-line drink that every line reads as held, on the show shape',
    cocktail: C.bobbyBurns, // Scotch whisky and sweet vermouth
    endpoint: 'show',
    inShelf: false,
    expected: 'partial',
  },
]

describe('one match state per drink, on every screen', () => {
  describe.each(ENDPOINTS)('on the %s shape', (endpoint) => {
    it.each(sameDrinkPlain)('$name', (c) => {
      const cocktail = drink(sameDrinkModel(c), c.cocktail, endpoint)
      expect(cocktail.in_shelf).toBe(c.inShelf)
      expect(matchState(cocktail)).toBe(c.expected)
    })
  })

  it.each(sameDrinkDisagreeing)('$name', (c) => {
    const cocktail = drink(sameDrinkModel(c), c.cocktail, c.endpoint)
    expect(cocktail.in_shelf).toBe(c.inShelf)
    expect(matchState(cocktail)).toBe(c.expected)
  })
})

// List cards with the shelf (chrispezza/barback#20). Every list card is painted
// from the index shape (GET /cocktails, /similar), which carries the exact
// in_shelf only, so the screens hand cardIngredients and matchState the shelf
// as useShelf reads it. A line a held brand covers by the upstream matcher's
// rule (its direct parent or its root, CocktailService.php 281-288) then reads
// as held, as it does on the Recipe screen.

/** The shelf as useShelf receives it: GET /ingredients?filter[on_shelf]=true. */
function shelfOf(m: BarModel): ShelfIndex {
  return shelfIndex([...m.shelf].map((id) => ingredientResource(m, id, 'index')))
}

describe('list cards with the shelf, on the index shape', () => {
  it('paint a parent-called line a held brand covers as had', () => {
    // Penicillin calls Islay Scotch; the default shelf holds Laphroaig 10.
    const m = new BarModel(defaultWorld())
    expect(cardIngredients(drink(m, C.penicillin, 'index'), shelfOf(m))).toEqual([
      { name: 'Islay Scotch', have: true, optional: false },
      { name: 'Lemon juice', have: true, optional: false },
      { name: 'Honey syrup', have: false, optional: false },
    ])
  })

  it('name no missing bottle on a drink the server pours', () => {
    const m = new BarModel(defaultWorld())
    m.shelf.add(I.honeySyrup)
    const penicillin = drink(m, C.penicillin, 'index')
    expect(penicillin.in_shelf).toBe(true)
    expect(matchState(penicillin, shelfOf(m))).toBe('full')
    expect(cardIngredients(penicillin, shelfOf(m)).filter((i) => !i.have && !i.optional)).toEqual([])
  })

  it('count only the real gap, so a drink one bottle away reads near', () => {
    // Honey syrup is the one bottle the Penicillin lacks.
    const m = new BarModel(defaultWorld())
    const penicillin = drink(m, C.penicillin, 'index')
    expect(penicillin.in_shelf).toBe(false)
    expect(matchState(penicillin, shelfOf(m))).toBe('near')
  })

  it('count a child brand of every parent a drink calls', () => {
    // London dry gin in place of Gin: Gimlet, Negroni, Gin Tonic and Martini
    // call Gin, its direct parent.
    const world = defaultWorld()
    world.shelf = [...world.shelf.filter((id) => id !== I.gin), I.londonDryGin]
    const m = new BarModel(world)
    const shelf = shelfOf(m)
    expect(matchState(drink(m, C.gimlet, 'index'), shelf)).toBe('full')
    expect(matchState(drink(m, C.ginTonic, 'index'), shelf)).toBe('full')
    expect(cardIngredients(drink(m, C.negroni, 'index'), shelf)).toEqual([
      { name: 'Gin', have: true, optional: false },
      { name: 'Campari', have: false, optional: false },
      { name: 'Sweet vermouth', have: true, optional: false },
    ])
    expect(matchState(drink(m, C.negroni, 'index'), shelf)).toBe('near')
  })

  // The list card and the Recipe screen paint a drink the same way wherever the
  // matcher and the show shape's any-depth variant flag agree. They disagree on
  // a line calling an intermediate ancestor of a held brand (Rob Roy and Bobby
  // Burns call Scotch whisky, two levels above Laphroaig 10): which one wins is
  // the open decision in chrispezza/barback#20, so those two are left out.
  const undecided = new Set<number>([C.robRoy, C.bobbyBurns])
  const shelves: [string, number[]][] = [
    ['the default shelf', defaultWorld().shelf],
    ['the default shelf and honey syrup', [...defaultWorld().shelf, I.honeySyrup]],
    ['London dry gin in place of Gin', [...defaultWorld().shelf.filter((id) => id !== I.gin), I.londonDryGin]],
  ]

  it.each(shelves)('paint every drink as the Recipe screen does, on %s', (_name, held) => {
    const world = defaultWorld()
    world.shelf = [...held]
    const m = new BarModel(world)
    const shelf = shelfOf(m)
    for (const seed of m.world.cocktails.filter((c) => !undecided.has(c.id))) {
      const index = drink(m, seed.id, 'index')
      const show = drink(m, seed.id, 'show')
      expect(cardIngredients(index, shelf), seed.name).toEqual(cardIngredients(show, shelf))
      expect(matchState(index, shelf), seed.name).toBe(matchState(show, shelf))
    }
  })
})
