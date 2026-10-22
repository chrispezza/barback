import type { Page } from '@playwright/test'
import { laravelEscape } from '../test/fixtures/upstream'
import { I, type CocktailSeed } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Recipe text as stored. Upstream HTML-escapes a cocktail's instructions,
// garnish and description on output with Laravel's e() (htmlspecialchars,
// ENT_QUOTES, double-encode on; bar-assistant-reference
// app/Http/Resources/CocktailResource.php:96-98, vendor
// Illuminate/Support/helpers.php:138), and the fake does the same
// (test/fixtures/upstream.ts laravelEscape). The Recipe screen (frontend-spec
// §1, §2 "Recipe detail") prints the characters the recipe was written with,
// never their entities, and prints them as text: anything tag-shaped in a
// method is words on the page, never an element.

const main = (page: Page) => page.getByRole('main')

const sidecar: CocktailSeed = {
  id: 96,
  name: 'Sidecar',
  lines: [
    { ingredientId: I.cognac, amount: 50, units: 'ml' },
    { ingredientId: I.cointreau, amount: 20, units: 'ml' },
    { ingredientId: I.lemonJuice, amount: 20, units: 'ml' },
  ],
  // An ampersand, an apostrophe, double quotes and angle brackets: every
  // character e() rewrites.
  instructions: `Shake hard with ice & fine-strain. Don't over-dilute: "cold, not watery" — <ten seconds>, no more.`,
  garnish: `Orange twist & a half "sugar" rim, the barback's way <outside only>`,
}

type ShowBody = { data: { instructions: string; garnish: string } }

test('instructions and garnish read as written, not as HTML entities', async ({ page, bar }) => {
  bar.model.world.cocktails.push(sidecar)

  const shown = page.waitForResponse((r) => r.url().endsWith('/bar/api/cocktails/sidecar-1'))
  await page.goto('/drinks/sidecar-1')
  await expect(page.getByRole('heading', { level: 1, name: 'Sidecar' })).toBeVisible()

  // The wire carries entities, exactly as e() writes them.
  const body = (await (await shown).json()) as ShowBody
  expect(body.data.instructions).toBe(
    'Shake hard with ice &amp; fine-strain. Don&#039;t over-dilute: &quot;cold, not watery&quot; — &lt;ten seconds&gt;, no more.',
  )
  expect(body.data.garnish).toBe(laravelEscape(sidecar.garnish ?? ''))

  // The screen prints the stored text.
  const method = main(page).getByText(sidecar.instructions, { exact: true })
  const garnish = main(page).getByText(`Garnish: ${sidecar.garnish}`, { exact: true })
  await expect(method).toBeVisible()
  await expect(garnish).toBeVisible()
  for (const entity of ['&amp;', '&#039;', '&quot;', '&lt;', '&gt;']) {
    await expect(main(page)).not.toContainText(entity)
  }

  // As text, not markup: no element was made of "<ten seconds>" or "<outside only>".
  await expect(method.locator('*')).toHaveCount(0)
  await expect(garnish.locator('*')).toHaveCount(0)
  await expect(main(page).locator('ten, outside')).toHaveCount(0)
})
