import { describe, expect, it } from 'vitest'
import { BarModel, cocktailIngredientResource, cocktailResource, type RangedLineSeed } from './upstream'
import { I, defaultWorld } from './world'

// A line's measure as Bar Assistant v5.15.3 emits it (bar-assistant-reference
// at the pinned tag): `amount` and `amount_max` as stored
// (app/Http/Resources/CocktailIngredientResource.php:52-54), and `formatted`
// per AmountFormats (app/Http/Resources/AmountFormats.php:49-57) through
// AmountValueObject::convertTo (app/Models/ValueObjects/AmountValueObject.php:20-36)
// and recipe-utils' converters (vendor/karlomikus/recipe-utils/src/UnitConverter).

const model = () => new BarModel(defaultWorld())

const entry = (line: RangedLineSeed, endpoint: 'index' | 'show' = 'show') =>
  cocktailIngredientResource(model(), line, 1, endpoint)

describe('amount_max', () => {
  it('is null everywhere on every line the default world authors', () => {
    const m = model()
    for (const c of m.world.cocktails) {
      for (const e of cocktailResource(m, c, 'show').ingredients) {
        expect(e.amount_max).toBeNull()
        expect([e.formatted.ml.amount_max, e.formatted.oz.amount_max, e.formatted.cl.amount_max]).toEqual([
          null,
          null,
          null,
        ])
        expect(e.formatted.oz.full_text).not.toContain(' - ')
      }
    }
  })

  it('is emitted as stored on the index and on show alike', () => {
    const line: RangedLineSeed = { ingredientId: I.angostura, amount: 2, amountMax: 3, units: 'dash' }
    expect(entry(line, 'index')).toMatchObject({ amount: 2, amount_max: 3, units: 'dash' })
    expect(entry(line, 'show')).toMatchObject({ amount: 2, amount_max: 3, units: 'dash' })
  })

  it('converts a ranged ml line into every format, and full_text names both bounds', () => {
    const e = entry({ ingredientId: I.sweetVermouth, amount: 22.5, amountMax: 30, units: 'ml' })
    expect(e).toMatchObject({ amount: 22.5, amount_max: 30, units: 'ml' })
    expect(e.formatted).toEqual({
      ml: { amount: 22.5, amount_max: 30, units: 'ml', full_text: '22.5 ml - 30 ml Sweet vermouth' },
      oz: { amount: 0.75, amount_max: 1, units: 'oz', full_text: '0.75 oz - 1 oz Sweet vermouth' },
      cl: { amount: 2.25, amount_max: 3, units: 'cl', full_text: '2.25 cl - 3 cl Sweet vermouth' },
    })
  })

  it('rounds the converted minimum to four places and leaves the maximum unrounded', () => {
    // convertTo: round($convertedMinAmount->getValue(), 4) for the minimum,
    // $convertedMaxAmount?->getValue() for the maximum (AmountValueObject.php:35).
    const oz = entry({ ingredientId: I.limeJuice, amount: 20, amountMax: 25, units: 'ml' }).formatted.oz
    expect(oz.amount).toBe(0.6667)
    expect(oz.amount_max).toBe(25 / 30)
    // PHP prints the float to 14 significant digits.
    expect(oz.full_text).toBe('0.6667 oz - 0.83333333333333 oz Lime juice')
  })

  it('converts a ranged dash line too, while the top-level bounds stay as authored', () => {
    const e = entry({ ingredientId: I.angostura, amount: 2, amountMax: 3, units: 'dash' })
    expect(e).toMatchObject({ amount: 2, amount_max: 3, units: 'dash' })
    // Dash::toStandardMlValue is 0.3125 ml a dash.
    expect(e.formatted.ml).toMatchObject({ amount: 0.625, amount_max: 0.9375, units: 'ml' })
    expect(e.formatted.oz).toMatchObject({ amount: 0.0208, amount_max: 0.03125, units: 'oz' })
  })

  it('passes a unit the converter does not know through as stored, upper bound and all', () => {
    const e = entry({ ingredientId: I.mint, amount: 6, amountMax: 8, units: 'leaves' })
    for (const f of [e.formatted.ml, e.formatted.oz, e.formatted.cl]) {
      expect(f).toEqual({ amount: 6, amount_max: 8, units: 'leaves', full_text: '6 leaves - 8 leaves Mint' })
    }
  })

  it('treats a zero maximum as none once converted, and passes it through unconverted', () => {
    // `if ($this->amountMax)` before converting (AmountValueObject.php:31) and
    // before printing the range (:45); the unconverted copy keeps it (:26).
    const ml = entry({ ingredientId: I.limeJuice, amount: 20, amountMax: 0, units: 'ml' })
    expect(ml.amount_max).toBe(0)
    expect(ml.formatted.oz).toMatchObject({ amount_max: null, full_text: '0.6667 oz Lime juice' })
    const leaves = entry({ ingredientId: I.mint, amount: 6, amountMax: 0, units: 'leaves' })
    expect(leaves.formatted.oz).toMatchObject({ amount_max: 0, full_text: '6 leaves Mint' })
  })
})
