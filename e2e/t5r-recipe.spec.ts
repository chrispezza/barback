import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { C, I, T, defaultWorld, type CocktailSeed, type WorldSeed } from '../test/fixtures/world'
import type { FakeBar } from './support/fake-bar'
import { expect, test } from './support/test'

// The Recipe's list actions, and the stock answers it draws, against the
// rules Track 5 holds the screens to.
//
// Focus (ADR-003 Consequences: "SPA routing/focus management must be handled
// deliberately for accessibility"; frontend-spec §7: "all interactive
// elements keyboard-operable"). A missing line's list action is replaced by
// the word Listed once the bottle is on the list, and "Add missing to the
// list" by "Already on the list.". Neither replacement is a control, so the
// focus the pressed button held fell to <body>, and so it did while the write
// was out: a button that is disabled under the focus loses it in Chromium.
// The reader stays where they were: on the control while its write is out,
// then on what replaced it, which is a landing and never a Tab stop.
//
// Wording (the design system's Iconography: "Affordances are words in the
// utility caps voice"). The line's action read "+ List" while Tonight's rail
// says "List it" for the same act; the "+" is the stepper's mark, nowhere
// else. One wording, and a name that starts with it (WCAG 2.5.3, label in
// name), so a reader who says what they see reaches the control.
//
// Stock answers (ADR-007 Consequences: "No stock answer is ever served
// stale"; chrispezza/barback#144). The cards "In the same vein" are /similar's
// matcher answer, with a held child brand read off the shelf
// (chrispezza/barback#20): neither from a read whose refetch failed, which
// TanStack Query keeps beside its error. And a shelf change made while the
// recipe is open (an Undo from the toast) reads the recipe's own lines back,
// as it reads the cards back (e2e/q-similar-reads-back.spec.ts), without
// taking the favourite's optimistic flip away and without a failed read
// replacing the recipe (what that should show is chrispezza/barback#127's
// decision).
//
// Default world (test/fixtures/world.ts): the Penicillin lacks honey syrup;
// the Espresso Martini lacks all three of its bottles; the Gimlet's similar
// drinks are the Negroni (one bottle away: Campari), the Gin Tonic (pours)
// and the Martini.

const ERROR = 'The bar didn’t answer — try again.'
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const main = (page: Page) => page.getByRole('main')
const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true })
const line = (page: Page, name: string) =>
  main(page).locator('ul.recipe-ingredients').getByRole('listitem').filter({ hasText: name })
/** A missing line's list action, whatever its words: the one button on the line. */
const lineAction = (page: Page, name: string) => line(page, name).getByRole('button')
const listedMark = (page: Page, name: string) => line(page, name).getByText('Listed', { exact: true })
const addMissing = (page: Page) => main(page).getByRole('button', { name: 'Add missing to the list', exact: true })
const alreadyListed = (page: Page) => main(page).getByText('Already on the list.', { exact: true })
const favorite = (page: Page) => main(page).getByRole('button', { name: /favorite/i })
/** The recipe's own gap line; similar-drink cards print one of their own. */
const missingLine = (page: Page) => main(page).locator('p.missing-line')
const lineName = (row: Locator) => row.locator('.bb-row__name')

const similarHeading = (page: Page) => page.getByRole('heading', { level: 2, name: 'In the same vein' })
const similarSection = (page: Page) => main(page).locator('section', { has: similarHeading(page) })
/** A similar-drink card; a favourited card's name starts with its mark, so no anchor. */
const similarCard = (page: Page, name: string) => similarSection(page).getByRole('link', { name: new RegExp(name) })

/** The main navigation the viewport shows: the rail on desktop, the tab bar on the phone. */
const navLink = (page: Page, label: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: new RegExp(`^${label}`) })
const removeButton = (page: Page, name: string) =>
  page.getByRole('button', { name: `Remove ${name} from the shelf`, exact: true })
/** The removal's toast (destructive, so the design system gives it role alert). */
const removalUndo = (page: Page) =>
  page.locator('.toast-host').filter({ hasText: 'Bottle removed from the shelf.' }).getByRole('button', { name: 'Undo' })
/** A shopping-list row's check-off control on Tonight; its name starts with the bottle. */
const listItem = (page: Page, name: string) =>
  page.locator('#buy .shopping-row-line').getByRole('button', { name: new RegExp(`^${name}`) })
/** The check-off's receipt toast, which carries the Undo. */
const checkOffUndo = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Moved to the shelf.' }).getByRole('button', { name: 'Undo' })

/** The focused element as markup, or "BODY" when nothing has focus. */
const focused = (page: Page) =>
  page.evaluate(() =>
    document.activeElement === document.body ? 'BODY' : (document.activeElement?.outerHTML ?? 'NONE'),
  )

/** GET /cocktails/{slug} reads made so far: the recipe's own. */
const recipeReads = (bar: FakeBar, slug: string): number =>
  bar.calls('GET', new RegExp(`^/cocktails/${slug}$`)).length

// tokens/colors.css: --cream-100 (neutral content), --sage-600 ("you don't have it").
const CREAM_100 = 'rgb(241, 232, 214)'
const SAGE_600 = 'rgb(156, 175, 164)'

/** Presence is cream and is not struck through (Visual foundations; never colour alone). */
async function expectStocked(row: Locator): Promise<void> {
  await expect(lineName(row)).toHaveCSS('color', CREAM_100)
  await expect(lineName(row)).toHaveCSS('text-decoration-line', 'none')
}

/** Absence is sage and struck through. */
async function expectGap(row: Locator): Promise<void> {
  await expect(lineName(row)).toHaveCSS('color', SAGE_600)
  await expect(lineName(row)).toHaveCSS('text-decoration-line', 'line-through')
}

async function openRecipe(page: Page, slug: string, name: string): Promise<void> {
  await page.goto(`/drinks/${slug}`)
  await expect(h1(page, name)).toBeVisible()
}

/**
 * Open a recipe again from the index, inside the app: nothing is reloaded, so
 * the cache and the toasts stand.
 */
async function reopen(page: Page, name: string): Promise<void> {
  await navLink(page, 'Drinks').click()
  await expect(h1(page, 'Drinks')).toBeVisible()
  await main(page)
    .locator('a.bb-drink', { has: page.getByRole('heading', { level: 3, name: new RegExp(`^(Favorited )?${name}$`) }) })
    .click()
  await expect(h1(page, name)).toBeVisible()
}

/** The section's one error line (ErrorLine is role="alert"), with its Retry. */
async function expectOneErrorLine(scope: Locator): Promise<void> {
  const alert = scope.getByRole('alert')
  await expect(alert).toHaveCount(1)
  await expect(alert).toContainText(ERROR)
  await expect(alert.getByRole('button', { name: 'Retry' })).toBeVisible()
}

/**
 * Drop every API request whose URL `matches`, until `lift` is called
 * (as e2e/t-warm-stale.spec.ts: FakeBar.takeApiDown cannot be undone).
 * Playwright asks the route registered last first, so this one is asked
 * before the fake, and passes every other request on to it.
 */
async function outage(page: Page, matches: (url: URL) => boolean): Promise<{ lift: () => void }> {
  let down = true
  await page.route(
    (url) => url.pathname.startsWith('/bar/api/'),
    (route) => {
      if (!down || !matches(new URL(route.request().url()))) return route.fallback()
      return route.abort('connectionrefused')
    },
  )
  return {
    lift: () => {
      down = false
    },
  }
}

/** The shelf read (useShelf): GET /ingredients?filter[on_shelf]=true. */
const isShelfRead = (url: URL) =>
  url.pathname === '/bar/api/ingredients' && url.searchParams.get('filter[on_shelf]') === 'true'

/** GET /cocktails/{id}/similar. */
const isSimilarRead = (url: URL) => /^\/bar\/api\/cocktails\/\d+\/similar$/.test(url.pathname)

const isListWrite = (url: string) => /\/bar\/api\/users\/\d+\/shopping-list\/batch-store$/.test(url)

/**
 * Let the page act on what it has just been told, and the browser run its
 * focus fixup: Chromium drops the focus from a button that has become disabled
 * when it next updates the rendering, not at once. Two frames cover it (as
 * e2e/q-list-double-tap.spec.ts).
 */
async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

test.describe('the focus after a list write (ADR-003, §7)', () => {
  test('List it, pressed by Enter, leaves the focus on its line, which now reads Listed', async ({ page, bar }) => {
    await openRecipe(page, 'espresso-martini-1', 'Espresso Martini')
    await favorite(page).focus()
    await page.keyboard.press('Tab')
    await expect(lineAction(page, 'Vodka')).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(listedMark(page, 'Vodka')).toBeVisible()
    expect(bar.model.list.has(I.vodka)).toBe(true)
    await expect.poll(() => focused(page)).not.toBe('BODY')
    await expect(listedMark(page, 'Vodka')).toBeFocused()
    // An announcement, as the screen heading a route change lands on: no ring
    // of its own, and never the browser's (Visual foundations: the one ring is
    // brass, on controls).
    await expect(listedMark(page, 'Vodka')).toHaveCSS('outline-style', 'none')

    // A landing, never a Tab stop: the next Tab goes on to the next line's action.
    await page.keyboard.press('Tab')
    await expect(lineAction(page, 'Coffee liqueur')).toBeFocused()
  })

  test('the last missing line lands on its own Listed, not on "Already on the list."', async ({ page }) => {
    await openRecipe(page, 'penicillin-1', 'Penicillin')
    await favorite(page).focus()
    await page.keyboard.press('Tab')
    await expect(lineAction(page, 'Honey syrup')).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(alreadyListed(page)).toBeVisible()
    await expect.poll(() => focused(page)).not.toBe('BODY')
    await expect(listedMark(page, 'Honey syrup')).toBeFocused()
  })

  test('Add missing, pressed by Space, leaves the focus on "Already on the list."', async ({ page, bar }) => {
    await openRecipe(page, 'espresso-martini-1', 'Espresso Martini')
    await lineAction(page, 'Espresso').focus()
    await page.keyboard.press('Tab')
    await expect(addMissing(page)).toBeFocused()

    await page.keyboard.press('Space')
    await expect(alreadyListed(page)).toBeVisible()
    expect(bar.model.list.size).toBe(3)
    await expect.poll(() => focused(page)).not.toBe('BODY')
    await expect(alreadyListed(page)).toBeFocused()
    await expect(alreadyListed(page)).toHaveCSS('outline-style', 'none')
  })

  test('while its write is out, the pressed List it keeps the focus and takes no second press', async ({
    page,
    bar,
  }) => {
    await openRecipe(page, 'penicillin-1', 'Penicillin')
    await favorite(page).focus()
    await page.keyboard.press('Tab')
    await expect(lineAction(page, 'Honey syrup')).toBeFocused()

    bar.slowDown(1500)
    const write = page.waitForRequest((r) => r.method() === 'POST' && isListWrite(r.url()))
    await page.keyboard.press('Enter')
    await write
    // Held, as every list action is until the list is read back (src/api/queries.ts
    // useShoppingMutation), and still focused once the page has rendered the hold.
    await expect(lineAction(page, 'Honey syrup')).toBeDisabled()
    await settled(page)
    await expect(lineAction(page, 'Honey syrup')).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(listedMark(page, 'Honey syrup')).toBeVisible({ timeout: 10_000 })
    await expect(listedMark(page, 'Honey syrup')).toBeFocused()
    expect(bar.calls('POST', /^\/users\/1\/shopping-list\/batch-store$/)).toHaveLength(1)
  })

  test('a write the bar refuses leaves the focus on the List it it was pressed on', async ({ page, bar }) => {
    await openRecipe(page, 'penicillin-1', 'Penicillin')
    bar.fail(/^\/users\/1\/shopping-list\/batch-store$/, { method: 'POST', status: 500 })
    // The refusal is answered at once; the list read it starts is held, and
    // with it the control, long enough for the page to render the hold.
    bar.slowDown(500)
    await favorite(page).focus()
    await page.keyboard.press('Tab')
    await expect(lineAction(page, 'Honey syrup')).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toHaveText('The list didn’t take that change.')
    await expect(lineAction(page, 'Honey syrup')).toBeEnabled()
    await expect(lineAction(page, 'Honey syrup')).toBeFocused()
    await expect(listedMark(page, 'Honey syrup')).toHaveCount(0)
  })

  // Guards: what already held, and must go on holding.
  test('a reader who moves on while the write is out keeps their place', async ({ page, bar }) => {
    await openRecipe(page, 'espresso-martini-1', 'Espresso Martini')
    await favorite(page).focus()
    await page.keyboard.press('Tab')
    await expect(lineAction(page, 'Vodka')).toBeFocused()

    bar.slowDown(1500)
    const write = page.waitForRequest((r) => r.method() === 'POST' && isListWrite(r.url()))
    await page.keyboard.press('Enter')
    await write
    // The reader goes back up to Favorite before the list is read back (put
    // there directly, as a Shift+Tab would).
    await favorite(page).focus()

    await expect(listedMark(page, 'Vodka')).toBeVisible({ timeout: 10_000 })
    await expect(favorite(page)).toBeFocused()
  })

  test('listed and landed, the recipe passes the automated accessibility checks', async ({ page }) => {
    await openRecipe(page, 'espresso-martini-1', 'Espresso Martini')
    await favorite(page).focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(listedMark(page, 'Vodka')).toBeVisible()
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations).toEqual([])
  })
})

test.describe('one wording for listing a bottle (DS Iconography: affordances are words)', () => {
  test('each missing line offers List it, named for its bottle, on a 44px target', async ({ page }) => {
    await openRecipe(page, 'espresso-martini-1', 'Espresso Martini')
    for (const name of ['Vodka', 'Coffee liqueur', 'Espresso']) {
      const action = lineAction(page, name)
      await expect(action).toHaveText('List it')
      // The visible words start the name (WCAG 2.5.3), and the name says which bottle.
      await expect(action).toHaveAccessibleName(`List it: ${name}`)
      const box = await action.boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(44)
      expect(box?.width).toBeGreaterThanOrEqual(44)
    }
    await expect(main(page).getByText(/\+\s*List/)).toHaveCount(0)
  })
})

test.describe('"In the same vein" draws on no read that failed (ADR-007; #144)', () => {
  test('cards from a /similar read that failed again give way to one error line, and Retry brings them back', async ({
    page,
    bar,
  }) => {
    await openRecipe(page, 'gimlet-1', 'Gimlet')
    const ginTonic = similarCard(page, 'Gin Tonic')
    await expect(ginTonic).toHaveAttribute('data-match', 'full')

    // A shelf change reads the cards back (useShelfMutation); that read fails.
    await navLink(page, 'Shelf').click()
    await removeButton(page, 'Tonic').click()
    await expect.poll(() => bar.model.shelf.has(I.tonic)).toBe(false)
    const { lift } = await outage(page, isSimilarRead)
    await reopen(page, 'Gimlet')

    await expectOneErrorLine(similarSection(page))
    // No card from the answer the failed read still holds: the Gin Tonic it
    // paints Can pour no longer pours.
    await expect(similarSection(page).getByRole('link')).toHaveCount(0)
    // The recipe itself answered, and stands.
    await expect(line(page, 'Gin')).toBeVisible()

    lift()
    await similarSection(page).getByRole('alert').getByRole('button', { name: 'Retry' }).click()
    await expect(similarSection(page).getByRole('alert')).toHaveCount(0)
    await expect(ginTonic).toHaveAttribute('data-match', 'near')
    await expect(ginTonic.locator('.bb-drink__missing-line')).toHaveText('One bottle away: Tonic')
  })

  test.describe('after the shelf read fails', () => {
    // A sour that calls Islay Scotch, the parent of the Laphroaig 10 on the
    // default shelf: its one similar drink is the Penicillin, whose card reads
    // the held brand off the shelf (/similar carries no variant flags).
    const islaySour: CocktailSeed = {
      id: 96,
      name: 'Islay Sour',
      tagIds: [T.sour],
      lines: [
        { ingredientId: I.islayScotch, amount: 60, units: 'ml' },
        { ingredientId: I.lemonJuice, amount: 22.5, units: 'ml' },
        { ingredientId: I.simpleSyrup, amount: 22.5, units: 'ml' },
      ],
      instructions: 'Shake with ice and strain over fresh ice.',
    }
    test.use({
      world: ((w: WorldSeed) => {
        w.cocktails.push(islaySour)
        return w
      })(defaultWorld()),
    })

    test('a card paints no brand off the shelf that could not be read again, under one error line', async ({
      page,
      bar,
    }) => {
      await page.goto('/drinks')
      await expect(h1(page, 'Drinks')).toBeVisible()
      // Elsewhere, the Laphroaig leaves the shelf; and the shelf cannot be read again.
      bar.model.shelf.delete(I.laphroaig10)
      const { lift } = await outage(page, isShelfRead)
      await main(page).getByRole('link', { name: /^Islay Sour/ }).click()
      await expect(h1(page, 'Islay Sour')).toBeVisible()

      await expectOneErrorLine(similarSection(page))
      // The card reads its own line flags, not the brand on the shelf as last read.
      const penicillin = similarCard(page, 'Penicillin')
      await expect(penicillin.locator('.bb-drink__missing-line')).toHaveText('Missing 2: Islay Scotch, Honey syrup')

      lift()
      await similarSection(page).getByRole('alert').getByRole('button', { name: 'Retry' }).click()
      await expect(similarSection(page).getByRole('alert')).toHaveCount(0)
      await expect(penicillin.locator('.bb-drink__missing-line')).toHaveText('Missing 2: Islay Scotch, Honey syrup')
    })
  })
})

test.describe('a shelf change made with the recipe open reads its lines back (ADR-007; §4)', () => {
  test('the removal’s Undo, tapped on the recipe, puts the bottle back on its line', async ({ page, bar }) => {
    await openRecipe(page, 'gimlet-1', 'Gimlet')
    await expect(missingLine(page)).toHaveCount(0)

    await navLink(page, 'Shelf').click()
    await removeButton(page, 'Gin').click()
    await expect(removalUndo(page)).toBeVisible()
    await expect.poll(() => bar.model.shelf.has(I.gin)).toBe(false)

    await reopen(page, 'Gimlet')
    await expect(missingLine(page)).toHaveText('One bottle away: Gin')
    await expectGap(line(page, 'Gin'))
    const reads = recipeReads(bar, 'gimlet-1')

    // The Undo outlives the Shelf screen; it is tapped with the recipe open.
    await removalUndo(page).click()
    await expect.poll(() => bar.model.shelf.has(I.gin)).toBe(true)
    await expect(missingLine(page)).toHaveCount(0)
    await expectStocked(line(page, 'Gin'))
    await expect(lineAction(page, 'Gin')).toHaveCount(0)
    expect(recipeReads(bar, 'gimlet-1')).toBeGreaterThan(reads)
  })

  test.describe('the check-off’s Undo', () => {
    // Campari listed: the Negroni waits on it alone.
    test.use({
      world: ((w: WorldSeed) => {
        w.list = [I.campari]
        return w
      })(defaultWorld()),
    })

    /** Check Campari off on Tonight, then open the Negroni, which now pours. */
    async function checkOffThenNegroni(page: Page, bar: FakeBar): Promise<void> {
      await openRecipe(page, 'negroni-1', 'Negroni')
      await expect(missingLine(page)).toHaveText('One bottle away: Campari')
      await expect(listedMark(page, 'Campari')).toBeVisible()

      await navLink(page, 'Tonight').click()
      await listItem(page, 'Campari').click()
      await expect(checkOffUndo(page)).toBeVisible()
      await expect.poll(() => [bar.model.shelf.has(I.campari), bar.model.list.has(I.campari)]).toEqual([true, false])

      await reopen(page, 'Negroni')
      await expect(missingLine(page)).toHaveCount(0)
      await expectStocked(line(page, 'Campari'))
    }

    test('tapped on the recipe, takes the bottle back off its line and lists it', async ({ page, bar }) => {
      await checkOffThenNegroni(page, bar)
      const reads = recipeReads(bar, 'negroni-1')

      await checkOffUndo(page).click()
      await expect.poll(() => [bar.model.shelf.has(I.campari), bar.model.list.has(I.campari)]).toEqual([false, true])
      await expect(missingLine(page)).toHaveText('One bottle away: Campari')
      await expectGap(line(page, 'Campari'))
      await expect(listedMark(page, 'Campari')).toBeVisible()
      expect(recipeReads(bar, 'negroni-1')).toBeGreaterThan(reads)
    })

    test('read back while a favourite is out, the lines change and the flip holds', async ({ page, bar }) => {
      await checkOffThenNegroni(page, bar)
      await expect(favorite(page)).toHaveAttribute('aria-pressed', 'false')

      // The favourite's write is held before it reaches the bar, so the bar
      // answers the read-back as it stood before the tap.
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route(
        (url) => url.pathname.endsWith('/toggle-favorite'),
        async (route) => {
          await held
          await route.fallback()
        },
      )
      await favorite(page).click()
      await expect(favorite(page)).toHaveAttribute('aria-pressed', 'true')

      await checkOffUndo(page).click()
      await expect(missingLine(page)).toHaveText('One bottle away: Campari')
      await expect(favorite(page)).toHaveAttribute('aria-pressed', 'true')
      expect(bar.model.favorites.has(C.negroni)).toBe(false)

      release()
      await expect.poll(() => bar.model.favorites.has(C.negroni)).toBe(true)
      await expect(favorite(page)).toHaveAttribute('aria-pressed', 'true')
      await expect(missingLine(page)).toHaveText('One bottle away: Campari')
    })

    // What a recipe whose read-back failed should say is chrispezza/barback#127's
    // decision. Until it is made, the read-back does not decide it: the recipe
    // stands as it was read, and no error line takes its place.
    test('a read-back that fails leaves the recipe standing', async ({ page, bar }) => {
      await checkOffThenNegroni(page, bar)
      const reads = recipeReads(bar, 'negroni-1')
      bar.fail(/^\/cocktails\/negroni-1$/, { method: 'GET', status: 500 })

      await checkOffUndo(page).click()
      await expect.poll(() => [bar.model.shelf.has(I.campari), bar.model.list.has(I.campari)]).toEqual([false, true])
      await expect.poll(() => recipeReads(bar, 'negroni-1')).toBeGreaterThan(reads)

      await expect(h1(page, 'Negroni')).toBeVisible()
      await expect(main(page).getByRole('alert')).toHaveCount(0)
      await expect(line(page, 'Campari')).toBeVisible()
      await expect(favorite(page)).toBeVisible()
    })
  })
})
