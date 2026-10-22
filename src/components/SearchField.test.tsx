import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { SearchField } from '@ds/forms/SearchField'

// Every interactive target is at least 44px ("Visual foundations", Spacing &
// layout). The search field's frame is 44px, but the input inside it was the
// frame's content box less its 1px borders, 42px, so the target a tap or click
// lands on was below the floor; and the 44px Clear inside that 42px box pushed
// the frame to 46px the moment a first character was typed. Both now sit over
// the frame's border instead of inside it: the input is a 44px target and the
// frame stays 44px, empty or not.
//
// jsdom lays nothing out, so this pins the declared geometry the component
// ships; e2e/t5d-search-target.spec.ts measures it on every screen that has a
// search field, in a real browser, at both widths.

// No Vitest globals (ADR-011), so Testing Library cannot register its own cleanup.
afterEach(cleanup)

describe('SearchField targets', () => {
  it('gives the input itself the 44px floor, padding inside it, over the frame’s 1px border', () => {
    render(<SearchField label="Add a bottle" placeholder="Search ingredients" value="" onChange={() => {}} />)
    const style = getComputedStyle(screen.getByRole('searchbox', { name: 'Add a bottle' }))
    expect(style.minHeight).toBe('44px')
    expect(style.boxSizing).toBe('border-box')
    expect([style.marginTop, style.marginBottom]).toEqual(['-1px', '-1px'])
  })

  it('sets Clear over the frame’s border the same way, so the frame does not grow when it appears', () => {
    render(<SearchField label="Add a bottle" value="rye" onChange={() => {}} onClear={() => {}} />)
    const style = getComputedStyle(screen.getByRole('button', { name: 'Clear search' }))
    expect([style.width, style.height]).toEqual(['44px', '44px'])
    expect([style.marginTop, style.marginBottom]).toEqual(['-1px', '-1px'])
  })
})
