import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { DrinkCard } from '@ds/drinks/DrinkCard'
import type { Cocktail } from '../api/types'
import { BarModel, cocktailResource } from '../../test/fixtures/upstream'
import { C, defaultWorld } from '../../test/fixtures/world'
import { cardIngredients, indexMatchState } from './match'

// The DS DrinkCard as the screens feed it (frontend-spec §7): the ingredient
// run and match state come from src/data/match.ts, the cocktail from the
// fixture builders in the index shape the Index and Tonight read.

afterEach(cleanup)

function card(id: number) {
  const m = new BarModel(defaultWorld())
  const c: Cocktail = cocktailResource(m, m.cocktail(id)!, 'index')
  render(
    <DrinkCard
      name={c.name}
      href={`/drinks/${c.slug}`}
      ingredients={cardIngredients(c)}
      match={indexMatchState(c)}
    />,
  )
  return screen.getByRole('link')
}

describe('DrinkCard fed by the match helpers', () => {
  it('prints the one-bottle-away line on a near card, naming the bottle in italic', () => {
    const link = card(C.negroni)
    expect(link.getAttribute('data-match')).toBe('near')
    expect(link.getAttribute('href')).toBe('/drinks/negroni-1')
    const line = link.querySelector('.bb-drink__missing-line')
    expect(line?.textContent).toBe('One bottle away: Campari')
    expect(line?.querySelector('em')?.textContent).toBe('Campari')
    expect(link.textContent).not.toContain('Can pour')
  })

  it('says it can pour and marks the optional line, with no missing line', () => {
    const link = card(C.whiskeySour)
    expect(link.getAttribute('data-match')).toBe('full')
    expect(link.querySelector('.bb-drink__pour')?.textContent).toBe('✓Can pour')
    expect(link.querySelector('.bb-drink__optional')?.textContent).toBe('Egg whiteoptional')
    expect(link.querySelector('.bb-drink__missing-line')).toBeNull()
  })

  it('counts every missing bottle on a partial card', () => {
    const link = card(C.margarita)
    expect(link.getAttribute('data-match')).toBe('partial')
    expect(link.querySelector('.bb-drink__missing-line')?.textContent).toBe(
      'Missing 2: Tequila, Cointreau',
    )
  })
})
