import type { Page } from '@playwright/test'
import { ISSUED_TOKEN } from './support/fake-bar'
import { expect, test } from './support/test'

// Login (/login) and the auth shell, against docs/spec/frontend-spec.md:
// §1 (Auth: token acquisition), §2 (bootstrap: POST /auth/login, then
// /profile; every call after it carries the token), §6 (family selection lives
// in the URL, so the door has to hand the whole URL back) and §9 (nav role
// hints, brand mark links home). §5's rules do not touch this screen.
//
// Not asserted here, because the code diverges from the spec (reported with
// this PR, or tracked elsewhere): the 429 and network-failure lines on the
// login form; which bar the bootstrap reads (chrispezza/barback#25); a 401
// burst, where every in-flight call 401s and each one re-wraps `next` around
// the door itself; and a `next` the URL parser resolves off-origin ("/\host",
// "/\t/host"), which logs in but reports the credentials line.

const TOKEN_KEY = 'barback.token'
const SESSION_ENDED = 'The session ended — log in to pick up where you were.'

/** At the door: /login with exactly this `next` (and `reason`, when given). */
function atDoor(next: string | null, reason: string | null = null) {
  return (url: URL) =>
    url.pathname === '/login' && url.searchParams.get('next') === next && url.searchParams.get('reason') === reason
}

/** Back on an app route: this pathname and search, nothing of the door left in it. */
function at(pathAndQuery: string) {
  return (url: URL) => url.pathname + url.search === pathAndQuery
}

async function fillCredentials(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
}

function storedToken(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), TOKEN_KEY)
}

/** The visible main nav: the rail on desktop, the tab bar on a phone. */
function mainNav(page: Page) {
  return page.getByRole('navigation', { name: 'Main' })
}

test.describe('signed out', () => {
  test.use({ signedIn: false })

  // §1: every app route is behind the door, and the door remembers the route.
  for (const route of ['/tonight', '/shelf', '/first-pours', '/drinks', '/drinks/daiquiri-1', '/drinks?family=sour']) {
    test(`${route} sends the visitor to the door with next set to it`, async ({ page, bar }) => {
      await page.goto(route)
      await expect(page).toHaveURL(atDoor(route))
      await expect(page.getByRole('heading', { level: 1, name: 'Barback' })).toBeVisible()
      await expect(page.getByLabel('Email')).toBeVisible()
      await expect(page.getByLabel('Password')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible()
      // The shell is the signed-in app; the door stands alone.
      await expect(mainNav(page)).toHaveCount(0)
      await expect(page.getByText(SESSION_ENDED)).toHaveCount(0)
      // §2: no request goes out without a token.
      expect(bar.calls()).toEqual([])
    })
  }

  test('§2 bootstrap: the login posts the credentials, stores the token, and every later call carries it', async ({
    page,
    bar,
    world,
  }) => {
    const sent: { method: string; path: string; headers: Record<string, string> }[] = []
    page.on('request', (r) => {
      const url = new URL(r.url())
      if (url.pathname.startsWith('/bar/api/')) {
        sent.push({ method: r.method(), path: url.pathname.slice('/bar/api'.length), headers: r.headers() })
      }
    })

    await page.goto('/tonight')
    await fillCredentials(page, world.user.email, world.user.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(at('/tonight'))
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
    await expect(page.locator('.bar-status')).toContainText('You can pour')

    const logins = bar.calls('POST', /^\/auth\/login$/)
    expect(logins).toHaveLength(1)
    expect(logins[0]?.body).toEqual({ email: world.user.email, password: world.user.password })
    expect(await storedToken(page)).toBe(ISSUED_TOKEN)

    // POST /auth/login first, then GET /profile for the user id.
    const order = bar.calls().map((r) => `${r.method} ${r.path}`)
    expect(order[0]).toBe('POST /auth/login')
    expect(order).toContain('GET /profile')

    const [loginSent, ...rest] = sent
    expect(loginSent?.path).toBe('/auth/login')
    expect(loginSent?.headers['accept']).toBe('application/json')
    expect(loginSent?.headers['authorization']).toBeUndefined()
    expect(rest.length).toBeGreaterThan(0)
    for (const r of rest) {
      expect(r.headers['authorization'], `${r.method} ${r.path}`).toBe(`Bearer ${ISSUED_TOKEN}`)
      expect(r.headers['accept'], `${r.method} ${r.path}`).toBe('application/json')
    }
    // Bar-scoped calls name the bar (upstream EnsureRequestHasBarQuery).
    const barScoped = rest.filter((r) => /^\/(tags|ingredients|cocktails|users|bars\/\d+)(\/|$)/.test(r.path))
    expect(barScoped.length).toBeGreaterThan(0)
    for (const r of barScoped) {
      expect(r.headers['bar-assistant-bar-id'], `${r.method} ${r.path}`).toBe(String(world.barId))
    }
  })

  test('logging in returns to the route that sent them, query and all (§6: the family lives in the URL)', async ({
    page,
    world,
  }) => {
    await page.goto('/drinks?family=sour')
    await expect(page).toHaveURL(atDoor('/drinks?family=sour'))
    await fillCredentials(page, world.user.email, world.user.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(at('/drinks?family=sour'))
    await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
    await expect(page.getByText('Spirit brightened by citrus, balanced by sweet.')).toBeVisible()
  })

  test('logging in returns to a recipe deep link', async ({ page, world }) => {
    await page.goto('/drinks/daiquiri-1')
    await expect(page).toHaveURL(atDoor('/drinks/daiquiri-1'))
    await fillCredentials(page, world.user.email, world.user.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(at('/drinks/daiquiri-1'))
    await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toBeVisible()
  })

  test('Return in the password field logs in', async ({ page, world }) => {
    await page.goto('/shelf')
    await fillCredentials(page, world.user.email, world.user.password)
    await page.getByLabel('Password').press('Enter')
    await expect(page).toHaveURL(at('/shelf'))
    await expect(page.getByRole('heading', { level: 1, name: 'Shelf' })).toBeVisible()
  })

  test('§7: the form is keyboard-operable, field to field to the button', async ({ page, world }) => {
    await page.goto('/first-pours')
    await expect(page.getByLabel('Email')).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Email')).toBeFocused()
    await page.keyboard.type(world.user.email)
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Password')).toBeFocused()
    await page.keyboard.type(world.user.password)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Log in' })).toBeFocused()
    await page.keyboard.press('Space')
    await expect(page).toHaveURL(at('/first-pours'))
    await expect(page.getByRole('heading', { level: 1, name: 'The classics' })).toBeVisible()
  })

  // safeNext: only a same-origin path is a destination; anything else lands on Tonight.
  for (const next of ['//evil.example', '//evil.example/tonight', 'https://evil.example/', 'javascript:alert(1)', 'tonight']) {
    test(`a next of ${next} is ignored and logging in lands on /tonight`, async ({ page, world, baseURL }) => {
      await page.goto(`/login?next=${encodeURIComponent(next)}`)
      await fillCredentials(page, world.user.email, world.user.password)
      await page.getByRole('button', { name: 'Log in' }).click()
      await expect(page).toHaveURL(at('/tonight'))
      expect(new URL(page.url()).origin).toBe(new URL(baseURL ?? '').origin)
      await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
    })
  }

  test('wrong credentials show the credentials line, keep the visitor at the door, and store nothing', async ({
    page,
    bar,
    world,
  }) => {
    await page.goto('/shelf')
    await fillCredentials(page, world.user.email, 'not-the-password')
    await page.getByRole('button', { name: 'Log in' }).click()

    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('check the email and password')
    await expect(page).toHaveURL(atDoor('/shelf'))
    expect(await storedToken(page)).toBeNull()
    expect(bar.calls().map((r) => `${r.method} ${r.path}`)).toEqual(['POST /auth/login'])
    // The form is still the form: nothing was cleared out from under them.
    await expect(page.getByLabel('Email')).toHaveValue(world.user.email)

    // Corrected, the same form logs in and goes where they were headed.
    await page.getByLabel('Password').fill(world.user.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(at('/shelf'))
    await expect(page.getByRole('heading', { level: 1, name: 'Shelf' })).toBeVisible()
  })
})

test.describe('signed in', () => {
  test('a 401 mid-use lands on the door with reason=expired and next, and logging in returns there', async ({
    page,
    bar,
    world,
  }) => {
    await page.goto('/tonight')
    await expect(page.locator('.bar-status')).toContainText('You can pour')

    // The token stops working between one screen and the next.
    bar.fail(/^\/cocktails$/, { method: 'GET', status: 401 })
    await mainNav(page).getByRole('link', { name: /^Drinks/ }).click()

    await expect(page).toHaveURL(atDoor('/drinks', 'expired'))
    await expect(page.getByText(SESSION_ENDED)).toBeVisible()
    await expect(mainNav(page)).toHaveCount(0)
    expect(await storedToken(page)).toBeNull()

    await fillCredentials(page, world.user.email, world.user.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(at('/drinks'))
    await expect(page.getByRole('heading', { level: 1, name: 'Drinks' })).toBeVisible()
    await expect(page.getByRole('link', { name: /^Daiquiri/ })).toBeVisible()
    expect(await storedToken(page)).toBe(ISSUED_TOKEN)
  })

  test('a 401 on a recipe keeps the recipe as the place to return to', async ({ page, bar, world }) => {
    await page.goto('/drinks')
    await expect(page.getByRole('link', { name: /^Daiquiri/ })).toBeVisible()

    bar.fail(/^\/cocktails\/daiquiri-1$/, { method: 'GET', status: 401 })
    await page.getByRole('link', { name: /^Daiquiri/ }).click()

    await expect(page).toHaveURL(atDoor('/drinks/daiquiri-1', 'expired'))
    await expect(page.getByText(SESSION_ENDED)).toBeVisible()

    await fillCredentials(page, world.user.email, world.user.password)
    await page.getByLabel('Password').press('Enter')
    await expect(page).toHaveURL(at('/drinks/daiquiri-1'))
    await expect(page.getByRole('heading', { level: 1, name: 'Daiquiri' })).toBeVisible()
  })

  test('Log out clears the token and returns to the door, and a reload stays logged out', async ({
    page,
    bar,
    isMobile,
  }) => {
    // The rail carries Log out on desktop; on a phone it sits at the end of Shelf.
    await page.goto(isMobile ? '/shelf' : '/tonight')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const logOut = isMobile
      ? page.getByRole('main').getByRole('button', { name: 'Log out' })
      : mainNav(page).getByRole('button', { name: 'Log out' })
    await logOut.click()

    await expect(page).toHaveURL(at('/login'))
    await expect(page.getByRole('heading', { level: 1, name: 'Barback' })).toBeVisible()
    await expect(page.getByText(SESSION_ENDED)).toHaveCount(0)
    await expect(mainNav(page)).toHaveCount(0)
    expect(await storedToken(page)).toBeNull()
    const callsAtLogout = bar.requests.length

    await page.reload()
    await expect(page).toHaveURL(at('/login'))
    await expect(page.getByLabel('Email')).toBeVisible()
    expect(await storedToken(page)).toBeNull()

    await page.goto('/tonight')
    await expect(page).toHaveURL(atDoor('/tonight'))
    // Logged out means quiet: nothing goes to the API without a token.
    expect(bar.requests.slice(callsAtLogout)).toEqual([])
  })

  test('logging back in after Log out reads the profile again rather than the dropped cache', async ({
    page,
    bar,
    world,
    isMobile,
  }) => {
    await page.goto(isMobile ? '/shelf' : '/tonight')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect.poll(() => bar.calls('GET', /^\/profile$/).length).toBe(1)
    const logOut = isMobile
      ? page.getByRole('main').getByRole('button', { name: 'Log out' })
      : mainNav(page).getByRole('button', { name: 'Log out' })
    await logOut.click()
    await expect(page).toHaveURL(at('/login'))

    await fillCredentials(page, world.user.email, world.user.password)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL(at('/tonight'))
    await expect(page.locator('.bar-status')).toContainText('You can pour')
    expect(bar.calls('GET', /^\/profile$/)).toHaveLength(2)
  })
})

// §9: nav role hints and the brand mark live in the desktop rail.
test.describe('desktop rail', () => {
  test.skip(({ isMobile }) => isMobile, 'the rail is the desktop nav; below 900px it is display: none')

  test('the rail names each screen with its role hint, marks the current one, and the brand mark goes home', async ({
    page,
  }) => {
    await page.goto('/shelf')
    const rail = mainNav(page)
    const hints: [RegExp, string, string][] = [
      [/^Tonight/, '/tonight', 'pour now'],
      [/^Shelf/, '/shelf', 'what you have'],
      [/^Classics/, '/first-pours', 'drinks to aim for'],
      [/^Drinks/, '/drinks', 'the full index'],
    ]
    for (const [name, href, hint] of hints) {
      const link = rail.getByRole('link', { name })
      await expect(link).toHaveAttribute('href', href)
      await expect(link).toContainText(hint)
    }
    await expect(rail.getByRole('link', { name: /^Shelf/ })).toHaveAttribute('aria-current', 'page')

    await rail.getByRole('link', { name: 'Barback', exact: true }).click()
    await expect(page).toHaveURL(at('/tonight'))
    await expect(page.getByRole('heading', { level: 1, name: 'Tonight' })).toBeVisible()
    await expect(rail.getByRole('link', { name: /^Tonight/ })).toHaveAttribute('aria-current', 'page')
  })
})

test.describe('phone tab bar', () => {
  test.skip(({ isMobile }) => !isMobile, 'the tab bar is the phone nav; from 900px it is display: none')

  test('the tab bar carries the four screens and marks the current one', async ({ page }) => {
    await page.goto('/drinks')
    const tabs = mainNav(page)
    await expect(tabs.getByRole('link')).toHaveText(['Tonight', 'Shelf', 'Classics', 'Drinks'])
    await expect(tabs.getByRole('link', { name: 'Drinks' })).toHaveAttribute('aria-current', 'page')
    await tabs.getByRole('link', { name: 'Classics' }).click()
    await expect(page).toHaveURL(at('/first-pours'))
    await expect(page.getByRole('heading', { level: 1, name: 'The classics' })).toBeVisible()
    await expect(tabs.getByRole('link', { name: 'Classics' })).toHaveAttribute('aria-current', 'page')
  })
})
