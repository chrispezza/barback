// Type-level contract (ADR-011): every upstream-shaped fixture resource must be
// assignable to the client type that consumes it. If src/api/types.ts drifts
// from what Bar Assistant v5.15.3 emits on that endpoint, `tsc -b` fails here.
import type {
  Cocktail,
  CocktailIngredientEntry,
  Ingredient,
  IngredientDetail,
  RecommendedIngredient,
  ShoppingListItem,
} from '../../src/api/types'
import {
  BarModel,
  cocktailIngredientResource,
  cocktailResource,
  ingredientResource,
  shoppingListResource,
} from './upstream'
import { C, I, defaultWorld } from './world'

export function contract(m = new BarModel(defaultWorld())) {
  const daiquiri = m.cocktail(C.daiquiri)!
  const line = daiquiri.lines[0]!
  const index: Cocktail = cocktailResource(m, daiquiri, 'index')
  const show: Cocktail = cocktailResource(m, daiquiri, 'show')
  const entryIndex: CocktailIngredientEntry = cocktailIngredientResource(m, line, 1, 'index')
  const entryShow: CocktailIngredientEntry = cocktailIngredientResource(m, line, 1, 'show')
  const shelfRow: Ingredient = ingredientResource(m, I.laphroaig10, 'index')
  const detail: IngredientDetail = ingredientResource(m, I.laphroaig10, 'show')
  // The rows GET /users/{id}/shopping-list serves, as the fake serves them.
  const list: ShoppingListItem[] = shoppingListResource(m)
  const recommended: RecommendedIngredient[] = m.recommendFor(m.shelf)
  return [index, show, entryIndex, entryShow, shelfRow, detail, list, recommended] as const
}
