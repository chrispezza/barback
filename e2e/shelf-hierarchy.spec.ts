import type { Page } from '@playwright/test'
import { I, defaultWorld, type WorldSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Hierarchy-aware brands (frontend-spec §9): the Shelf ledger groups bottles by
// root ancestor via materialized_path, and a list row for a brand that unlocks
// nothing says what it builds toward through its parent. The decisions are
// src/data/hierarchy.ts; these drive them through the real bundle and the
// queries that feed them.

/** The ledger's group headers (MatchHeader renders an h2 per group). */
const groupHeaders = (page: Page) => page.getByRole('main').getByRole('heading', { level: 2 })

/** Bottle names inside the group whose header reads `header`. */
const groupRows = (page: Page, header: string) =>
  page
    .getByRole('main')
    .locator('section', { has: page.getByRole('heading', { level: 2, name: header, exact: true }) })
    .locator('.bb-row__name')

test.describe('the shelf ledger', () => {
  test('groups bottles under their root ancestor, Spirits first and the rest alphabetical', async ({ page }) => {
    await page.goto('/shelf')
    await expect(groupHeaders(page)).toHaveText([
      'Spirits · 4',
      'Beverages · 2',
      'Bitters · 1',
      'Fortified wine · 1',
      'Juices · 2',
      'Sweeteners · 1',
    ])
    // Laphroaig 10 sits four levels down (Spirits > Whisky > Scotch whisky >
    // Islay Scotch); it files under the root, not its parent.
    await expect(groupRows(page, 'Spirits · 4')).toHaveText([
      'Bourbon whiskey',
      'Gin',
      'Laphroaig 10',
      'White rum',
    ])
  })

  test('reads flat, in shelf order, until the root names load', async ({ page, bar }) => {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    // Hold the filter[id] name lookup; the fake answers it once released.
    await page.route(
      (url) => url.pathname === '/bar/api/ingredients' && url.searchParams.has('filter[id]'),
      async (route) => {
        await held
        await route.fallback()
      },
    )
    await page.goto('/shelf')
    await expect(page.getByRole('main').locator('.bb-row__name')).toHaveText([
      'Angostura aromatic bitters',
      'Bourbon whiskey',
      'Club soda',
      'Gin',
      'Laphroaig 10',
      'Lemon juice',
      'Lime juice',
      'Simple syrup',
      'Sweet vermouth',
      'Tonic',
      'White rum',
    ])
    await expect(groupHeaders(page)).toHaveCount(0)
    release()
    await expect(groupHeaders(page).first()).toHaveText('Spirits · 4')
    // One lookup, for the distinct roots only.
    const lookups = bar.calls('GET', /^\/ingredients$/).filter((c) => c.query.has('filter[id]'))
    expect(lookups.map((c) => c.query.get('filter[id]'))).toEqual([
      [I.spirits, I.wines, I.juices, I.syrups, I.bitters, I.beverages].sort((a, b) => a - b).join(','),
    ])
  })

  test('opens a group for a new root when a bottle from it is added', async ({ page }) => {
    await page.goto('/shelf')
    await expect(groupHeaders(page)).toHaveCount(6)
    await page.getByRole('searchbox', { name: 'Add a bottle' }).fill('Cointreau')
    await page.getByRole('button', { name: 'Cointreau', exact: true }).click()
    await expect(groupHeaders(page)).toHaveText([
      'Spirits · 4',
      'Beverages · 2',
      'Bitters · 1',
      'Fortified wine · 1',
      'Juices · 2',
      'Liqueurs · 1',
      'Sweeteners · 1',
    ])
    await expect(groupRows(page, 'Liqueurs · 1')).toHaveText(['Cointreau'])
  })
})

/** The default bar with Laphroaig 10 off the shelf and on the list. */
function brandOnTheList(): WorldSeed {
  const w = defaultWorld()
  return { ...w, shelf: w.shelf.filter((id) => id !== I.laphroaig10), list: [I.laphroaig10] }
}

test.describe('a brand on the list', () => {
  test.use({ world: brandOnTheList() })

  test('says what it builds toward through its parent when it unlocks nothing', async ({ page, bar }) => {
    await page.goto('/tonight')
    const row = page.locator('.bb-shop', { hasText: 'Laphroaig 10' })
    // Penicillin calls Islay Scotch, Laphroaig 10's parent; without honey syrup
    // the bottle completes nothing by itself.
    await expect(row.locator('.bb-shop__meta')).toHaveText('In 1 drink as Islay Scotch')
    await expect(row).not.toContainText('Unlocks')
    // Its own count first (none), then the direct parent's.
    const reach = bar.calls('GET', /^\/ingredients\/\d+$/)
    expect(reach.map((c) => `${c.path}?${c.query.toString()}`)).toEqual([
      `/ingredients/${I.laphroaig10}?include=cocktailsCount`,
      `/ingredients/${I.islayScotch}?include=cocktailsCount`,
    ])
  })
})
