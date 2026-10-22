import { describe, expect, it, vi } from 'vitest'
import { shelfIndex } from '../api/types'
import { BarModel, cocktailResource, ingredientResource, shoppingListResource } from '../../test/fixtures/upstream'
import { C, I, bareWorld, defaultWorld, type WorldSeed } from '../../test/fixtures/world'
import { STAPLE_SLUGS } from './staples'
import {
  GROUP_LIMIT,
  buyNextGroups,
  favoriteGaps,
  rankFavoriteNeeds,
  rankList,
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
// - recommendations: the server's ranking, the ten bottles named by the most
//   recipes among those not held (IngredientService.php:227-281). Tonight reads
//   it against the user's shelf, GET /users/{id}/ingredients/recommend
//   (`userRecommendations`; chrispezza/barback#22). Most tests here feed the
//   bar-wide ranking instead, GET /bars/{id}/ingredients/recommend against the
//   empty bar shelf, which Tonight read before #22: it returns owned bottles
//   too, so it is the harshest input for the client filter that remains as a
//   safety net.

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
    userRecommendations: m.recommendFor(m.shelf),
  }
}

/**
 * Tonight's decisions for a world, wired as the screen wires them. `ranking`
 * picks the recommend input: 'user' is what Tonight reads; 'bar' (the default
 * here) is the bar-wide ranking, the harsher input for the filter.
 */
function decide(w: WorldSeed, ranking: 'bar' | 'user' = 'bar') {
  const t = inputs(w)
  const gaps = favoriteGaps(t.favorites, t.ownedOrListed, t.shelf)
  const favoriteNeeds = rankFavoriteNeeds(gaps)
  const suggestions = restockSuggestions(
    ranking === 'user' ? t.userRecommendations : t.recommendations,
    t.ownedOrListed,
    t.stapleIds,
    favoriteNeeds,
    t.shelf,
  )
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

describe('what a favourite bottle completes', () => {
  // ADR-008 Decision: "within favorites, bottles completing more favorited
  // drinks rank first". A bottle completes a favourite when it is the only
  // bottle that favourite still misses once owned and listed bottles are set
  // aside. A favourite two bottles away is completed by neither, however many
  // favourites need each one.
  const vermouthOut = (w: WorldSeed) => (w.shelf = without(w.shelf, I.sweetVermouth))

  it('says no bottle completes a favourite two bottles away', () => {
    // With Sweet vermouth gone, Rob Roy and Bobby Burns each miss it and
    // Scotch whisky (Laphroaig 10 sits two levels below Scotch whisky).
    const d = decide(
      world((w) => {
        vermouthOut(w)
        w.favorites = [C.robRoy, C.bobbyBurns]
      }),
    )
    expect(names(d.gaps)).toEqual(['Scotch whisky', 'Sweet vermouth'])
    expect(d.pick).toEqual({ id: I.scotch, name: 'Scotch whisky', reason: 'in 2 favorites' })
    expect(names(d.forFavorites)).toEqual(['Sweet vermouth'])
    // Neither bottle, leading Buy next, would be said to complete anything.
    for (const need of d.favoriteNeeds) {
      expect(buyNextGroups([need], []).pick?.reason, need.name).toBe('in 2 favorites')
    }
  })

  it('goes to a bottle that completes one favourite, ahead of one three favourites need that completes none', () => {
    // With Sweet vermouth gone, Manhattan, Rob Roy and Negroni each miss it and
    // one bottle more (Rye whiskey, Scotch whisky, Campari). Martini, met last,
    // misses only Dry vermouth.
    const d = decide(
      world((w) => {
        vermouthOut(w)
        w.favorites = [C.manhattan, C.robRoy, C.negroni, C.martini]
      }),
    )
    expect(d.pick).toEqual({ id: I.dryVermouth, name: 'Dry vermouth', reason: 'completes 1 favorite' })
    // Then by favourites that need the bottle, then by name.
    expect(d.forFavorites.map((f) => [f.name, f.count])).toEqual([
      ['Sweet vermouth', 3],
      ['Campari', 1],
      ['Rye whiskey', 1],
      ['Scotch whisky', 1],
    ])
  })

  it('sets a listed bottle aside: the other bottle then completes that favourite, and only that one', () => {
    // Negroni misses Campari, which is listed, and Sweet vermouth. Rob Roy
    // misses Sweet vermouth and Scotch whisky, neither listed.
    const d = decide(
      world((w) => {
        vermouthOut(w)
        w.list = [I.campari]
        w.favorites = [C.negroni, C.robRoy]
      }),
    )
    expect(d.pick).toEqual({ id: I.sweetVermouth, name: 'Sweet vermouth', reason: 'completes 1 favorite' })
    expect(d.forFavorites.map((f) => [f.name, f.count])).toEqual([['Scotch whisky', 1]])
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

describe('Restock next, ranked against the user’s shelf (chrispezza/barback#22)', () => {
  // A shelf holding every bottle the bar-wide top ten names, and Islay Scotch
  // beside the Laphroaig 10.
  const stocked = () => world((w) => (w.shelf = [...w.shelf, I.scotch, I.darkRum, I.islayScotch]))

  it('still has bottles to offer a well-stocked shelf, and moves on as one is shelved', () => {
    const d = decide(stocked(), 'user')
    expect(d.pick).toEqual({ id: I.rye, name: 'Rye whiskey', reason: undefined })
    expect(names(d.restockNext)).toEqual(['Tequila', 'Vodka', 'Cointreau', 'Campari'])

    const shelved = decide(world((w) => (w.shelf = [...w.shelf, I.rye]), stocked), 'user')
    expect(shelved.pick).toEqual({ id: I.tequila, name: 'Tequila', reason: undefined })
    expect(names(shelved.restockNext)).toEqual(['Vodka', 'Cointreau', 'Campari', 'Coffee liqueur'])
  })

  it('never offers the direct parent of a held brand, though the ranking names it', () => {
    // The ranking compares ids: Laphroaig 10 does not hold Islay Scotch, its
    // direct parent, by id, but the matcher credits it to every Islay Scotch
    // line. Scotch whisky, two levels up, is not credited and stays: it opens
    // the Rob Roy and the Bobby Burns, the two drinks Islay Scotch would.
    const t = inputs(defaultWorld())
    expect(names(t.userRecommendations)).toContain('Islay Scotch')
    const d = decide(defaultWorld(), 'user')
    expect(d.pick).toEqual({ id: I.scotch, name: 'Scotch whisky', reason: undefined })
    expect(names(d.restockNext)).toEqual(['Dark rum', 'Rye whiskey', 'Tequila', 'Vodka'])
  })

  it('never offers Gin beside London dry gin, a held child of it', () => {
    const w = world((x) => (x.shelf = [...without(x.shelf, I.gin), I.londonDryGin]))
    expect(names(inputs(w).userRecommendations)[0]).toBe('Gin')
    const d = decide(w, 'user')
    expect(d.pick).toEqual({ id: I.scotch, name: 'Scotch whisky', reason: undefined })
    expect(names(d.restockNext)).toEqual(['Dark rum', 'Rye whiskey', 'Tequila', 'Vodka'])
  })

  it('with the groups beneath it, never shows a bottle twice, nor one owned, listed or covered', () => {
    const worlds: [string, WorldSeed][] = [
      ['default', defaultWorld()],
      ['stocked', stocked()],
      ['stocked, every drink', world((w) => (w.favorites = w.cocktails.map((c) => c.id)), stocked)],
      ['bare', bareWorld()],
      ['London dry gin', world((w) => (w.shelf = [...without(w.shelf, I.gin), I.londonDryGin]))],
    ]
    for (const [label, w] of worlds) {
      const t = inputs(w)
      const d = decide(w, 'user')
      const shown = [
        ...(d.pick ? [d.pick.id] : []),
        ...d.forFavorites.map((f) => f.id),
        ...d.restockNext.map((r) => r.id),
      ]
      expect(shown.length, label).toBeGreaterThan(0)
      expect(new Set(shown).size, label).toBe(shown.length)
      expect(shown.filter((id) => d.ownedOrListed.has(id)), label).toEqual([])
      expect(d.restockNext.filter((r) => t.shelf.parentsAndRoots.has(r.id)), label).toEqual([])
    }
  })

  it('never offers the root a held bottle sits under', () => {
    // No recipe names a root here, so the ranking never does; fed one, the
    // filter drops it as the matcher would credit any held spirit to it.
    const t = inputs(defaultWorld())
    const spirits = { id: I.spirits, slug: 'spirits-1', name: 'Spirits', potential_cocktails: 99 }
    const offered = restockSuggestions([spirits, ...t.userRecommendations], t.ownedOrListed, t.stapleIds, [], t.shelf)
    expect(names(offered)).toEqual(['Scotch whisky', 'Dark rum', 'Rye whiskey', 'Tequila', 'Vodka'])
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

describe('the standing-order memory', () => {
  // ADR-008 Validation: a staple "queues itself once per session". The session
  // is the page session, so the memory lives in this module: a re-imported
  // module (vi.resetModules) is a reload, a new session; the same module is
  // the same session however often Tonight mounts. Once per emptying: a staple
  // read back on the shelf, or whose write failed, is released.
  const tonicOut = () => world((w) => (w.shelf = without(w.shelf, I.tonic)))
  async function newSession() {
    vi.resetModules()
    return import('./buy-next')
  }

  it('starts each page session empty, so an out-of-stock staple is queued', async () => {
    const s = await newSession()
    const t = inputs(tonicOut())
    expect(s.queuedThisSession.size).toBe(0)
    expect(names(s.staplesToQueue(t.staples, t.listedIds, s.queuedThisSession))).toEqual(['Tonic'])
  })

  it('holds a queued staple for the session: dropped from the list, it is not queued again', async () => {
    const s = await newSession()
    const t = inputs(tonicOut())
    s.rememberQueued(s.staplesToQueue(t.staples, t.listedIds, s.queuedThisSession).map((x) => x.id))
    // Queued and then dropped: off the shelf and off the list, as before the write.
    expect(s.staplesToQueue(t.staples, t.listedIds, s.queuedThisSession)).toEqual([])
  })

  it('is one memory for every importer this session, and empty in the next', async () => {
    const s = await newSession()
    const t = inputs(tonicOut())
    s.rememberQueued([I.tonic])
    const sameSession = await import('./buy-next')
    expect(sameSession.staplesToQueue(t.staples, t.listedIds, sameSession.queuedThisSession)).toEqual([])
    const next = await newSession()
    expect(names(next.staplesToQueue(t.staples, t.listedIds, next.queuedThisSession))).toEqual(['Tonic'])
  })

  it('keeps holding a staple read still off the shelf: dropped from the list, it stays dropped', async () => {
    const s = await newSession()
    const out = inputs(tonicOut())
    s.rememberQueued([I.tonic])
    s.forgetRestocked(out.staples)
    expect(s.staplesToQueue(out.staples, out.listedIds, s.queuedThisSession)).toEqual([])
  })

  it('releases a staple read back on the shelf, so it is queued again when it next runs out', async () => {
    const s = await newSession()
    const out = inputs(tonicOut())
    s.rememberQueued(s.staplesToQueue(out.staples, out.listedIds, s.queuedThisSession).map((x) => x.id))
    // Checked off: the staples read has Tonic on the shelf again.
    const restocked = inputs(defaultWorld())
    expect(restocked.staples.find((x) => x.id === I.tonic)?.in_shelf).toBe(true)
    s.forgetRestocked(restocked.staples)
    // Used up again: off the shelf and off the list.
    expect(names(s.staplesToQueue(out.staples, out.listedIds, s.queuedThisSession))).toEqual(['Tonic'])
  })

  it('releases only the staples back on the shelf', async () => {
    const s = await newSession()
    const out = inputs(world((w) => (w.shelf = without(without(w.shelf, I.tonic), I.limeJuice))))
    s.rememberQueued([I.tonic, I.limeJuice])
    s.forgetRestocked(inputs(world((w) => (w.shelf = without(w.shelf, I.limeJuice)))).staples)
    expect(names(s.staplesToQueue(out.staples, out.listedIds, s.queuedThisSession))).toEqual(['Tonic'])
  })

  it('releases a staple whose write failed, so the next Tonight sends it again', async () => {
    const s = await newSession()
    const out = inputs(tonicOut())
    s.rememberQueued([I.tonic])
    s.forgetQueued([I.tonic])
    expect(names(s.staplesToQueue(out.staples, out.listedIds, s.queuedThisSession))).toEqual(['Tonic'])
  })
})

describe('the standing-order memory, for a staple listed before the session (chrispezza/barback#55)', () => {
  // The usual state after an earlier session's auto-queue: Tonic off the shelf
  // and on the list. This session never sent its write, so the memory holds it
  // only once Tonight reads it there (rememberListed) or the user drops it by
  // hand (rememberDropped). Either way the next emptying is still queued.
  const tonicOut = (listed: number[] = []) =>
    world((w) => {
      w.shelf = without(w.shelf, I.tonic)
      w.list = listed
    })
  async function newSession() {
    vi.resetModules()
    return import('./buy-next')
  }

  it('holds a staple read on the list off the shelf: dropped, it is not queued', async () => {
    const s = await newSession()
    const listed = inputs(tonicOut([I.tonic]))
    const dropped = inputs(tonicOut())
    // Unheld, the drop alone would queue it straight back.
    expect(names(s.staplesToQueue(dropped.staples, dropped.listedIds, s.queuedThisSession))).toEqual(['Tonic'])
    s.rememberListed(listed.staples, listed.listedIds)
    expect([...s.queuedThisSession]).toEqual([I.tonic])
    expect(s.staplesToQueue(dropped.staples, dropped.listedIds, s.queuedThisSession)).toEqual([])
  })

  it('holds only listed staples that are off the shelf', async () => {
    const s = await newSession()
    // Tonic off the shelf and not listed; Club soda listed and on the shelf;
    // Campari listed and off the shelf, but no staple.
    const t = inputs(tonicOut([I.clubSoda, I.campari]))
    s.rememberListed(t.staples, t.listedIds)
    expect(s.queuedThisSession.size).toBe(0)
  })

  it('releases a listed staple read back on the shelf, so its next emptying is queued', async () => {
    const s = await newSession()
    const listed = inputs(tonicOut([I.tonic]))
    s.rememberListed(listed.staples, listed.listedIds)
    // Checked off: the staples read has Tonic on the shelf again.
    s.forgetRestocked(inputs(defaultWorld()).staples)
    // Used up again: off the shelf and off the list.
    const out = inputs(tonicOut())
    expect(names(s.staplesToQueue(out.staples, out.listedIds, s.queuedThisSession))).toEqual(['Tonic'])
  })

  it('holds a staple dropped by hand off the shelf', async () => {
    const s = await newSession()
    const out = inputs(tonicOut())
    s.rememberDropped(I.tonic, out.staples)
    expect(s.staplesToQueue(out.staples, out.listedIds, s.queuedThisSession)).toEqual([])
  })

  it('does not hold a dropped staple the staples read has on the shelf, nor a dropped bottle that is no staple', async () => {
    const s = await newSession()
    const stocked = inputs(defaultWorld())
    s.rememberDropped(I.tonic, stocked.staples)
    s.rememberDropped(I.campari, stocked.staples)
    expect(s.queuedThisSession.size).toBe(0)
  })

  it('holds a bottle dropped before the staples read lands, until that read has it on the shelf', async () => {
    const s = await newSession()
    const out = inputs(tonicOut())
    s.rememberDropped(I.tonic, undefined)
    // The read lands with Tonic still off the shelf: it stays dropped.
    s.forgetRestocked(out.staples)
    expect(s.staplesToQueue(out.staples, out.listedIds, s.queuedThisSession)).toEqual([])
    // The read has it on the shelf: released, so its next emptying is queued.
    s.forgetRestocked(inputs(defaultWorld()).staples)
    expect(names(s.staplesToQueue(out.staples, out.listedIds, s.queuedThisSession))).toEqual(['Tonic'])
  })
})

describe('favourite gaps, for a favourite the server pours (chrispezza/barback#20)', () => {
  // The favourites read is the index shape, which carries no substitute flag,
  // so a line a held substitute covers arrives with in_shelf false. Its
  // `in_shelf` is the server's matcher (CocktailResource.php:133,
  // CocktailService.php:255-311 at v5.15.3): true only once every required
  // line is held exactly, through a substitute or through a child brand. A
  // favourite that pours needs no bottle, so no bottle "completes" it (ADR-008).

  /** The Mojito topped with Tonic: its club soda line lists Tonic as a
   *  substitute; the shelf holds Tonic and Mint but no Club soda. */
  const mojitoOnTonic = (w: WorldSeed) => (w.shelf = [...without(w.shelf, I.clubSoda), I.mint])
  /** A Manhattan whose rye line lists Bourbon whiskey as a substitute: the
   *  default shelf holds Bourbon whiskey, not Rye whiskey. */
  const bourbonForRye = (w: WorldSeed) => {
    const rye = w.cocktails.find((c) => c.id === C.manhattan)?.lines.find((l) => l.ingredientId === I.rye)
    if (rye) rye.substituteIds = [I.bourbon]
  }

  it.each([
    ['the Mojito, Tonic for Club soda', C.mojito, mojitoOnTonic],
    ['the Manhattan, Bourbon whiskey for Rye whiskey', C.manhattan, bourbonForRye],
  ] as const)('offer no bottle for a favourite that pours with a substitute standing in: %s', (_name, cocktail, change) => {
    const w = world((x) => {
      change(x)
      x.favorites = [cocktail]
    })
    // Guard: the server pours it, and its index lines alone miss one bottle.
    const [favorite] = inputs(w).favorites
    expect(favorite?.in_shelf).toBe(true)
    expect(favorite?.ingredients.filter((e) => !e.in_shelf && !e.optional)).toHaveLength(1)
    const d = decide(w)
    expect(d.gaps).toEqual([])
    // Buy next is left to the server's pick.
    expect(d.pick).toEqual({ id: I.scotch, name: 'Scotch whisky', reason: undefined })
    expect(d.forFavorites).toEqual([])
  })

  it('still offer what a favourite that does not pour misses', () => {
    const d = decide(world((w) => (mojitoOnTonic(w), (w.favorites = [C.mojito, C.negroni]))))
    expect(names(d.gaps)).toEqual(['Campari'])
    expect(d.pick).toEqual({ id: I.campari, name: 'Campari', reason: 'completes 1 favorite' })
  })

  it('leave the standing order alone: a staple off the shelf still queues itself', () => {
    // Club soda is a staple (src/data/staples.ts), a rule the user wrote.
    const d = decide(world((w) => (mojitoOnTonic(w), (w.favorites = [C.mojito]))))
    expect(names(d.queue)).toEqual(['Club soda'])
  })
})

describe('To buy, ranked by what each bottle unlocks (frontend-spec §6 Journey 3)', () => {
  // The list as Tonight receives it: GET /users/{id}/shopping-list, sorted by
  // ingredient name (ShoppingListController.php:38 at v5.15.3). Each count is
  // GET /ingredients/{id}/extra's length: the drinks the bottle would add to
  // what the user's shelf pours (IngredientController.php:199-226).
  //
  // Against the default shelf with the Whiskey Sour's egg white: Scotch whisky
  // opens the Rob Roy and the Bobby Burns; Campari, Dry vermouth and Mint one
  // drink each; Cointreau and Tequila nothing alone.
  const listed = [I.campari, I.cointreau, I.dryVermouth, I.mint, I.scotch, I.tequila]

  const idsOf = (rows: readonly { ingredient: { id: number } }[]) => rows.map((r) => r.ingredient.id)

  /** The list Tonight reads with these bottles on it, and their counts. */
  function toBuy(ids: number[] = listed) {
    const m = new BarModel(world((w) => (w.shelf.push(I.eggWhite), (w.list = ids))))
    const items = shoppingListResource(m)
    const unlocks = (id: number) => {
      const before = m.canMake()
      return [...m.canMakeWith(new Set([...m.shelf, id]))].filter((c) => !before.has(c)).length
    }
    /** The counts in hand once these bottles' reads have answered: all, by default. */
    const counted = (answered: number[] = idsOf(items)) => new Map(answered.map((id) => [id, unlocks(id)]))
    return { items, counted }
  }
  const rowNames = (rows: readonly { ingredient: { name: string } }[]) => rows.map((r) => r.ingredient.name)
  const BY_NAME = ['Campari', 'Cointreau', 'Dry vermouth', 'Mint', 'Scotch whisky', 'Tequila']
  const RANKED = ['Scotch whisky', 'Campari', 'Dry vermouth', 'Mint', 'Cointreau', 'Tequila']

  it('comes from upstream by name, which is not the ranking', () => {
    expect(rowNames(toBuy().items)).toEqual(BY_NAME)
  })

  it('puts the bottle that opens the most drinks first, ties by name, and one that opens nothing last', () => {
    const { items, counted } = toBuy()
    const ranked = rankList(items, counted())
    expect(ranked.settled).toBe(true)
    expect(rowNames(ranked.rows)).toEqual(RANKED)
  })

  it('ranks the same whatever order the rows arrive in', () => {
    const { items, counted } = toBuy()
    expect(rowNames(rankList([...items].reverse(), counted()).rows)).toEqual(RANKED)
  })

  it('counts a zero as a count: a bottle that opens nothing does not hold the order', () => {
    const { items, counted } = toBuy([I.cointreau, I.campari])
    const ranked = rankList(items, counted())
    expect(ranked.settled).toBe(true)
    expect(rowNames(ranked.rows)).toEqual(['Campari', 'Cointreau'])
  })

  it('waits in name order until every count is in, the leader’s included', () => {
    const { items, counted } = toBuy()
    for (const missing of listed) {
      const ranked = rankList(items, counted(listed.filter((id) => id !== missing)))
      expect(ranked.settled, `without ${missing}`).toBe(false)
      expect(rowNames(ranked.rows), `without ${missing}`).toEqual(BY_NAME)
    }
    expect(rowNames(rankList(items, new Map()).rows)).toEqual(BY_NAME)
  })

  it('holds the last settled order while a bottle listed since is counted, with the newcomer below', () => {
    const { items, counted } = toBuy()
    const held = idsOf(rankList(items, counted()).rows)
    // Rye whiskey, listed from the Manhattan's card; the list comes back by name.
    const after = toBuy([...listed, I.rye])
    expect(rowNames(after.items)).toEqual([...BY_NAME.slice(0, 4), 'Rye whiskey', ...BY_NAME.slice(4)])

    const waiting = rankList(after.items, counted(), held)
    expect(waiting.settled).toBe(false)
    expect(rowNames(waiting.rows)).toEqual([...RANKED, 'Rye whiskey'])

    const settled = rankList(after.items, after.counted(), held)
    expect(settled.settled).toBe(true)
    expect(rowNames(settled.rows)).toEqual([
      'Scotch whisky',
      'Campari',
      'Dry vermouth',
      'Mint',
      'Rye whiskey',
      'Cointreau',
      'Tequila',
    ])
  })

  it('puts several newcomers below the held rows by name, and forgets held bottles no longer listed', () => {
    const { items, counted } = toBuy()
    const held = idsOf(rankList(items, counted()).rows)
    const after = toBuy([I.campari, I.mint, I.scotch, I.rye, I.honeySyrup])
    const waiting = rankList(after.items, counted([I.campari, I.mint, I.scotch]), held)
    expect(rowNames(waiting.rows)).toEqual(['Scotch whisky', 'Campari', 'Mint', 'Honey syrup', 'Rye whiskey'])
  })

  it('after a check-off, keeps its places less the bottle shelved until every refreshed count is in, then settles once', () => {
    // Gin off the shelf, listed with Campari, Dry vermouth and Mint: Gin opens
    // the Gimlet and the Gin Tonic, Mint the Mojito, and Campari and Dry
    // vermouth nothing while the Negroni and the Martini want gin.
    const m = new BarModel(
      world((w) => {
        w.shelf = [...w.shelf.filter((id) => id !== I.gin), I.eggWhite]
        w.list = [I.campari, I.dryVermouth, I.gin, I.mint]
      }),
    )
    const listOf = () => shoppingListResource(m)
    const unlocks = (id: number) => {
      const before = m.canMake()
      return [...m.canMakeWith(new Set([...m.shelf, id]))].filter((c) => !before.has(c)).length
    }
    /** The counts that have answered, read against the shelf as it stands. */
    const answered = (ids: number[]) => new Map(ids.map((id) => [id, unlocks(id)]))

    const first = rankList(listOf(), answered([I.campari, I.dryVermouth, I.gin, I.mint]))
    expect(first.settled).toBe(true)
    expect(rowNames(first.rows)).toEqual(['Gin', 'Mint', 'Campari', 'Dry vermouth'])
    const held = idsOf(first.rows)

    // Checked off: Gin on the shelf and off the list, and every count asked
    // for again. They answer one by one; Dry vermouth's last.
    m.shelf.add(I.gin)
    m.list.delete(I.gin)
    for (const ids of [[], [I.campari], [I.campari, I.mint]]) {
      const waiting = rankList(listOf(), answered(ids), held)
      expect(waiting.settled, `with ${ids.length} answered`).toBe(false)
      expect(rowNames(waiting.rows), `with ${ids.length} answered`).toEqual(['Mint', 'Campari', 'Dry vermouth'])
    }
    const settled = rankList(listOf(), answered([I.campari, I.mint, I.dryVermouth]), held)
    expect(settled.settled).toBe(true)
    expect(rowNames(settled.rows)).toEqual(['Campari', 'Dry vermouth', 'Mint'])
  })

  it('stays as it stands while a count cannot be read, and is settled for an empty list', () => {
    const { items, counted } = toBuy()
    const held = idsOf(rankList(items, counted()).rows)
    // Scotch whisky's read failed: its count never arrives.
    const noScotch = counted(listed.filter((id) => id !== I.scotch))
    expect(rowNames(rankList(items, noScotch, held).rows)).toEqual(RANKED)
    expect(rowNames(rankList(items, noScotch).rows)).toEqual(BY_NAME)
    expect(rankList([], new Map())).toEqual({ rows: [], settled: true })
  })
})
