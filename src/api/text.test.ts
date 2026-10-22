import { describe, expect, it } from 'vitest'
import { BarModel, cocktailResource, laravelEscape } from '../../test/fixtures/upstream'
import { C, defaultWorld } from '../../test/fixtures/world'
import type { Cocktail } from './types'
import { decodeCocktailText, decodeEntities } from './text'

// Upstream escapes a cocktail's instructions, garnish and description on output
// with Laravel's e(): htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE,
// 'UTF-8', $doubleEncode = true) (bar-assistant-reference
// app/Http/Resources/CocktailResource.php:96-98; vendor
// Illuminate/Support/helpers.php:124-139 at v5.15.3). The client undoes exactly
// that, once, and nothing else.

describe('decodeEntities', () => {
  it('turns each entity e() writes back into its character', () => {
    expect(decodeEntities('&amp;')).toBe('&')
    expect(decodeEntities('&lt;')).toBe('<')
    expect(decodeEntities('&gt;')).toBe('>')
    expect(decodeEntities('&quot;')).toBe('"')
    expect(decodeEntities('&#039;')).toBe("'")
  })

  it('reads an escaped method as it was written', () => {
    expect(decodeEntities('Shake &amp; strain')).toBe('Shake & strain')
    expect(decodeEntities('don&#039;t')).toBe("don't")
    expect(decodeEntities('Shake &amp; strain; don&#039;t &quot;bruise&quot; it &lt;gently&gt;')).toBe(
      `Shake & strain; don't "bruise" it <gently>`,
    )
  })

  it('undoes e() exactly once, so stored text that looks like an entity survives', () => {
    // e() double-encodes: a stored "&amp;" arrives as "&amp;amp;" and must read
    // "&amp;" again, never "&". A chain of replaces that ran &amp; first would
    // turn "&amp;lt;" into "<".
    for (const stored of [
      'Shake & strain',
      `Don't "bruise" it <gently>`,
      'R&amp;D',
      '&lt;b&gt;bold&lt;/b&gt;',
      '&#039;quoted&#039;',
      '&amp;amp;',
      '&&&;;',
      '',
    ]) {
      expect(decodeEntities(laravelEscape(stored))).toBe(stored)
    }
    expect(decodeEntities('&amp;lt;')).toBe('&lt;')
    expect(decodeEntities('&amp;#039;')).toBe('&#039;')
  })

  it('leaves alone every entity e() never writes', () => {
    // Under ENT_QUOTES with the default HTML 4.01 table, e() writes only the
    // five above; anything else in the text was stored that way.
    for (const text of ['&nbsp;', '&#39;', '&#x27;', '&apos;', '&AMP;', '&amp', '&#0390;', 'a & b', '&copy; 2026']) {
      expect(decodeEntities(text)).toBe(text)
    }
  })
})

describe('decodeCocktailText', () => {
  const m = new BarModel(defaultWorld())
  const gimlet = m.cocktail(C.gimlet)!
  const seed = {
    ...gimlet,
    instructions: `Shake & fine-strain. Don't over-dilute: "cold, not watery" — <ten seconds>.`,
    garnish: `Lime's wheel & "zest" <optional>`,
  }

  it('gives back the instructions and garnish the recipe was stored with', () => {
    const shown: Cocktail = cocktailResource(m, seed, 'show')
    expect(shown.instructions).toContain('&amp;')
    const decoded = decodeCocktailText(shown)
    expect(decoded.instructions).toBe(seed.instructions)
    expect(decoded.garnish).toBe(seed.garnish)
  })

  it('leaves the name, which upstream does not escape, as it came', () => {
    const shown: Cocktail = { ...cocktailResource(m, gimlet, 'show'), name: 'Tom &amp; Jerry' }
    expect(decodeCocktailText(shown).name).toBe('Tom &amp; Jerry')
  })

  it('keeps an absent garnish absent and changes nothing else', () => {
    const shown: Cocktail = cocktailResource(m, gimlet, 'show')
    expect(decodeCocktailText({ ...shown, garnish: null }).garnish).toBeNull()
    // e(null) is '' upstream: still no garnish.
    expect(decodeCocktailText(shown).garnish).toBe('')
    expect(decodeCocktailText(shown)).toEqual(shown)
  })

  it('is pure: the response it read is not changed', () => {
    const shown: Cocktail = cocktailResource(m, seed, 'show')
    const before = structuredClone(shown)
    decodeCocktailText(shown)
    expect(shown).toEqual(before)
  })
})
