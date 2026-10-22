import type { Page } from '@playwright/test'
import { T } from '../test/fixtures/world'
import { expect, test } from './support/test'

// A family switch on Tonight while the new family's reads are on their way
// (chrispezza/barback#73). The cocktail reads keep the previous family's
// answer in hand as a placeholder (TanStack keepPreviousData, src/api/queries.ts)
// until the new one lands. That answer is about the previous family: under the
// new family's name, its cards and counts state something false (frontend-spec
// §6: the family refines Tonight's stock axis, so a count under a family's
// name is a claim about that family; ADR-007 Consequences: "No stock answer is
// ever served stale"). Each section shows its header with no count and no
// cards, as on a first load, until its own read lands.
//
// The empty states across the same window are pinned in
// e2e/tonight-family-empty.spec.ts; the offline switch in
// e2e/b-warm-offline.spec.ts.

const pour = (page: Page) => page.locator('#pour')
const near = (page: Page) => page.locator('#near')
const heading = (section: ReturnType<typeof pour>) => section.getByRole('heading', { level: 2 })
const cards = (section: ReturnType<typeof pour>) => section.locator('.card-list > li')

/** What one section showed at one change: heading as the DOM holds it, and card names. */
interface SectionFrame {
  heading: string
  cards: string[]
}

test.describe('switching family on Tonight while the new reads are on their way', () => {
  test('neither section shows the previous family’s cards or counts under the new name', async ({ page, bar }) => {
    await page.goto('/tonight')
    await expect(heading(pour(page))).toHaveText('You can pour · 5')
    await expect(heading(near(page))).toHaveText('One bottle away · 7')
    await expect(cards(pour(page))).toHaveCount(5)

    bar.slowDown(1500)
    // Watch the whole window, not one instant: from the click on SOUR on,
    // record what each section shows at every change. Armed by the click
    // itself (capture phase), so the unscoped state rightly on screen before
    // it is not recorded.
    await page.evaluate(() => {
      const w = window as unknown as { __frames: { pour: unknown[]; near: unknown[] } }
      w.__frames = { pour: [], near: [] }
      const frame = (s: HTMLElement) => ({
        heading: s.querySelector('h2')?.textContent ?? '',
        cards: [...s.querySelectorAll('.card-list > li .bb-drink__name')].map((n) => n.textContent ?? ''),
      })
      let armed = false
      const button = [...document.querySelectorAll<HTMLButtonElement>('.bb-fam__btn')].find(
        (b) => b.textContent === 'SOUR',
      )!
      button.addEventListener('click', () => (armed = true), { capture: true, once: true })
      for (const id of ['pour', 'near'] as const) {
        const section = document.getElementById(id)!
        new MutationObserver(() => {
          if (armed) w.__frames[id].push(frame(section))
        }).observe(section, { childList: true, subtree: true, characterData: true })
      }
    })
    await page.getByRole('group', { name: 'Drink family' }).getByRole('button', { name: 'SOUR', exact: true }).click()
    await expect(page).toHaveURL(/\/tonight\?family=sour$/)
    // The sour reads have been asked for and not yet answered: each section
    // names the family and states nothing about it yet.
    await expect
      .poll(() => bar.calls('GET', /^\/cocktails$/).filter((c) => c.query.get('filter[tag_id]') === String(T.sour)).length)
      .toBeGreaterThan(0)
    expect(await heading(pour(page)).textContent()).toBe('sours you can pour')
    expect(await heading(near(page)).textContent()).toBe('sours one bottle away')
    expect(await cards(pour(page)).count()).toBe(0)
    expect(await cards(near(page)).count()).toBe(0)

    // The sour answers land.
    await expect(heading(pour(page))).toHaveText(/^sours you can pour · [1-9]\d*$/)
    await expect(heading(near(page))).toHaveText(/^sours one bottle away · \d+$/)
    await expect(cards(pour(page)).first()).toBeVisible()
    const landed = await page.evaluate(() => {
      const frame = (s: HTMLElement) => ({
        heading: s.querySelector('h2')?.textContent ?? '',
        cards: [...s.querySelectorAll('.card-list > li .bb-drink__name')].map((n) => n.textContent ?? ''),
      })
      return { pour: frame(document.getElementById('pour')!), near: frame(document.getElementById('near')!) }
    })

    // At every change in between, a section either named the family with no
    // count and no cards, or showed the sour answer that landed: never the
    // unscoped cards or counts under the sour name.
    const frames = await page.evaluate(
      () => (window as unknown as { __frames: { pour: SectionFrame[]; near: SectionFrame[] } }).__frames,
    )
    expect(frames.pour.length).toBeGreaterThan(0)
    const blank = (h: string): SectionFrame => ({ heading: h, cards: [] })
    for (const f of frames.pour) expect([blank('sours you can pour'), landed.pour]).toContainEqual(f)
    for (const f of frames.near) expect([blank('sours one bottle away'), landed.near]).toContainEqual(f)
  })
})
