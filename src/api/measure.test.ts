import { describe, expect, it } from 'vitest'
import { BarModel, cocktailIngredientResource, type RangedLineSeed } from '../../test/fixtures/upstream'
import { I, defaultWorld } from '../../test/fixtures/world'
import { measure } from './measure'

// The measure a Recipe line prints beside its ingredient (frontend-spec §1, §2
// "Recipe detail"). Content fundamentals: "Fractions are typeset as fraction
// glyphs (¾, ⅓), never decimals." Every entry is built by the fixture model in
// the shape Bar Assistant v5.15.3 emits on show (ADR-011): `amount`,
// `amount_max` and `units` as authored, `formatted.oz` converted
// (app/Http/Resources/CocktailIngredientResource.php:52-54, 61;
// app/Http/Resources/AmountFormats.php:49-57).

const read = (line: Omit<RangedLineSeed, 'ingredientId'>) =>
  measure(cocktailIngredientResource(new BarModel(defaultWorld()), { ingredientId: I.limeJuice, ...line }, 1, 'show'))

describe('measure', () => {
  it('reads a volumetric line in ounces, in fraction glyphs', () => {
    expect(read({ amount: 60, units: 'ml' })).toBe('2 oz')
    expect(read({ amount: 22.5, units: 'ml' })).toBe('¾ oz')
    expect(read({ amount: 25, units: 'ml' })).toBe('⅚ oz')
    expect(read({ amount: 3, units: 'cl' })).toBe('1 oz')
    expect(read({ amount: 1.5, units: 'oz' })).toBe('1½ oz')
  })

  it('keeps a dash, a barspoon or a leaf in the unit it was authored in', () => {
    // Upstream converts dashes and barspoons in `formatted` (2 dash is 0.0208
    // oz); the line prints what the recipe says instead.
    expect(read({ amount: 2, units: 'dash' })).toBe('2 dash')
    expect(read({ amount: 1, units: 'barspoon' })).toBe('1 barspoon')
    expect(read({ amount: 6, units: 'leaves' })).toBe('6 leaves')
  })

  it('typesets a fractional dash or barspoon as a glyph, never a decimal', () => {
    expect(read({ amount: 0.5, units: 'barspoon' })).toBe('½ barspoon')
    expect(read({ amount: 0.25, units: 'barspoon' })).toBe('¼ barspoon')
    expect(read({ amount: 1.5, units: 'dash' })).toBe('1½ dash')
    expect(read({ amount: 2.5, units: 'leaves' })).toBe('2½ leaves')
  })

  it('keeps both bounds of a range, each in glyphs, joined by an en dash', () => {
    expect(read({ amount: 22.5, amountMax: 30, units: 'ml' })).toBe('¾–1 oz')
    expect(read({ amount: 1.5, amountMax: 2, units: 'cl' })).toBe('½–⅔ oz')
    expect(read({ amount: 2, amountMax: 3, units: 'dash' })).toBe('2–3 dash')
    expect(read({ amount: 0.5, amountMax: 1, units: 'barspoon' })).toBe('½–1 barspoon')
    expect(read({ amount: 6, amountMax: 8, units: 'leaves' })).toBe('6–8 leaves')
  })

  it("reads an ounce maximum upstream leaves unrounded the way it reads the minimum", () => {
    // 25 ml tops out at 0.8333333333333334 oz on the wire (AmountValueObject.php:35).
    expect(read({ amount: 20, amountMax: 25, units: 'ml' })).toBe('⅔–⅚ oz')
    expect(read({ amount: 45, amountMax: 50, units: 'ml' })).toBe('1½–1⅔ oz')
  })

  it('prints one amount when there is no upper bound, or a zero one', () => {
    // Upstream prints a range only when the maximum is set and not zero
    // (AmountValueObject.php:45).
    expect(read({ amount: 2, units: 'dash' })).not.toContain('–')
    expect(read({ amount: 20, amountMax: 0, units: 'ml' })).toBe('⅔ oz')
    expect(read({ amount: 2, amountMax: 0, units: 'dash' })).toBe('2 dash')
  })
})
