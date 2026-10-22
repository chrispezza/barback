import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { I, bareWorld, defaultWorld } from '../test/fixtures/world'
import { expect, test } from './support/test'

// Track 5's sweep (ADR-011; ADR-003 "SPA routing/focus management must be
// handled deliberately for accessibility"; frontend-spec §7 "all interactive
// elements keyboard-operable, focus-visible 2px brass outline"; The Back Bar,
// Visual foundations and Accessibility). Every screen, in the states a user
// meets, on both projects:
//
// 1. axe at WCAG 2.2 AA finds nothing;
// 2. a Tab walk from the top reaches every control in order, each stop shows
//    the system's ring (2px solid brass), and focus never falls to the body.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const BRASS = 'rgb(198, 161, 91)'

async function settled(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
}

// The one exclusion: the design system's fleuron divider ("—◆—", "Ornament:
// one mark", Visual foundations). It is aria-hidden and pure decoration,
// which WCAG 1.4.3 exempts from contrast ("text that is … pure decoration …
// has no contrast requirement"); axe still measures it. Excluded by its
// selector only, and only after checking every match is exactly that.
const DECORATION = '.bb-empty__fleuron'

async function noViolations(page: Page) {
  const decorations = await page.locator(DECORATION).evaluateAll((els) =>
    els.map((el) => ({ hidden: el.getAttribute('aria-hidden'), text: el.textContent })),
  )
  for (const d of decorations) expect(d, 'an excluded node is the fleuron and nothing else').toEqual({ hidden: 'true', text: '—◆—' })
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).exclude(DECORATION).analyze()
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

/** Tab through the page; every stop is a real control wearing the brass ring. */
async function tabWalk(page: Page, stops = 40) {
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  const seen: string[] = []
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      const frame = el.closest('.bb-search') as HTMLElement | null
      const ringOn = frame && el.tagName === 'INPUT' ? getComputedStyle(frame) : s
      return {
        what: `${el.tagName.toLowerCase()} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? ''}`,
        style: ringOn.outlineStyle,
        color: ringOn.outlineColor,
        width: ringOn.outlineWidth,
      }
    })
    if (stop === null) break // past the last control: focus leaves the document
    expect(stop, `stop ${i + 1} (${stop.what})`).toMatchObject({ style: 'solid', color: BRASS, width: '2px' })
    seen.push(stop.what)
  }
  expect(seen.length, 'the walk reaches controls').toBeGreaterThan(0)
}

const SCREENS = [
  { name: 'Tonight', path: '/tonight' },
  { name: 'Tonight under a family', path: '/tonight?family=sour' },
  { name: 'the Shelf', path: '/shelf' },
  { name: 'the classics', path: '/first-pours' },
  { name: 'the Index', path: '/drinks' },
  { name: 'the Index under a family', path: '/drinks?family=spirit-forward' },
  { name: 'a recipe', path: '/drinks/negroni-1' },
  { name: 'a recipe held through a brand', path: '/drinks/penicillin-1' },
]

test.describe('a working bar', () => {
  test.use({
    world: (() => {
      const w = defaultWorld()
      w.list = [I.campari, I.tequila]
      w.favorites = [w.cocktails.find((c) => c.name === 'Negroni')!.id]
      return w
    })(),
  })

  for (const s of SCREENS) {
    test(`${s.name}: axe finds nothing`, async ({ page }) => {
      await page.goto(s.path)
      await settled(page)
      await noViolations(page)
    })

    test(`${s.name}: every Tab stop wears the brass ring`, async ({ page }) => {
      await page.goto(s.path)
      await settled(page)
      await tabWalk(page)
    })
  }

  test('Index search results: axe finds nothing', async ({ page }) => {
    await page.goto('/drinks')
    await settled(page)
    await page.getByRole('searchbox', { name: 'Find a drink' }).fill('ma')
    await expect(page.getByRole('link', { name: /Margarita/ })).toBeVisible()
    await noViolations(page)
  })
})

test.describe('a bare bar', () => {
  test.use({ world: bareWorld() })
  for (const path of ['/tonight', '/shelf', '/drinks?fav=1']) {
    test(`${path}: its empty states pass axe`, async ({ page }) => {
      await page.goto(path)
      await settled(page)
      await noViolations(page)
    })
  }
})

test.describe('the bar out of reach', () => {
  test('Tonight with the stamped snapshot passes axe', async ({ page, bar }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'barback:list-snapshot',
        JSON.stringify({ at: new Date(Date.now() - 3_600_000).toISOString(), names: ['Campari', 'Tequila'] }),
      )
    })
    bar.takeApiDown()
    await page.goto('/tonight')
    await expect(page.getByText(/^Offline — the list as it stood/)).toBeVisible()
    await noViolations(page)
  })

  for (const path of ['/shelf', '/drinks', '/first-pours', '/drinks/negroni-1']) {
    test(`${path} in the error voice passes axe`, async ({ page, bar }) => {
      bar.takeApiDown()
      await page.goto(path)
      await expect(page.getByRole('alert')).toBeVisible()
      await noViolations(page)
    })
  }
})

test.describe('signed out', () => {
  test.use({ signedIn: false, world: bareWorld() })
  test('the door: axe finds nothing, and the form is walked in order', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await noViolations(page)
    await tabWalk(page, 5)
  })
})
