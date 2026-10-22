import { describe, expect, it } from 'vitest'
import { focusAfterRemove, type LedgerRun } from './Shelf'

// Where the focus goes when Remove takes a row off the ledger (ADR-003
// Consequences; frontend-spec §7). The journeys that drive it are
// e2e/t5s-shelf.spec.ts; this pins the decision alone, group by group.

const rows = (...ids: number[]) => ids.map((id) => ({ id }))

/** The default world's ledger, by ingredient id: Spirits first, the rest by name. */
const LEDGER: LedgerRun[] = [
  { label: 'Spirits', rows: rows(9, 11, 8, 3) },
  { label: 'Beverages', rows: rows(71, 72) },
  { label: 'Bitters', rows: rows(61) },
  { label: 'Fortified wine', rows: rows(31) },
  { label: 'Juices', rows: rows(42, 41) },
  { label: 'Sweeteners', rows: rows(51) },
]

describe('focusAfterRemove', () => {
  it('goes to the next bottle’s Remove in the same group', () => {
    expect(focusAfterRemove(LEDGER, 9)).toEqual({ to: 'remove', id: 11 })
    expect(focusAfterRemove(LEDGER, 11)).toEqual({ to: 'remove', id: 8 })
    expect(focusAfterRemove(LEDGER, 71)).toEqual({ to: 'remove', id: 72 })
  })

  it('goes to the Remove before it when the bottle is its group’s last', () => {
    expect(focusAfterRemove(LEDGER, 3)).toEqual({ to: 'remove', id: 8 })
    expect(focusAfterRemove(LEDGER, 41)).toEqual({ to: 'remove', id: 42 })
  })

  it('never crosses into another group while its own still holds a bottle', () => {
    // Tonic is Beverages' last; Bitters follows, but Club soda is still there.
    expect(focusAfterRemove(LEDGER, 72)).toEqual({ to: 'remove', id: 71 })
  })

  it('goes to the heading of the group now in an emptied group’s place', () => {
    expect(focusAfterRemove(LEDGER, 61)).toEqual({ to: 'group', label: 'Fortified wine' })
    expect(focusAfterRemove(LEDGER, 31)).toEqual({ to: 'group', label: 'Juices' })
  })

  it('goes to the heading of the group before it when the emptied group was the last', () => {
    expect(focusAfterRemove(LEDGER, 51)).toEqual({ to: 'group', label: 'Juices' })
  })

  it('goes to the screen’s heading when the shelf empties', () => {
    expect(focusAfterRemove([{ label: 'Spirits', rows: rows(11) }], 11)).toEqual({ to: 'screen' })
  })

  it('reads a flat ledger as one run, with no heading but the screen’s', () => {
    const flat: LedgerRun[] = [{ rows: rows(3, 9, 11) }]
    expect(focusAfterRemove(flat, 3)).toEqual({ to: 'remove', id: 9 })
    expect(focusAfterRemove(flat, 11)).toEqual({ to: 'remove', id: 9 })
    expect(focusAfterRemove([{ rows: rows(3) }], 3)).toEqual({ to: 'screen' })
  })

  it('moves nothing for a bottle the ledger does not show', () => {
    expect(focusAfterRemove(LEDGER, 999)).toBeNull()
    expect(focusAfterRemove([], 11)).toBeNull()
  })
})
