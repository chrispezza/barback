import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/preact'
import { ShoppingListItem } from '@ds/shopping/ShoppingListItem'

// The DS list row's one secondary line: "Unlocks N", an aria-hidden "·", then
// the detail. Assistive tech hears the row's button by its name, built from
// that line's text with the "·" left out, so the count and the detail need
// whitespace between them inside the component, or "Unlocks 2" and "Staple"
// are announced "Unlocks 2Staple" (chrispezza/barback#91; Barback's
// ShoppingRow opens its detail with a hair space to get round it). On screen
// the line is unchanged: e2e/t5d-list-separator.spec.ts measures it.

// No Vitest globals (ADR-011), so Testing Library cannot register its own cleanup.
afterEach(cleanup)

const meta = (container: Element) => container.querySelector('.bb-shop__meta')

describe('ShoppingListItem name', () => {
  it('parts the count from the detail', () => {
    render(<ShoppingListItem name="Club soda" unlocks={2} detail="Staple" />)
    expect(screen.getByRole('button', { name: 'Club soda Unlocks 2 Staple', exact: true })).toBeTruthy()
  })

  it('parts them when the detail opens on a number', () => {
    render(<ShoppingListItem name="Campari" unlocks={1} detail="1 spirit-forward drink" />)
    expect(screen.getByRole('button', { name: 'Campari Unlocks 1 1 spirit-forward drink', exact: true })).toBeTruthy()
  })

  it('reads the same when the detail already opens with a space of its own', () => {
    // As ShoppingRow writes it today: a hair space (U+200A) before the detail.
    render(<ShoppingListItem name="Campari" unlocks={1} detail={' 1 spirit-forward drink'} />)
    expect(screen.getByRole('button', { name: 'Campari Unlocks 1 1 spirit-forward drink', exact: true })).toBeTruthy()
  })

  it('states a count alone, or a detail alone, as before', () => {
    const { container, unmount } = render(<ShoppingListItem name="Cointreau" unlocks={1} />)
    expect(screen.getByRole('button', { name: 'Cointreau Unlocks 1', exact: true })).toBeTruthy()
    expect(meta(container)?.textContent).toBe('Unlocks 1')
    unmount()

    const detailOnly = render(<ShoppingListItem name="Laphroaig 10" detail="In 1 drink as Islay Scotch" />)
    expect(screen.getByRole('button', { name: 'Laphroaig 10 In 1 drink as Islay Scotch', exact: true })).toBeTruthy()
    expect(meta(detailOnly.container)?.textContent).toBe('In 1 drink as Islay Scotch')
  })

  it('keeps the "·" itself from assistive tech, as a mark on screen only', () => {
    const { container } = render(<ShoppingListItem name="Club soda" unlocks={2} detail="Staple" />)
    const separator = container.querySelector('.bb-shop__sep')
    expect(separator?.textContent).toBe('·')
    expect(separator?.getAttribute('aria-hidden')).toBe('true')
  })
})
