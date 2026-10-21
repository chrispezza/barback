import { test as base, expect, type Page } from '@playwright/test'
import { defaultWorld, type WorldSeed } from '../../test/fixtures/world'
import { FakeBar, ISSUED_TOKEN } from './fake-bar'

// ADR-011: every spec gets a fake Bar Assistant behind route interception.
// `world` is overridable per spec (`test.use({ world: bareWorld() })`), the
// page starts signed in unless `signedIn` is false, and a request under /bar/
// or /search/ that the fake does not answer — or any request that would leave
// the preview server — fails the spec at teardown.

interface Fixtures {
  world: WorldSeed
  signedIn: boolean
  bar: FakeBar
}

export const test = base.extend<Fixtures>({
  world: [defaultWorld(), { option: true }],
  signedIn: [true, { option: true }],
  // Auto: a spec that never names `bar` still runs against the fake, never
  // against whatever the preview server would answer.
  bar: [
    async ({ page, world, signedIn, baseURL }, use) => {
      const bar = new FakeBar(structuredClone(world))
      await bar.install(page, baseURL ?? '')
      if (signedIn) await signIn(page)
      await use(bar)
      expect(bar.unhandled, 'requests the fixtures did not answer').toEqual([])
      expect(bar.escaped, 'requests that tried to leave the preview server').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/**
 * Seed the token the fake issues, as the login screen would have stored it —
 * once per tab, so a spec that logs out and reloads stays logged out.
 */
export async function signIn(page: Page): Promise<void> {
  await page.addInitScript((token) => {
    if (window.sessionStorage.getItem('e2e.seeded')) return
    window.sessionStorage.setItem('e2e.seeded', '1')
    window.localStorage.setItem('barback.token', token)
  }, ISSUED_TOKEN)
}
