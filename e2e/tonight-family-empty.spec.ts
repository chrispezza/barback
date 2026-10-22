import type { Page } from '@playwright/test'
import { I, T, bareWorld, defaultWorld } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// What Tonight's pour section says when nothing pours (frontend-spec §5
// "Empty states are directive": "Tonight with an empty shelf says what to
// add"; §6 Journeys 2, "Family-aware empty states"). Whether the shelf is bare
// is a fact about the shelf (GET /ingredients?filter[on_shelf]=true), never
// about the counts under a family: Tonight's axis is stock state and the
// family only refines it (§6 "One primary axis per screen"). A stocked shelf
// with nothing in the active family within reach is told what to do about the
// family, not to stock the shelf.
//
// In the default world no tiki or dessert drink pours or is one bottle away;
// the shelf holds eleven bottles. The family's empty state says what to do
// from the family's own gap data (§6 Journey 2; chrispezza/barback#74, and
// e2e/b-family-empty.spec.ts): the tiki family holds no drinks, so it points
// at another family; the one dessert drink, the Espresso Martini, waits on
// three bottles, which it names.

const pour = (page: Page) => page.locator('#pour')
const near = (page: Page) => page.locator('#near')

/** The pour section's empty-state heading (EmptyState renders an h3, as the
 *  drink cards do). */
const emptyTitle = (page: Page) => pour(page).locator('.bb-empty').getByRole('heading', { level: 3 })

for (const { suffix, plural, segment, tagId, body } of [
  {
    suffix: 'tiki',
    plural: 'tiki drinks',
    segment: 'TIKI',
    tagId: T.tiki,
    body: 'The index holds no tiki drinks yet — pick another family.',
  },
  {
    suffix: 'dessert',
    plural: 'dessert drinks',
    segment: 'DESSERT',
    tagId: T.dessert,
    body: 'Add Vodka, Coffee liqueur and Espresso and one dessert drink opens up.',
  },
]) {
  test.describe(`a stocked shelf under ?family=${suffix}, with nothing in it within reach`, () => {
    test('names the family and points at it, never calling the shelf bare', async ({ page }) => {
      await page.goto(`/tonight?family=${suffix}`)
      // The scoped counts have landed: both sections read zero for the family.
      await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText(`${plural} you can pour · 0`)
      await expect(near(page).getByRole('heading', { level: 2 })).toHaveText(`${plural} one bottle away · 0`)
      // The whole-bar status line stays whole-bar: the shelf pours plenty.
      await expect(page.locator('.bar-status')).toHaveText('You can pour 5 · 7 one bottle away · 0 to buy')

      await expect(emptyTitle(page)).toHaveText(`No ${plural} pour yet`)
      await expect(pour(page).locator('.bb-empty__body')).toHaveText(body)
      await expect(page.getByRole('heading', { name: 'The shelf is bare' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Stock the shelf' })).toHaveCount(0)
      // Nor the line that points at near misses, when there are none below it.
      await expect(page.getByText('the bottles below are one purchase away')).toHaveCount(0)
    })

    test('Browse leads to the Index under the same family', async ({ page, bar }) => {
      await page.goto(`/tonight?family=${suffix}`)
      await pour(page).getByRole('button', { name: `Browse ${plural}` }).click()
      await expect(page).toHaveURL(new RegExp(`/drinks\\?family=${suffix}$`))
      await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
      // The Index applied the family, not just the URL (§6: the family persists
      // across Tonight and Index; ADR-002: one tag-filtered read).
      await expect(
        page.getByRole('group', { name: 'Drink family' }).getByRole('button', { name: segment, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
      await expect
        .poll(() => bar.calls('GET', /^\/cocktails$/).filter((c) => c.query.get('filter[tag_id]') === String(tagId)).length)
        .toBeGreaterThan(0)
    })

    test('Show all families clears the family and Tonight pours again', async ({ page }) => {
      await page.goto(`/tonight?family=${suffix}`)
      await pour(page).getByRole('button', { name: 'Show all families' }).click()
      await expect(page).toHaveURL(/\/tonight$/)
      await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText('You can pour · 5')
      await expect(pour(page).locator('.bb-empty')).toHaveCount(0)
    })
  })
}

test.describe('switching family while the new counts are on their way', () => {
  // The cocktail reads keep the previous family's answer on screen until the
  // new one lands (TanStack placeholderData). That answer is about the old
  // family: no empty state may be decided from it under the new name.
  test('never says the new family is out of reach before its counts land', async ({ page, bar }) => {
    await page.goto('/tonight?family=tiki')
    await expect(emptyTitle(page)).toHaveText('No tiki drinks pour yet')

    bar.slowDown(1500)
    // Watch the whole window, not one instant: from the click on SOUR until
    // the sour count lands, record every empty state the pour section shows.
    // Armed by the click itself (capture phase), so the tiki state that is
    // rightly on screen before it is not recorded.
    await page.evaluate(() => {
      const w = window as unknown as { __pourEmpties: string[] }
      w.__pourEmpties = []
      const section = document.getElementById('pour')!
      let armed = false
      let done = false
      const button = [...document.querySelectorAll<HTMLButtonElement>('.bb-fam__btn')].find(
        (b) => b.textContent === 'SOUR',
      )!
      button.addEventListener('click', () => (armed = true), { capture: true, once: true })
      new MutationObserver(() => {
        if (!armed || done) return
        for (const e of section.querySelectorAll<HTMLElement>('.bb-empty')) w.__pourEmpties.push(e.innerText)
        if (/^sours you can pour · [1-9]/i.test(section.querySelector('h2')?.textContent ?? '')) done = true
      }).observe(section, { childList: true, subtree: true, characterData: true })
    })
    await page.getByRole('group', { name: 'Drink family' }).getByRole('button', { name: 'SOUR', exact: true }).click()
    await expect(page).toHaveURL(/\/tonight\?family=sour$/)
    // The sour reads have been asked for and not yet answered.
    await expect
      .poll(() => bar.calls('GET', /^\/cocktails$/).filter((c) => c.query.get('filter[tag_id]') === String(T.sour)).length)
      .toBeGreaterThan(0)
    expect(await pour(page).locator('.bb-empty').allInnerTexts()).toEqual([])

    await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText(/^sours you can pour · [1-9]/)
    await expect(pour(page).locator('.bb-empty')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __pourEmpties: string[] }).__pourEmpties)).toEqual([])
  })
})

test.describe('a stocked shelf from which nothing pours and nothing is one bottle away', () => {
  // Mint alone: every drink that calls for it is three or more bottles away.
  test.use({ world: { ...defaultWorld(), shelf: [I.mint] } })

  test('says nothing pours yet, not that the shelf is bare', async ({ page }) => {
    await page.goto('/tonight')
    await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText('You can pour · 0')
    await expect(near(page).getByRole('heading', { level: 2 })).toHaveText('One bottle away · 0')
    await expect(emptyTitle(page)).toHaveText('Nothing pours yet')
    await expect(page.getByRole('heading', { name: 'The shelf is bare' })).toHaveCount(0)
    await expect(page.getByText('the bottles below are one purchase away')).toHaveCount(0)
    // Still directive: the way to the shelf is offered.
    await expect(pour(page).getByRole('button', { name: 'Stock the shelf' })).toBeVisible()
  })

  test('with no restock ranking to name, does not presume the shelf is empty', async ({ page, bar }) => {
    // The ranking fails (first try and its one retry), so no bottle can be named.
    bar.fail(/^\/users\/1\/ingredients\/recommend$/, { method: 'GET', status: 500, times: 2 })
    await page.goto('/tonight')
    await expect(emptyTitle(page)).toHaveText('Nothing pours yet')
    await expect(pour(page).locator('.bb-empty__body')).toHaveText(
      'Nothing is one bottle away either — add to the shelf and the first drinks open up.',
    )
    await expect(page.getByText('Add a spirit, a citrus and a sweetener')).toHaveCount(0)
  })
})

test.describe('a stocked shelf from which nothing pours but some drinks are one bottle away', () => {
  // Gin alone: the Gin Tonic and the Martini are each one bottle away.
  test.use({ world: { ...defaultWorld(), shelf: [I.gin] } })

  test('points at the near misses below', async ({ page }) => {
    await page.goto('/tonight')
    await expect(near(page).getByRole('heading', { level: 2 })).toHaveText('One bottle away · 2')
    await expect(pour(page).locator('.bb-empty__body')).toHaveText(
      'Nothing pours yet — the bottles below are one purchase away.',
    )
    await expect(page.getByRole('heading', { name: 'The shelf is bare' })).toHaveCount(0)
  })
})

test.describe('the shelf cannot be read', () => {
  // GET /ingredients?filter[on_shelf]=true fails twice: the first try and its
  // one retry (src/app.tsx, retry: 1); the bar answers from the third. The
  // shelf decides one thing here, whether it is bare. What pours and what is
  // one bottle away still answer, so the pour section still says what those
  // counts support, and says in the error voice that the shelf read failed
  // (frontend-spec §5 "Empty states are directive"; the section rule beside
  // barsFailed in src/screens/Tonight.tsx, chrispezza/barback#63).
  const failShelf = (bar: FakeBar) => bar.fail(/^\/ingredients$/, { method: 'GET', status: 500, times: 2 })

  const expectShelfErrorLine = async (page: Page) => {
    const alert = pour(page).getByRole('alert')
    await expect(alert).toHaveCount(1)
    await expect(alert).toContainText('The bar didn’t answer — try again.')
    await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
  }

  test.describe('with gin alone on the shelf', () => {
    // The Gin Tonic and the Martini are each one bottle away; nothing pours.
    test.use({ world: { ...defaultWorld(), shelf: [I.gin] } })

    test('still points at the near misses, and Retry reads the shelf again', async ({ page, bar }) => {
      failShelf(bar)
      await page.goto('/tonight')
      await expect(near(page).getByRole('heading', { level: 2 })).toHaveText('One bottle away · 2')
      await expect(pour(page).locator('.bb-empty__body')).toHaveText(
        'Nothing pours yet — the bottles below are one purchase away.',
      )
      await expectShelfErrorLine(page)
      await expect(page.getByRole('heading', { name: 'The shelf is bare' })).toHaveCount(0)

      await pour(page).getByRole('button', { name: 'Retry' }).click()
      await expect(pour(page).getByRole('alert')).toHaveCount(0)
      await expect(pour(page).locator('.bb-empty__body')).toHaveText(
        'Nothing pours yet — the bottles below are one purchase away.',
      )
      await expect(page.getByRole('heading', { name: 'The shelf is bare' })).toHaveCount(0)
    })
  })

  test('under ?family=tiki still names the family, never calling the shelf bare', async ({ page, bar }) => {
    failShelf(bar)
    await page.goto('/tonight?family=tiki')
    await expect(near(page).getByRole('heading', { level: 2 })).toHaveText('tiki drinks one bottle away · 0')
    await expect(emptyTitle(page)).toHaveText('No tiki drinks pour yet')
    await expectShelfErrorLine(page)
    await expect(page.getByRole('heading', { name: 'The shelf is bare' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Stock the shelf' })).toHaveCount(0)
  })
})

test.describe('a stocked shelf under a family from which nothing pours but one is one bottle away', () => {
  // Gin alone, under ?family=highball: the Gin Tonic is one bottle away (the
  // tonic); no highball pours.
  test.use({ world: { ...defaultWorld(), shelf: [I.gin] } })

  test('points at the near miss below, not at the family', async ({ page }) => {
    await page.goto('/tonight?family=highball')
    await expect(pour(page).getByRole('heading', { level: 2 })).toHaveText('highballs you can pour · 0')
    await expect(near(page).getByRole('heading', { level: 2 })).toHaveText('highballs one bottle away · 1')
    await expect(pour(page).locator('.bb-empty__body')).toHaveText(
      'Nothing pours yet — the bottles below are one purchase away.',
    )
    await expect(emptyTitle(page)).toHaveCount(0)
    await expect(page.getByText('No highballs pour yet')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'The shelf is bare' })).toHaveCount(0)
  })
})

test.describe('a bare shelf', () => {
  test.use({ world: bareWorld() })

  for (const path of ['/tonight', '/tonight?family=tiki']) {
    test(`says the shelf is bare at ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(emptyTitle(page)).toHaveText('The shelf is bare')
      await expect(pour(page).getByRole('button', { name: 'Stock the shelf' })).toBeVisible()
      await expect(pour(page).locator('.bb-empty')).toHaveCount(1)
    })
  }

  test('with no restock ranking to name, names the first bottles to add', async ({ page, bar }) => {
    bar.fail(/^\/users\/1\/ingredients\/recommend$/, { method: 'GET', status: 500, times: 2 })
    await page.goto('/tonight')
    await expect(emptyTitle(page)).toHaveText('The shelf is bare')
    await expect(pour(page).locator('.bb-empty__body')).toHaveText(
      'Add a spirit, a citrus and a sweetener and the first drinks open up.',
    )
  })
})
