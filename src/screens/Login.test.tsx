import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/preact'
import { LocationProvider } from 'preact-iso'
import { Login } from './Login'

// The login screen says why a login did not take (AuthController.php:67 for
// bad credentials, routes/api.php:60 for the throttle), and only blames the
// email and password when upstream did.

const CREDENTIALS = 'That login did not take — check the email and password.'
const WAIT = 'Too many tries — wait a minute, then log in again.'
const NO_ANSWER = 'The bar didn’t answer — try again.'

function answer(status: number, body: string, contentType = 'application/json') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': contentType } })),
  )
}

function logIn() {
  render(
    <LocationProvider>
      <Login />
    </LocationProvider>,
  )
  fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'admin@example.com' } })
  fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'password' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

/** The announced line, as a reader hears it (ErrorLine leaves a space for its Retry). */
async function alertText(): Promise<string> {
  return ((await screen.findByRole('alert')).textContent ?? '').trim()
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('Login failure lines', () => {
  it('blames the email and password for upstream’s 400', async () => {
    answer(400, JSON.stringify({ message: 'Unable to authenticate. Check your login credentials and try again.' }))
    logIn()
    expect(await alertText()).toBe(CREDENTIALS)
  })

  it('blames the email and password for a field that fails validation (422)', async () => {
    answer(422, JSON.stringify({ message: 'The email field must be a valid email address.', errors: {} }))
    logIn()
    expect(await alertText()).toBe(CREDENTIALS)
  })

  it('says to wait on the throttle’s 429', async () => {
    answer(429, JSON.stringify({ message: 'Too Many Attempts.' }))
    logIn()
    const line = await alertText()
    expect(line).toBe(WAIT)
    expect(line).not.toMatch(/password/)
  })

  it('says the bar did not answer when the connection drops', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    logIn()
    expect(await alertText()).toBe(NO_ANSWER)
  })

  it('says the bar did not answer on a 5xx, upstream or the proxy in front of it', async () => {
    answer(502, '<html><body>502 Bad Gateway</body></html>', 'text/html')
    logIn()
    expect(await alertText()).toBe(NO_ANSWER)
    cleanup()
    answer(500, JSON.stringify({ message: 'Server Error' }))
    logIn()
    expect(await alertText()).toBe(NO_ANSWER)
  })

  it('keeps the token and goes on to the next screen when the login takes', async () => {
    window.history.replaceState(null, '', '/login?next=%2Fshelf')
    answer(200, JSON.stringify({ data: { token: 'issued' } }))
    logIn()
    await vi.waitFor(() => expect(window.location.pathname).toBe('/shelf'))
    expect(window.localStorage.getItem('barback.token')).toBe('issued')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // "/\evil.example" resolves to //evil.example (a backslash reads as a slash
  // in an http URL): another host, which history.pushState refuses. The login
  // took, so it goes on to Tonight and blames nothing.
  it('goes on to Tonight, blaming nothing, when next resolves to another host', async () => {
    window.history.replaceState(null, '', `/login?next=${encodeURIComponent('/\\evil.example')}`)
    answer(200, JSON.stringify({ data: { token: 'issued' } }))
    logIn()
    await vi.waitFor(() => expect(window.location.pathname).toBe('/tonight'))
    expect(window.localStorage.getItem('barback.token')).toBe('issued')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
