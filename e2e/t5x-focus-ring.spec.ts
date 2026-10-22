import type { Locator, Page } from '@playwright/test'
import { expect, test } from './support/test'

// "Focus. focus-visible only: 2px solid brass, 2px offset (inset −2px inside
// segmented controls). It is never removed and never restyled per component."
// (The Back Bar, Visual foundations.) The app moves focus itself in places —
// a section heading after a Retry (ErrorLine, chrispezza/barback#71), a group
// heading after a Remove — and each such target was given the ring by its own
// rule, so a target without one wore the browser's default ring instead.
// Measured here on targets with no rule of their own: the Index's heading
// after a keyboard Retry, and the Recipe's screen after one.

const BRASS = 'rgb(198, 161, 91)'

async function ringOf(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return null
    const s = getComputedStyle(el)
    return { tag: el.tagName, style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, offset: s.outlineOffset }
  })
}

async function keyboardRetry(page: Page, retry: Locator) {
  await retry.focus()
  await page.keyboard.press('Enter')
}

test('the Index heading that takes focus after a keyboard Retry wears the brass ring', async ({ page, bar }) => {
  bar.fail(/^\/cocktails$/, { method: 'GET', status: 500, times: 1000 })
  await page.goto('/drinks')
  const retry = page.getByRole('button', { name: /^Retry/ })
  await expect(retry).toBeVisible()
  bar.clearFailures()
  await keyboardRetry(page, retry)
  await expect(page.getByRole('link', { name: /Daiquiri/ })).toBeVisible()
  await expect.poll(() => ringOf(page)).toMatchObject({ style: 'solid', width: '2px', color: BRASS, offset: '2px' })
})

test('the Recipe screen that takes focus after a keyboard Retry wears the brass ring', async ({ page, bar }) => {
  bar.fail(/^\/cocktails\/daiquiri-1$/, { method: 'GET', status: 500, times: 2 })
  await page.goto('/drinks/daiquiri-1')
  const retry = page.getByRole('button', { name: /^Retry/ })
  await expect(retry).toBeVisible()
  await keyboardRetry(page, retry)
  await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toBeVisible()
  const ring = await ringOf(page)
  expect(ring, 'focus never drops to the body').not.toBeNull()
  if (ring && ring.style !== 'none') {
    expect(ring).toMatchObject({ style: 'solid', width: '2px', color: BRASS, offset: '2px' })
  }
})
