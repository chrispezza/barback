import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { ErrorLine } from './ErrorLine'

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
