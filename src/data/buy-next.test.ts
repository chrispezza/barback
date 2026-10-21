import { describe, expect, it } from 'vitest'
import { shelfIndex } from '../api/types'
import { BarModel, cocktailResource, ingredientResource } from '../../test/fixtures/upstream'
import { C, I, bareWorld, defaultWorld, type WorldSeed } from '../../test/fixtures/world'
import { STAPLE_SLUGS } from './staples'
import {
  GROUP_LIMIT,
  buyNextGroups,
  favoriteGaps,
  rankFavoriteNeeds,
  restockSuggestions,
  staplesToQueue,
} from './buy-next'

// Buy-next ranking and the standing-order auto-queue (ADR-008; frontend-spec
// §9 "Purchasing intelligence"). Every input is built the way Tonight receives
// it from Bar Assistant v5.15.3 (ADR-011 fixtures):
//
// - the shelf: GET /ingredients?filter[on_shelf]=true, index shape, read into
//   a ShelfIndex so a held child brand counts as the matcher counts it;
// - the list: GET /users/{id}/shopping-list;
// - favourites: GET /cocktails?filter[favorites]=true, index shape (no
//   variant or substitute flags), in the order the world names them, so a
//   ranking test is not passed by the order bottles are met alone;
// - staples: GET /ingredients/{slug}-{bar} for each slug in src/data/staples.ts,
//   show shape;
// - recommendations: GET /bars/{id}/ingredients/recommend, which ranks against
//   the bar shelf Barback never writes, so owned bottles come back too
//   (chrispezza/barback#22).

/** What Tonight holds for a world, read from upstream-shaped resources. */
function inputs(w: WorldSeed) {
  const m = new BarModel(w)
  const shelfRows = [...m.shelf].map((id) => ingredientResource(m, id, 'index'))
  const listedIds = new Set(m.list.keys())
  const staples = STAPLE_SLUGS.flatMap((slug) => {
    const seed = m.findIngredient(`${slug}-${m.world.barId}`)
    return seed ? [ingredientResource(m, seed.id, 'show')] : []
  })
  return {
    shelf: shelfIndex(shelfRows),
    listedIds,
    ownedOrListed: new Set([...listedIds, ...shelfRows.map((r) => r.id)]),
    favorites: m.world.favorites.map((id) => cocktailResource(m, m.cocktail(id)!, 'index')),
    staples,
    stapleIds: new Set(staples.map((s) => s.id)),
    recommendations: m.recommendFor(new Set()),
  }
}

/** Tonight's decisions for a world, wired as the screen wires them. */
function decide(w: WorldSeed) {
  const t = inputs(w)
  const gaps = favoriteGaps(t.favorites, t.ownedOrListed, t.shelf)
  const favoriteNeeds = rankFavoriteNeeds(gaps)
  const suggestions = restockSuggestions(t.recommendations, t.ownedOrListed, t.stapleIds, favoriteNeeds)
  const groups = buyNextGroups(favoriteNeeds, suggestions)
  return {
    ownedOrListed: t.ownedOrListed,
    gaps,
    favoriteNeeds,
    suggestions,
    pick: groups.pick,
    forFavorites: groups.favoriteNeeds,
    restockNext: groups.suggestions,
    queue: staplesToQueue(t.staples, t.listedIds, new Set()),
  }
}

function world(change: (w: WorldSeed) => void, base: () => WorldSeed = defaultWorld): WorldSeed {
  const w = base()
  change(w)
  return w
}

const names = (xs: readonly { name: string }[]) => xs.map((x) => x.name)
const without = (ids: number[], drop: number) => ids.filter((id) => id !== drop)

describe('Buy next', () => {
  it('with no favourite waiting, is the server pick the shelf does not already hold', () => {
    // recommend ranks Lime juice, Simple syrup, Gin… first: all on the shelf.
    const d = decide(defaultWorld())
    expect(d.pick).toEqual({ id: I.scotch, name: 'Scotch whisky', reason: undefined })
    expect(d.forFavorites).toEqual([])
    expect(names(d.restockNext)).toEqual(['Dark rum'])
  })

  it('is the one bottle a favourite misses, "completes 1 favorite", displacing the server pick', () => {
    // ADR-008 Validation: favourite a drink missing one bottle.
    const d = decide(world((w) => (w.favorites = [C.negroni])))
    expect(d.pick).toEqual({ id: I.campari, name: 'Campari', reason: 'completes 1 favorite' })
    expect(d.forFavorites).toEqual([])
    // The server pick is displaced, not dropped: it leads Restock next.
    expect(names(d.restockNext)).toEqual(['Scotch whisky', 'Dark rum'])
  })

  it('takes a bottle the server also recommends for the favourite, and Restock next gives it up', () => {
    // Rob Roy misses Scotch whisky, which is also the server's top pick.
    const d = decide(world((w) => (w.favorites = [C.robRoy])))
    expect(d.pick).toEqual({ id: I.scotch, name: 'Scotch whisky', reason: 'completes 1 favorite' })
    expect(names(d.restockNext)).toEqual(['Dark rum'])
  })

  it('goes to the bottle completing the most favourites, ahead of one met first', () => {
    // Negroni misses Campari; Rob Roy and Bobby Burns each miss only Scotch
    // whisky (Laphroaig 10 sits two levels below it). Campari is met first.
    const d = decide(world((w) => (w.favorites = [C.negroni, C.robRoy, C.bobbyBurns])))
    expect(d.pick).toEqual({ id: I.scotch, name: 'Scotch whisky', reason: 'completes 2 favorites' })
    expect(names(d.forFavorites)).toEqual(['Campari'])
    expect(names(d.restockNext)).toEqual(['Dark rum'])
  })

  it('is absent when no group has a bottle', () => {
    expect(buyNextGroups([], [])).toEqual({ pick: undefined, favoriteNeeds: [], suggestions: [] })
  })
})

describe('the groups beneath Buy next', () => {
  // Every favourite one bottle away in the default world: six distinct bottles,
  // each completing the drinks that need it.
  const oneAway = [C.negroni, C.robRoy, C.bobbyBurns, C.manhattan, C.martini, C.penicillin, C.mojito]

  it('never show a bottle twice, nor one that is owned or listed', () => {
    const everyDrink = (w: WorldSeed) => (w.favorites = w.cocktails.map((c) => c.id))
    const worlds: [string, WorldSeed][] = [
      ['default, no favourites', defaultWorld()],
      ['default, one away', world((w) => (w.favorites = oneAway))],
      ['default, every drink', world(everyDrink)],
      ['bare, every drink', world(everyDrink, bareWorld)],
      [
        'bare, Campari listed',
        world((w) => {
          w.favorites = [C.negroni, C.margarita]
          w.list = [I.campari]
        }, bareWorld),
      ],
    ]
    for (const [label, w] of worlds) {
      const d = decide(w)
      const shown = [
        ...(d.pick ? [d.pick.id] : []),
        ...d.forFavorites.map((f) => f.id),
        ...d.restockNext.map((r) => r.id),
      ]
      expect(shown.length, label).toBeGreaterThan(0)
      expect(new Set(shown).size, label).toBe(shown.length)
      expect(shown.filter((id) => d.ownedOrListed.has(id)), label).toEqual([])
    }
  })

  it(`hold ${GROUP_LIMIT} bottles each at most, less the pick taken from its group`, () => {
    const favs = decide(world((w) => (w.favorites = oneAway)))
    expect(favs.gaps).toHaveLength(6)
    expect(favs.favoriteNeeds).toHaveLength(GROUP_LIMIT)
    expect(favs.pick).toEqual({ id: I.scotch, name: 'Scotch whisky', reason: 'completes 2 favorites' })
    expect(favs.forFavorites).toHaveLength(GROUP_LIMIT - 1)

    // Off a bare shelf the server ranks six bottles that are not staples into
    // its top ten.
    const bare = decide(bareWorld())
    expect(names(bare.suggestions)).toEqual([
      'Gin',
      'Sweet vermouth',
      'White rum',
      'Scotch whisky',
      'Bourbon whiskey',
    ])
    expect(bare.pick).toEqual({ id: I.gin, name: 'Gin', reason: undefined })
    expect(names(bare.restockNext)).toEqual(['Sweet vermouth', 'White rum', 'Scotch whisky', 'Bourbon whiskey'])
  })
})

describe('favourite gaps', () => {
  it('never count an optional line', () => {
    // Whiskey Sour's egg white is optional and off the shelf.
    expect(decide(world((w) => (w.favorites = [C.whiskeySour]))).gaps).toEqual([])
    // Dark 'n' Stormy's lime is optional: with it gone, only required lines are gaps.
    const d = decide(
      world((w) => {
        w.favorites = [C.darkNStormy]
        w.shelf = without(w.shelf, I.limeJuice)
      }),
    )
    expect(names(d.gaps)).toEqual(['Dark rum', 'Ginger beer'])
  })

  it('never count an owned bottle, nor a line a held child brand covers', () => {
    expect(decide(world((w) => (w.favorites = [C.daiquiri]))).gaps).toEqual([])
    // Penicillin calls Islay Scotch; the shelf holds Laphroaig 10, its child.
    expect(names(decide(world((w) => (w.favorites = [C.penicillin]))).gaps)).toEqual(['Honey syrup'])
  })

  it('never count a bottle already on the list, which leaves Buy next to the server', () => {
    const d = decide(
      world((w) => {
        w.favorites = [C.negroni]
        w.list = [I.campari]
      }),
    )
    expect(d.gaps).toEqual([])
    expect(d.pick).toEqual({ id: I.scotch, name: 'Scotch whisky', reason: undefined })
  })
})

describe('Restock next', () => {
  it('never offers a bottle that is owned or listed, though the server ranks it', () => {
    expect(names(decide(defaultWorld()).suggestions)).toEqual(['Scotch whisky', 'Dark rum'])
    expect(names(decide(world((w) => (w.list = [I.scotch]))).suggestions)).toEqual(['Dark rum'])
  })

  it('never offers a staple: the standing order queues it instead', () => {
    // Off the shelf, Lime juice is the server's top pick and not owned.
    const d = decide(world((w) => (w.shelf = without(w.shelf, I.limeJuice))))
    expect(names(d.suggestions)).toEqual(['Scotch whisky', 'Dark rum'])
    expect(names(d.queue)).toEqual(['Lime juice'])
  })
})

describe('standing orders', () => {
  const tonicOut = () => world((w) => (w.shelf = without(w.shelf, I.tonic)))

  it('queue an out-of-stock staple that is not on the list', () => {
    expect(names(decide(tonicOut()).queue)).toEqual(['Tonic'])
  })

  it('do not queue a staple already on the list', () => {
    const w = tonicOut()
    w.list = [I.tonic]
    expect(decide(w).queue).toEqual([])
  })

  it('do not queue a staple the caller has already queued', () => {
    const t = inputs(tonicOut())
    expect(staplesToQueue(t.staples, t.listedIds, new Set([I.tonic]))).toEqual([])
  })

  it('do not queue a staple on the shelf', () => {
    expect(decide(defaultWorld()).queue).toEqual([])
  })

  it('queue every staple off a bare shelf, in the staples file order', () => {
    expect(names(decide(bareWorld()).queue)).toEqual([
      'Club soda',
      'Tonic',
      'Simple syrup',
      'Lime juice',
      'Lemon juice',
      'Angostura aromatic bitters',
    ])
  })
})
