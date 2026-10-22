import type { Locator, Page } from '@playwright/test'
import { bareWorld, I } from '../test/fixtures/world'
import { expect, test } from './support/test'

// A shelf of one bottle. "The Back Bar Design System/readme.md", Content
// fundamentals: "Numbers are stated flatly. '14 drinks'": a count and its noun,
// so a count of one takes the singular, as "1 is one bottle away." does on the
// Index and "opens 1 drink tonight" does on Tonight. Two lines count the
// shelf: the Shelf's count line (frontend-spec §9 Shelf ledger), on both
// projects, and the desktop rail's standing line, which a shelf write refreshes
// (§4). Both used to say "1 bottles".
//
// White rum alone pours nothing in this world: every drink that calls for it
// also calls for a citrus and a sweetener.

/** The Shelf's count line, singular or plural, so a wrong noun still shows. */
function countLine(page: Page): Locator {
  return page.getByRole('main').getByText(/ bottles? on the shelf\.$/)
}

/** The rail's standing line ("11 bottles · 5 pourable"); desktop only. */
function standing(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Main' }).getByText(/ bottles? · \d+ pourable$/)
}

function picker(page: Page): Locator {
  return page.getByRole('searchbox', { name: 'Add a bottle' })
}

function chip(page: Page, name: string): Locator {
  return page.getByRole('main').getByRole('button', { name, exact: true })
}

/** A tap on the phone project (touch, no hover), a click on desktop. */
async function press(target: Locator, hasTouch: boolean): Promise<void> {
  if (hasTouch) await target.tap()
  else await target.click()
}

test.describe('a shelf of one bottle', () => {
  test.use({ world: { ...bareWorld(), shelf: [I.whiteRum] } })

  test('the Shelf counts it in the singular', async ({ page }) => {
    await page.goto('/shelf')
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(['Spirits · 1'])
    await expect(countLine(page)).toHaveText('1 bottle on the shelf.')
  })

  test('a second bottle makes it plural, and taking it off makes it singular again', async ({
    page,
    hasTouch,
  }) => {
    await page.goto('/shelf')
    await expect(countLine(page)).toHaveText('1 bottle on the shelf.')

    await picker(page).fill('gin')
    await press(chip(page, 'Gin'), hasTouch)
    await expect(countLine(page)).toHaveText('2 bottles on the shelf.')

    await press(page.getByRole('button', { name: 'Remove Gin from the shelf' }), hasTouch)
    await expect(countLine(page)).toHaveText('1 bottle on the shelf.')
  })

  test.describe('desktop', () => {
    test.skip(({ isMobile }) => isMobile, 'the nav rail exists only at 900px and wider')

    test('the rail’s standing counts it in the singular, and follows the shelf (§4)', async ({
      page,
      hasTouch,
    }) => {
      await page.goto('/shelf')
      await expect(standing(page)).toHaveText('1 bottle · 0 pourable')

      await picker(page).fill('gin')
      await press(chip(page, 'Gin'), hasTouch)
      await expect(standing(page)).toHaveText('2 bottles · 0 pourable')

      await press(page.getByRole('button', { name: 'Remove Gin from the shelf' }), hasTouch)
      await expect(standing(page)).toHaveText('1 bottle · 0 pourable')
    })

    test('the rail says the same on Tonight', async ({ page }) => {
      await page.goto('/tonight')
      await expect(standing(page)).toHaveText('1 bottle · 0 pourable')
    })
  })
})

test.describe('a bare shelf', () => {
  test.use({ world: bareWorld() })

  test('counts nothing in the plural, and its first bottle in the singular', async ({ page, hasTouch }) => {
    await page.goto('/shelf')
    await expect(countLine(page)).toHaveText('0 bottles on the shelf.')

    await picker(page).fill('white')
    await press(chip(page, 'White rum'), hasTouch)
    await expect(countLine(page)).toHaveText('1 bottle on the shelf.')
  })
})
