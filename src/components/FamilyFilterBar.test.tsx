import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { useState } from 'preact/hooks'
import { FamilyFilterBar } from '@ds/navigation/FamilyFilterBar'

// The DS family bar as a keyboard user meets it (frontend-spec §7, FamilyBar:
// "segmented, single-select, caps utility voice; arrow-key navigation";
// chrispezza/barback#138). A roving tabindex: the bar is one Tab stop, at the
// pressed segment or else the first; ArrowLeft and ArrowRight move the focus
// along it, wrapping at either end, Home and End jump to the ends, and none of
// them selects: Enter or Space on the focused segment does, as a click does,
// since every selection navigates to a new family URL. The buttons keep
// role="group" and aria-pressed, which the journeys query by.
//
// jsdom has no keyboard activation for buttons, so Enter and Space are driven
// in a real browser in e2e/t5d-family-keys.spec.ts; this pins the focus rules.

// No Vitest globals (ADR-011), so Testing Library cannot register its own cleanup.
afterEach(cleanup)

const FAMILIES = ['ALL', 'SOUR', 'SPIRIT-FORWARD', 'HIGHBALL', 'TIKI', 'DESSERT']

interface BarProps {
  value?: string
  disabled?: string[]
  onChange?: (family: string) => void
}

/** The bar as FamilyPicker holds it: the value follows each selection. */
function Bar({ value: initial, disabled, onChange }: BarProps) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <FamilyFilterBar
        families={FAMILIES}
        value={value}
        disabled={disabled}
        onChange={(family) => {
          setValue(family)
          onChange?.(family)
        }}
      />
      <button type="button">After the bar</button>
    </>
  )
}

const segment = (name: string) => screen.getByRole('button', { name, exact: true })
/** The segments Tab stops on: those with tabIndex 0. */
const tabStops = () =>
  Array.from(screen.getByRole('group', { name: 'Drink family' }).querySelectorAll('button'))
    .filter((b) => b.tabIndex === 0)
    .map((b) => b.textContent)
const focused = () => document.activeElement?.textContent
/** Focus a button as a click or Tab would, and let the bar render what follows. */
const focusOn = (name: string) => act(() => segment(name).focus())
const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init })

describe('FamilyFilterBar as one Tab stop', () => {
  it('stops at the pressed segment and no other', () => {
    render(<Bar value="HIGHBALL" />)
    expect(tabStops()).toEqual(['HIGHBALL'])
  })

  it('stops at the first segment when none is pressed', () => {
    render(<Bar />)
    expect(tabStops()).toEqual(['ALL'])
  })

  it('stops at the first segment when the value names none of them', () => {
    render(<Bar value="FLIP" />)
    expect(tabStops()).toEqual(['ALL'])
  })

  it('stops at the first segment that can take focus, past a disabled one', () => {
    render(<Bar disabled={['ALL']} />)
    expect(tabStops()).toEqual(['SOUR'])
  })

  it('moves the stop with the focus while it is in the bar, and back to the pressed segment once it leaves', () => {
    render(<Bar value="HIGHBALL" />)
    focusOn('HIGHBALL')
    press('ArrowRight')
    expect(focused()).toBe('TIKI')
    expect(tabStops()).toEqual(['TIKI'])

    focusOn('After the bar')
    expect(tabStops()).toEqual(['HIGHBALL'])
  })

  it('follows the selection', () => {
    render(<Bar value="HIGHBALL" />)
    fireEvent.click(segment('SOUR'))
    expect(segment('SOUR').getAttribute('aria-pressed')).toBe('true')
    expect(tabStops()).toEqual(['SOUR'])
  })
})

describe('FamilyFilterBar arrow keys', () => {
  it('move the focus one segment right and left, and select nothing', () => {
    const chosen: string[] = []
    render(<Bar value="HIGHBALL" onChange={(f) => chosen.push(f)} />)
    focusOn('HIGHBALL')

    press('ArrowRight')
    expect(focused()).toBe('TIKI')
    press('ArrowLeft')
    press('ArrowLeft')
    expect(focused()).toBe('SPIRIT-FORWARD')

    expect(chosen).toEqual([])
    expect(segment('HIGHBALL').getAttribute('aria-pressed')).toBe('true')
    expect(segment('SPIRIT-FORWARD').getAttribute('aria-pressed')).toBe('false')
  })

  it('wrap from the last segment to the first and back', () => {
    render(<Bar value="DESSERT" />)
    focusOn('DESSERT')
    press('ArrowRight')
    expect(focused()).toBe('ALL')
    press('ArrowLeft')
    expect(focused()).toBe('DESSERT')
  })

  it('Home and End jump to the first and last segment', () => {
    render(<Bar value="HIGHBALL" />)
    focusOn('HIGHBALL')
    press('End')
    expect(focused()).toBe('DESSERT')
    press('Home')
    expect(focused()).toBe('ALL')
  })

  it('pass over a disabled segment, which cannot take focus', () => {
    render(<Bar value="HIGHBALL" disabled={['TIKI', 'ALL']} />)
    focusOn('HIGHBALL')
    press('ArrowRight')
    expect(focused()).toBe('DESSERT')
    press('ArrowRight')
    expect(focused()).toBe('SOUR')
    press('Home')
    expect(focused()).toBe('SOUR')
  })

  it('keep the keys they handle from scrolling the page or the bar’s wrapper', () => {
    render(<Bar value="HIGHBALL" />)
    focusOn('HIGHBALL')
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      // fireEvent returns false when the handler called preventDefault.
      expect(press(key), key).toBe(false)
    }
  })

  it('leave other keys, and arrows with a modifier, to the browser', () => {
    render(<Bar value="HIGHBALL" />)
    focusOn('HIGHBALL')
    expect(press('ArrowDown')).toBe(true)
    expect(press('ArrowRight', { altKey: true })).toBe(true)
    expect(press('ArrowLeft', { metaKey: true })).toBe(true)
    expect(focused()).toBe('HIGHBALL')
  })
})
