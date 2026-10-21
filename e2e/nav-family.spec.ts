import type { Page } from '@playwright/test'
import { expect, test } from './support/test'

// frontend-spec §6, filter mechanics: "Family selection lives in the URL
// (?family=sour) and persists across Tonight ↔ Index navigation — 'I feel like
// a sour tonight' spans both." Each project drives the nav its width shows:
// the rail on desktop, the bottom tab bar on the phone. Only one of the two
// "Main" navigations is rendered at a time, so the role query finds that one.

function mainNav(page: Page) {
  return page.getByRole('navigation', { name: 'Main' })
}

function navLink(page: Page, label: string) {
  // The rail's links carry a role hint after the label ("Drinks", "the full index").
  return mainNav(page).getByRole('link', { name: new RegExp(`^${label}`) })
}

function familyButton(page: Page, name: string) {
  return page.getByRole('group', { name: 'Drink family' }).getByRole('button', { name, exact: true })
}

async function expectTheNavItShows(page: Page, isMobile: boolean) {
  await expect(mainNav(page)).toHaveClass(isMobile ? /\btab-bar\b/ : /\bnav-rail\b/)
}

async function expectSourDrinks(page: Page) {
  await expect(page).toHaveURL(/\/drinks\?family=sour$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
  await expect(familyButton(page, 'SOUR')).toHaveAttribute('aria-pressed', 'true')
  await expect(familyButton(page, 'ALL')).toHaveAttribute('aria-pressed', 'false')
  // The family header (§6): the canonical ratio, the blurb, the stock summary
  // over the five sours in the fixture world.
  await expect(page.getByRole('group', { name: '2 SPIRIT, ¾ CITRUS, ¾ SWEET' })).toBeVisible()
  await expect(page.getByText('Spirit brightened by citrus, balanced by sweet.')).toBeVisible()
  await expect(page.getByText(/^You can pour \d+ of 5 · /)).toBeVisible()
  await expect(navLink(page, 'Drinks')).toHaveAttribute('aria-current', 'page')
  await expect(navLink(page, 'Tonight')).not.toHaveAttribute('aria-current')
}

async function expectSourTonight(page: Page) {
  await expect(page).toHaveURL(/\/tonight\?family=sour$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
  await expect(familyButton(page, 'SOUR')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { level: 2, name: /^sours you can pour/ })).toBeVisible()
  await expect(navLink(page, 'Tonight')).toHaveAttribute('aria-current', 'page')
  await expect(navLink(page, 'Drinks')).not.toHaveAttribute('aria-current')
}

test('a family chosen on Tonight carries to Drinks through the nav, and back', async ({ page, isMobile }) => {
  await page.goto('/tonight')
  await expectTheNavItShows(page, isMobile)
  await familyButton(page, 'SOUR').click()
  await expectSourTonight(page)

  await navLink(page, 'Drinks').click()
  await expectSourDrinks(page)

  await navLink(page, 'Tonight').click()
  await expectSourTonight(page)
})

test('a family chosen on Drinks carries to Tonight through the nav, and back', async ({ page, isMobile }) => {
  await page.goto('/drinks')
  await expectTheNavItShows(page, isMobile)
  await familyButton(page, 'SOUR').click()
  await expectSourDrinks(page)

  await navLink(page, 'Tonight').click()
  await expectSourTonight(page)

  await navLink(page, 'Drinks').click()
  await expectSourDrinks(page)
})

test('only the family travels: Shelf and Classics stay bare, Drinks paging and favorites stay behind', async ({
  page,
}) => {
  await page.goto('/drinks?family=sour&fav=1')
  await expect(familyButton(page, 'SOUR')).toHaveAttribute('aria-pressed', 'true')
  await expect(navLink(page, 'Tonight')).toHaveAttribute('href', '/tonight?family=sour')
  await expect(navLink(page, 'Drinks')).toHaveAttribute('href', '/drinks?family=sour')
  await expect(navLink(page, 'Shelf')).toHaveAttribute('href', '/shelf')
  await expect(navLink(page, 'Classics')).toHaveAttribute('href', '/first-pours')

  await navLink(page, 'Shelf').click()
  await expect(page).toHaveURL(/\/shelf$/)
  await expect(navLink(page, 'Shelf')).toHaveAttribute('aria-current', 'page')
})

test('choosing All drops the family from the nav', async ({ page }) => {
  await page.goto('/tonight?family=sour')
  await expect(familyButton(page, 'SOUR')).toHaveAttribute('aria-pressed', 'true')
  await familyButton(page, 'ALL').click()
  await expect(page).toHaveURL(/\/tonight$/)
  await expect(navLink(page, 'Drinks')).toHaveAttribute('href', '/drinks')

  await navLink(page, 'Drinks').click()
  await expect(page).toHaveURL(/\/drinks$/)
  await expect(familyButton(page, 'ALL')).toHaveAttribute('aria-pressed', 'true')
})

test.describe('the brand mark', () => {
  test.skip(({ isMobile }) => isMobile, 'the brand mark lives in the rail, which the phone layout hides')

  test('the brand mark returns to Tonight with the family', async ({ page }) => {
    await page.goto('/drinks?family=sour')
    await expectSourDrinks(page)
    const brand = mainNav(page).getByRole('link', { name: 'Barback', exact: true })
    await expect(brand).toHaveAttribute('href', '/tonight?family=sour')
    await brand.click()
    await expectSourTonight(page)
  })
})
