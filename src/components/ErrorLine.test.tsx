import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { ErrorLine } from './ErrorLine'

// No Vitest globals (ADR-011), so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup()
})

// Harness smoke test (ADR-011): a src/ component composed from a vendored DS
// component (@ds alias, .jsx delivery, react → preact/compat) renders in jsdom.
describe('ErrorLine', () => {
  it('speaks in the quiet failure voice and is announced', () => {
    render(<ErrorLine />)
    expect(screen.getByRole('alert').textContent).toContain('The bar didn’t answer — try again.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers a retry that calls back', () => {
    const onRetry = vi.fn()
    render(<ErrorLine onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

// One failure is announced once (WCAG 4.1.3; chrispezza/barback#71): a line
// standing for a failure another line already announces says the same words
// without a second alert.
describe('ErrorLine, beside the line that announces the failure', () => {
  it('says the same words, with no alert role', () => {
    const { container } = render(<ErrorLine announce={false} onRetry={() => {}} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(container.textContent).toContain('The bar didn’t answer — try again.')
  })
})

// Several Retry buttons on one screen are told apart by what they ask again;
// the visible label stays the one word (Iconography: affordances are words;
// WCAG 2.5.3 Label in Name: the name starts with it).
describe('ErrorLine, named for what its Retry asks again', () => {
  it('names the button "Retry …" and shows the one word', () => {
    render(<ErrorLine onRetry={() => {}} retries="the drinks you can pour" />)
    const button = screen.getByRole('button', { name: 'Retry the drinks you can pour' })
    expect(button.textContent).toBe('Retry')
  })
})

/** A section with a heading and, while `failed`, an error line under it. */
function Section({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return (
    <main>
      <h1>Screen</h1>
      <section>
        <h2>First</h2>
      </section>
      <section>
        <h2>Second</h2>
        <p>Something else.</p>
        {failed && <ErrorLine onRetry={onRetry} />}
      </section>
    </main>
  )
}

// ADR-003 Consequences: focus is handled deliberately. A Retry that answers
// takes its line, and the focused button, away; focus goes to the heading of
// the part of the screen the line was in, never to <body>.
describe('ErrorLine, going away while it holds focus', () => {
  it('hands focus to the heading of its own section', () => {
    const { rerender } = render(<Section failed onRetry={() => {}} />)
    screen.getByRole('button', { name: 'Retry' }).focus()
    rerender(<Section failed={false} onRetry={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Second' }))
  })

  it('makes that heading focusable for as long as it holds focus, and no longer', () => {
    const { rerender } = render(<Section failed onRetry={() => {}} />)
    const heading = screen.getByRole('heading', { name: 'Second' })
    expect(heading.hasAttribute('tabindex')).toBe(false)
    screen.getByRole('button', { name: 'Retry' }).focus()
    rerender(<Section failed={false} onRetry={() => {}} />)
    expect(heading.getAttribute('tabindex')).toBe('-1')
    heading.blur()
    expect(heading.hasAttribute('tabindex')).toBe(false)
  })

  it('leaves focus alone when it did not hold it', () => {
    const { rerender } = render(
      <>
        <button type="button">Elsewhere</button>
        <Section failed onRetry={() => {}} />
      </>,
    )
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' })
    elsewhere.focus()
    rerender(
      <>
        <button type="button">Elsewhere</button>
        <Section failed={false} onRetry={() => {}} />
      </>,
    )
    expect(document.activeElement).toBe(elsewhere)
  })

  it('keeps focus in the screen when no heading stands above it', () => {
    const Bare = ({ failed }: { failed: boolean }) => (
      <main>
        <p>
          <button type="button">Back</button>
        </p>
        {failed && <ErrorLine onRetry={() => {}} />}
      </main>
    )
    const { rerender } = render(<Bare failed />)
    screen.getByRole('button', { name: 'Retry' }).focus()
    rerender(<Bare failed={false} />)
    expect(document.activeElement).toBe(screen.getByRole('main'))
  })
})
