import type { Page } from '@playwright/test'
import { ISSUED_TOKEN } from './support/fake-bar'
import { expect, test } from './support/test'

// Where a login goes on to, against docs/spec/frontend-spec.md §1 (/login is
// token acquisition; the door remembers the route) and safeNext's contract in
// src/auth.ts: only a same-origin path is a destination. Each `next` below
// starts with a single "/" as written, but the WHATWG URL parser the browser
// navigates with reads a backslash in an http URL as a slash, strips tabs and
// newlines, and collapses dot segments — so each one resolves to, or hands on,
// //evil.example: another host. history.pushState refuses a cross-origin URL
// with a SecurityError. The login itself took, so it lands on Tonight with
// the token kept, and nothing on the screen blames the email and password or
// the bar.

const TOKEN_KEY = 'barback.token'

test.use({ signedIn: false })

/** Back on an app route: this pathname and search, nothing of the door left in it. */
function at(pathAndQuery: string) {
  return (url: URL) => url.pathname + url.search === pathAndQuery
}

function storedToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY)
}

const OFF_ORIGIN: [label: string, next: string][] = [
  ['a backslash', '/\\evil.example'],
  ['a backslash and a path', '/\\evil.example/tonight'],
  ['a tab', '/\t/evil.example'],
  ['a newline', '/\n/evil.example'],
  ['dot segments that collapse to //', '/.//evil.example'],
]

for (const [label, next] of OFF_ORIGIN) {
  test(`a next that reads as another host through ${label} logs in to /tonight and blames nothing`, async ({
    page,
    bar,
    world,
    baseURL,
  }) => {
    await page.goto(`/login?next=${encodeURIComponent(next)}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Barback' })).toBeVisible()
    await page.getByLabel('Email').fill(world.user.email)
    await page.getByLabel('Password').fill(world.user.password)
    const answered = page.waitForResponse((r) => new URL(r.url()).pathname === '/bar/api/auth/login')
    await page.getByRole('button', { name: 'Log in' }).click()
    expect((await answered).status()).toBe(200)

    // Wherever it settles, it never says the login did not take: it did.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tonight' }).or(page.getByRole('alert')).first(),
    ).toBeVisible()
    expect(await page.getByRole('alert').allTextContents()).toEqual([])

    await expect(page).toHaveURL(at('/tonight'))
    expect(new URL(page.url()).origin).toBe(new URL(baseURL ?? '').origin)
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
    await expect(page.locator('.bar-status')).toContainText('You can pour')
    expect(await storedToken(page)).toBe(ISSUED_TOKEN)
    expect(bar.calls('POST', /^\/auth\/login$/)).toHaveLength(1)
  })
}

// The same-origin paths the door hands back are unchanged: path and query as
// the 401 handler and the route guard wrote them.
for (const next of ['/shelf', '/drinks?family=sour', '/drinks/daiquiri-1']) {
  test(`a same-origin next of ${next} still logs in to it`, async ({ page, world }) => {
    await page.goto(`/login?next=${encodeURIComponent(next)}`)
    await page.getByLabel('Email').fill(world.user.email)
    await page.getByLabel('Password').fill(world.user.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(at(next))
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(await storedToken(page)).toBe(ISSUED_TOKEN)
  })
}
