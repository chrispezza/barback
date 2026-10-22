import type { Locator, Page } from '@playwright/test'
import { FIRST_POUR_SLUGS } from '../src/data/first-pours'
import { slugify } from '../test/fixtures/upstream'
import { defaultWorld } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// The Shelf, the Index and the Classics when the bar does not answer
// (chrispezza/barback#68). ADR-007 Validation: "Kill the API containers: the
// installed app still opens; the rail shows the stamped snapshot; every other
// section shows the error line." Consequences: "screens that need the API say
// so in the error voice rather than showing cached matches."
//
// A cold start asks /bars and /profile before anything else. When they fail,
// every read keyed on the bar id or the user id stays disabled and never errors
// on its own, so a section whose bootstrap read failed says so as one whose own
// read failed does, and its Retry asks the bootstrap again. Tonight is pinned
// in e2e/offline-tonight.spec.ts; the Recipe screen is chrispezza/barback#68's
// other half, not this spec's.
//
// Every bootstrap failure below fails the first try and its one retry
// (src/app.tsx, retry: 1); the bar answers from the third.

const world = defaultWorld()

/** The roster as this bar resolves it (e2e/classics.spec.ts): slugs it lacks dropped. */
const ROSTER = FIRST_POUR_SLUGS.flatMap((slug) => {
  const c = world.cocktails.find((x) => slugify(x.name) === slug)
  return c ? [c.name] : []
})

const ERROR = 'The bar didn’t answer — try again.'

/** The page's one error line (ErrorLine is role="alert"), with its Retry. */
async function expectOneErrorLine(page: Page, within?: Locator): Promise<Locator> {
  const alerts = page.getByRole('alert')
  await expect(alerts).toHaveCount(1)
  const alert = (within ?? page).getByRole('alert')
  await expect(alert).toContainText(ERROR)
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
  return alert
}

const sectionHeading = (page: Page, name: string) =>
  page.getByRole('main').getByRole('heading', { level: 2, name, exact: true })
const cards = (page: Page) => page.locator('main .card-list > li')
/** The Index's search section, headed "Matches" with or without a count. */
const matchesSection = (page: Page) =>
  page.getByRole('main').locator('section', { has: page.getByRole('heading', { level: 2, name: /^Matches/ }) })
const shelfCount = (page: Page) => page.getByRole('main').getByText(/ bottles on the shelf\.$/)
const counting = (page: Page) => page.getByText('Counting the shelf…')
/** The rail's standing line ("11 bottles · 5 pourable"); desktop only. */
const standing = (page: Page) => page.getByRole('navigation', { name: 'Main' }).getByText(/ bottles · \d+ pourable$/)

/** Both bootstrap reads drop, the first try and its retry, then answer. */
function bootstrapDropsTwice(bar: FakeBar) {
  bar.fail(/^\/bars$/, { abort: true, times: 2 })
  bar.fail(/^\/profile$/, { abort: true, times: 2 })
}

test.describe('a cold start with the API out of reach', () => {
  test('the Shelf says so in the error voice alone, and counts nothing', async ({ page, bar }) => {
    bar.takeApiDown()
    await page.goto('/shelf')

    await expectOneErrorLine(page)
    // One voice: not "Counting the shelf…" beside the error line, nor a busy
    // count that never finishes.
    await expect(counting(page)).toHaveCount(0)
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
    await expect(shelfCount(page)).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveCount(0)
    await expect(page.getByText('Nothing on the shelf')).toHaveCount(0)
    // The rail states no standing it could not read.
    await expect(standing(page)).toHaveCount(0)
  })

  test('the Shelf’s Retry asks the bar again, and the ledger takes the error line’s place', async ({
    page,
    bar,
  }) => {
    bootstrapDropsTwice(bar)
    await page.goto('/shelf')
    const alert = await expectOneErrorLine(page)

    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect(shelfCount(page)).toHaveText('11 bottles on the shelf.')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(sectionHeading(page, 'Spirits · 4')).toBeVisible()
  })

  test('the Index says so in the error voice, and lists nothing', async ({ page, bar }) => {
    bar.takeApiDown()
    await page.goto('/drinks')

    await expectOneErrorLine(page)
    await expect(sectionHeading(page, 'The index')).toBeVisible()
    await expect(cards(page)).toHaveCount(0)
  })

  test('the Index’s Retry asks the bar again, and the index takes the error line’s place', async ({
    page,
    bar,
  }) => {
    bootstrapDropsTwice(bar)
    await page.goto('/drinks')
    const alert = await expectOneErrorLine(page)

    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect(sectionHeading(page, 'The index · 15')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(cards(page)).toHaveCount(15)
  })

  test('a search on the Index says so in the error voice, and finds nothing by that name', async ({
    page,
    bar,
  }) => {
    bar.takeApiDown()
    await page.goto('/drinks')
    await expectOneErrorLine(page)

    await page.getByRole('searchbox', { name: 'Find a drink' }).fill('daiq')

    await expect(sectionHeading(page, 'Matches')).toBeVisible()
    await expectOneErrorLine(page, matchesSection(page))
    await expect(page.getByText('Nothing by that name.')).toHaveCount(0)
    await expect(cards(page)).toHaveCount(0)
  })

  test('a search’s Retry asks the bar again, and the matches take the error line’s place', async ({
    page,
    bar,
  }) => {
    bootstrapDropsTwice(bar)
    await page.goto('/drinks')
    await expectOneErrorLine(page)
    await page.getByRole('searchbox', { name: 'Find a drink' }).fill('daiq')
    const alert = await expectOneErrorLine(page, matchesSection(page))

    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect(sectionHeading(page, 'Matches · 1')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(cards(page).getByRole('heading', { level: 3 })).toHaveText(['Daiquiri'])
  })

  test('the Classics says so, and its Retry asks the bar again for the roster', async ({ page, bar }) => {
    bootstrapDropsTwice(bar)
    await page.goto('/first-pours')
    const alert = await expectOneErrorLine(page)
    await expect(sectionHeading(page, 'The roster')).toBeVisible()
    await expect(page.locator('.first-pour-item')).toHaveCount(0)

    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect(sectionHeading(page, `The roster · ${ROSTER.length}`)).toBeVisible()
    await expect(page.locator('.first-pour-item').getByRole('heading', { level: 3 })).toHaveText(ROSTER)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
})

test.describe('the bar list fails and the profile answers', () => {
  // Without /bars there is no bar id, so nothing bar-scoped is asked.
  const barsFailTwice = (bar: FakeBar) => bar.fail(/^\/bars$/, { method: 'GET', status: 500, times: 2 })

  test('the Shelf says so', async ({ page, bar }) => {
    barsFailTwice(bar)
    await page.goto('/shelf')
    await expectOneErrorLine(page)
    await expect(counting(page)).toHaveCount(0)
  })

  test('the Index says so', async ({ page, bar }) => {
    barsFailTwice(bar)
    await page.goto('/drinks')
    await expectOneErrorLine(page)
  })

  test('the Classics says so', async ({ page, bar }) => {
    barsFailTwice(bar)
    await page.goto('/first-pours')
    await expectOneErrorLine(page)
    await expect(page.getByRole('button', { name: 'Choose' })).toHaveCount(0)
  })
})

test.describe('the profile fails and the bar answers', () => {
  // frontend-spec §2: the user id is "needed for all /users/{id}/* calls", and
  // every shelf write is one (batch-store, batch-delete).
  test('the Shelf shows its ledger, says the profile did not answer, and its Retry reads it', async ({
    page,
    bar,
  }) => {
    bar.fail(/^\/profile$/, { method: 'GET', status: 500, times: 2 })
    await page.goto('/shelf')

    await expect(shelfCount(page)).toHaveText('11 bottles on the shelf.')
    const alert = await expectOneErrorLine(page)

    const profileRead = page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith('/profile') && r.ok(),
    )
    await alert.getByRole('button', { name: 'Retry' }).click()
    await profileRead
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(shelfCount(page)).toHaveText('11 bottles on the shelf.')
  })
})

test.describe('the shelf read fails on its own', () => {
  test('the Shelf shows the error line alone, not a count under way', async ({ page, bar }) => {
    bar.fail(/^\/ingredients$/, { method: 'GET', status: 500, times: 2 })
    await page.goto('/shelf')

    await expectOneErrorLine(page)
    await expect(counting(page)).toHaveCount(0)
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
    await expect(shelfCount(page)).toHaveCount(0)
  })
})

test.describe('the roster reads fail', () => {
  /** GET /cocktails/{slug}-1, the roster's own reads (useFirstPours). */
  const SLUG_READ = /^\/cocktails\/[a-z][a-z0-9-]*-1$/

  test('every slug answering 500 is the bar not answering, not an empty roster; Retry reads it', async ({
    page,
    bar,
  }) => {
    // Every slug, on the first try and its one retry.
    bar.fail(SLUG_READ, { method: 'GET', status: 500, times: 2 * FIRST_POUR_SLUGS.length })
    await page.goto('/first-pours')

    const alert = await expectOneErrorLine(page)
    await expect(sectionHeading(page, 'The roster')).toBeVisible()
    await expect(sectionHeading(page, 'The roster · 0')).toHaveCount(0)
    await expect(page.locator('.first-pour-item')).toHaveCount(0)

    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect(sectionHeading(page, `The roster · ${ROSTER.length}`)).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('one drink the bar fails to serve is not dropped as if the bar lacked it', async ({ page, bar }) => {
    bar.fail(/^\/cocktails\/negroni-1$/, { method: 'GET', status: 503, times: 2 })
    await page.goto('/first-pours')

    await expectOneErrorLine(page)
    await expect(sectionHeading(page, `The roster · ${ROSTER.length - 1}`)).toHaveCount(0)
    await expect(page.locator('.first-pour-item')).toHaveCount(0)
  })
})
