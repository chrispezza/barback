import type { Page } from '@playwright/test'
import { defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// frontend-spec §3: "The client fetches GET /tags at bootstrap, selects
// family:* tags, and maps them to the segmented filter bar in declared display
// order." ADR-002 Validation: "selecting a family in the UI issues a single
// tag-filtered API/search query". A family in src/data/families.ts whose tag
// does not exist upstream (the tag script has not run, or the family was
// renamed) has no tag to filter by, so it must not be offered, and a URL that
// names it must not dress the whole index in that family's header.

const DECLARED = ['ALL', 'SOUR', 'SPIRIT-FORWARD', 'HIGHBALL', 'TIKI', 'DESSERT']
const WITHOUT_TIKI = ['ALL', 'SOUR', 'SPIRIT-FORWARD', 'HIGHBALL', 'DESSERT']

/** The default bar, minus one upstream tag. No drink in it is tagged tiki. */
function worldWithoutTag(name: string): WorldSeed {
  const w = defaultWorld()
  return { ...w, tags: w.tags.filter((t) => t.name !== name) }
}

function familyBar(page: Page) {
  return page.getByRole('group', { name: 'Drink family' })
}

function familyButton(page: Page, name: string) {
  return familyBar(page).getByRole('button', { name, exact: true })
}

function navLink(page: Page, label: string) {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) })
}

async function expectNoTikiHeader(page: Page) {
  await expect(page.getByRole('group', { name: '2 RUM, 1 CITRUS, 1 SWEET' })).toHaveCount(0)
  await expect(page.getByText('Layered rums and syrups; the sour taken somewhere baroque.')).toHaveCount(0)
}

test.describe('a family whose tag is missing upstream', () => {
  test.use({ world: worldWithoutTag('family:tiki') })

  test('the bar offers only the families tagged upstream, in declared order', async ({ page }) => {
    await page.goto('/drinks')
    await expect(familyBar(page).getByRole('button')).toHaveText(WITHOUT_TIKI)
    await page.goto('/tonight')
    await expect(familyBar(page).getByRole('button')).toHaveText(WITHOUT_TIKI)
  })

  test('/drinks?family=tiki is the whole index, with no tiki header', async ({ page, bar }) => {
    await page.goto('/drinks?family=tiki')
    await expectNoTikiHeader(page)
    await expect(familyButton(page, 'ALL')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { level: 2, name: 'The index · 15' })).toBeVisible()
    await expect(page.getByText(/^You can pour \d+ of \d+ · /)).toHaveCount(0)
    expect(bar.calls('GET', /^\/cocktails$/).filter((c) => c.query.has('filter[tag_id]'))).toEqual([])
  })

  test('/tonight?family=tiki is the whole bar, and the nav does not carry the family', async ({ page }) => {
    await page.goto('/tonight?family=tiki')
    await expect(familyButton(page, 'ALL')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { level: 2, name: /^You can pour/ })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: /^tiki drinks/ })).toHaveCount(0)
    await expect(navLink(page, 'Drinks')).toHaveAttribute('href', '/drinks')
    await expect(navLink(page, 'Tonight')).toHaveAttribute('href', '/tonight')
  })

  test('while the tags load the bar holds the declared families, then drops the untagged one', async ({
    page,
  }) => {
    // Hold GET /tags, then hand it to the fake (routes run newest first).
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/bar/api/tags', async (route) => {
      await held
      await route.fallback()
    })
    await page.goto('/drinks')
    await expect(familyBar(page).getByRole('button')).toHaveText(DECLARED)
    release()
    await expect(familyBar(page).getByRole('button')).toHaveText(WITHOUT_TIKI)
  })
})

test.describe('a family tagged upstream', () => {
  // The default world has the family:tiki tag on no drink: the lens is real,
  // and it is empty.
  test('/drinks?family=tiki filters by the tag and leads with the tiki header', async ({ page, bar }) => {
    await page.goto('/drinks?family=tiki')
    await expect(familyButton(page, 'TIKI')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('group', { name: '2 RUM, 1 CITRUS, 1 SWEET' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'The index · 0' })).toBeVisible()
    expect(bar.calls('GET', /^\/cocktails$/).some((c) => c.query.get('filter[tag_id]') === '104')).toBe(true)
  })
})
