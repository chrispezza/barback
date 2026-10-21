import { describe, expect, it } from 'vitest'
import assignmentsJson from '../../scripts/family-assignments.json?raw'
import { defaultWorld } from '../../test/fixtures/world'
import { FAMILIES, familyByTag } from './families'

// The family taxonomy (ADR-002; frontend-spec §3). Names, count and canonical
// ratios are Chris's content call (§8), so nothing here pins them; these pin
// the mechanism every family has to satisfy, whatever it is called.

const PREFIX = 'family:'
const suffix = (tag: string) => tag.slice(PREFIX.length)

/** A display string (frontend-spec §3): a numeral or fraction glyph, never a
 *  float — if it parses as a number at all, it is a whole one. */
function expectDisplayValue(value: string) {
  expect(value).toMatch(/^(\d|[¼½¾⅓⅔⅛])/)
  expect(value).not.toMatch(/[.,]/)
  const n = Number(value)
  expect(Number.isNaN(n) || Number.isInteger(n)).toBe(true)
}

describe('FAMILIES tags', () => {
  it('are unique', () => {
    const tags = FAMILIES.map((f) => f.tag)
    expect(new Set(tags).size).toBe(tags.length)
  })

  it('carry the reserved family: prefix and a suffix that can sit in ?family=', () => {
    // §6: the selection lives in the URL as ?family=<suffix> (FamilyPicker).
    for (const f of FAMILIES) {
      expect(f.tag.startsWith(PREFIX), f.tag).toBe(true)
      expect(suffix(f.tag)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    }
  })

  it('are the tags the tag script creates upstream', () => {
    // scripts/tag_families.py creates one tag per key of family-assignments.json
    // once it has popped "_comment" (tag_families.py:67), and nothing else;
    // §3: FamilyDef.tag "must match the API tag exactly".
    const assignments = JSON.parse(assignmentsJson) as Record<string, unknown>
    delete assignments['_comment']
    expect(Object.keys(assignments).sort()).toEqual(FAMILIES.map((f) => f.tag).sort())
  })

  it('are the family tags the fixture world serves', () => {
    const served = defaultWorld()
      .tags.map((t) => t.name)
      .filter((n) => n.startsWith(PREFIX))
    expect(served.sort()).toEqual(FAMILIES.map((f) => f.tag).sort())
  })
})

describe('FAMILIES order', () => {
  it('is unique', () => {
    const order = FAMILIES.map((f) => f.order)
    expect(new Set(order).size).toBe(order.length)
  })

  it('matches array order, which is the order the family bar renders', () => {
    const byOrder = [...FAMILIES].sort((a, b) => a.order - b.order)
    expect(byOrder.map((f) => f.tag)).toEqual(FAMILIES.map((f) => f.tag))
  })
})

describe('FAMILIES canonical ratios', () => {
  it('have 2 to 4 parts', () => {
    for (const f of FAMILIES) {
      expect(f.canonicalRatio.length, f.tag).toBeGreaterThanOrEqual(2)
      expect(f.canonicalRatio.length, f.tag).toBeLessThanOrEqual(4)
    }
  })

  it('write every part as a display string with a label, never a decimal', () => {
    for (const f of FAMILIES) {
      for (const p of f.canonicalRatio) {
        expectDisplayValue(p.value)
        expect(p.label.trim(), f.tag).not.toBe('')
      }
    }
  })
})

describe('FAMILIES copy', () => {
  it('names each family in the caps utility voice, uniquely, never as the All segment', () => {
    // FamilyPicker maps a selected segment back to its family by displayName,
    // and reserves "ALL" for the unfiltered segment.
    const names = FAMILIES.map((f) => f.displayName)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) {
      expect(name.trim()).not.toBe('')
      expect(name).toBe(name.toUpperCase())
      expect(name).not.toBe('ALL')
    }
  })

  it('gives each family a lowercase plural for scoped copy', () => {
    for (const f of FAMILIES) {
      expect(f.plural.trim(), f.tag).not.toBe('')
      expect(f.plural).toBe(f.plural.toLowerCase())
    }
  })

  it('gives each family a one-line blurb in the house voice', () => {
    // Content fundamentals: one-line asides; no exclamation marks, no emoji,
    // never "we" or "let's".
    for (const f of FAMILIES) {
      expect(f.blurb.trim(), f.tag).not.toBe('')
      expect(f.blurb).not.toMatch(/[\r\n]/)
      expect(f.blurb).not.toContain('!')
      expect(f.blurb).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(f.blurb).not.toMatch(/\b(we|let['’]s)\b/i)
    }
  })
})

describe('familyByTag', () => {
  it('finds each family by its exact tag', () => {
    for (const f of FAMILIES) expect(familyByTag(f.tag)).toBe(f)
  })

  it('answers undefined for no tag, a user tag, or a family name without the prefix', () => {
    expect(familyByTag(null)).toBeUndefined()
    expect(familyByTag('Classic')).toBeUndefined()
    for (const f of FAMILIES) {
      expect(familyByTag(suffix(f.tag))).toBeUndefined()
      expect(familyByTag(f.tag.toUpperCase())).toBeUndefined()
    }
  })
})
