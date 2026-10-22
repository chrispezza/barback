import { afterEach, describe, expect, it, vi } from 'vitest'
import { MutationObserver, QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query'
import { api, isApiError, login, queryDefaults } from './client'

// api() errors carry what the bar answered (status, upstream `message`) so a
// screen can say why, while the Error message callers already see is unchanged.

function respond(status: number, body: string, contentType = 'application/json') {
  return vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': contentType } }))
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('expected the call to reject')
}

afterEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('api() errors', () => {
  it('carry the status and the upstream message, under the message callers already see', async () => {
    // throttle:login (routes/api.php:60) renders Laravel's JSON error shape.
    vi.stubGlobal('fetch', respond(429, JSON.stringify({ message: 'Too Many Attempts.' })))
    const e = await rejection(api('/auth/login', { method: 'POST', body: {} }))
    expect(isApiError(e)).toBe(true)
    if (!isApiError(e)) return
    expect(e).toBeInstanceOf(Error)
    expect(e.status).toBe(429)
    expect(e.upstreamMessage).toBe('Too Many Attempts.')
    expect(e.message).toBe('API 429 on /auth/login')
  })

  it('carry the status alone when the body is not upstream JSON', async () => {
    // nginx answers for a missing API container with its own HTML page.
    vi.stubGlobal('fetch', respond(502, '<html><body>502 Bad Gateway</body></html>', 'text/html'))
    const e = await rejection(api('/auth/login', { method: 'POST', body: {} }))
    expect(isApiError(e) && e.status).toBe(502)
    expect(isApiError(e) && e.upstreamMessage).toBeNull()
  })

  it('carry a 4xx with its upstream message', async () => {
    const message = 'Unable to authenticate. Check your login credentials and try again.'
    vi.stubGlobal('fetch', respond(400, JSON.stringify({ message })))
    const e = await rejection(api('/auth/login', { method: 'POST', body: {} }))
    expect(isApiError(e) && e.status).toBe(400)
    expect(isApiError(e) && e.upstreamMessage).toBe(message)
  })

  it('leave a connection that never answered as fetch rejected it', async () => {
    const dropped = new TypeError('Failed to fetch')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(dropped)))
    const e = await rejection(api('/profile'))
    expect(e).toBe(dropped)
    expect(isApiError(e)).toBe(false)
  })

  it('still end the session on 401, keeping the place, and say 401', async () => {
    window.localStorage.setItem('barback.token', 'stale')
    window.history.replaceState(null, '', '/shelf?x=1')
    vi.stubGlobal('fetch', respond(401, JSON.stringify({ message: 'Unauthenticated.' })))
    const e = await rejection(api('/profile'))
    expect(isApiError(e) && e.status).toBe(401)
    expect(e instanceof Error && e.message).toBe('unauthenticated')
    expect(window.localStorage.getItem('barback.token')).toBeNull()
    expect(window.location.pathname + window.location.search).toBe(
      `/login?reason=expired&next=${encodeURIComponent('/shelf?x=1')}`,
    )
  })

  it('end the session once on a burst of 401s, keeping the first place', async () => {
    // Opening the app on a stale token: the bootstrap's /profile and /bars
    // are in flight together and both 401.
    window.localStorage.setItem('barback.token', 'stale')
    window.history.replaceState(null, '', '/tonight')
    const before = window.history.length
    vi.stubGlobal('fetch', respond(401, JSON.stringify({ message: 'Unauthenticated.' })))
    const errors = await Promise.all([rejection(api('/profile')), rejection(api('/bars'))])
    for (const e of errors) expect(isApiError(e) && e.status).toBe(401)
    expect(window.location.pathname + window.location.search).toBe(
      `/login?reason=expired&next=${encodeURIComponent('/tonight')}`,
    )
    // One step onto the door, not one per refused call.
    expect(window.history.length).toBe(before + 1)
  })

  it('leave the door as it is when a 401 answers there', async () => {
    window.history.replaceState(null, '', '/login?reason=expired&next=%2Fshelf')
    const before = window.history.length
    vi.stubGlobal('fetch', respond(401, JSON.stringify({ message: 'Unauthenticated.' })))
    const e = await rejection(api('/profile'))
    expect(isApiError(e) && e.status).toBe(401)
    expect(window.location.pathname + window.location.search).toBe('/login?reason=expired&next=%2Fshelf')
    expect(window.history.length).toBe(before)
  })

  it('are not confused with any other Error', () => {
    expect(isApiError(new Error('API 500 on /x'))).toBe(false)
    expect(isApiError(Object.assign(new Error('x'), { name: 'ApiError' }))).toBe(false)
    expect(isApiError({ name: 'ApiError', status: 500 })).toBe(false)
  })
})

// A call goes out on the token held when it was sent, and the bar can answer
// it after the user has logged in again: the bootstrap's /profile and /bars on
// a stale token, one refused at once and one slow. Upstream's Sanctum guard
// judges each call by the token it carried (the 401 in
// e2e/support/fake-bar.ts), so that late refusal is about the old token, not
// the one the fresh login stored. The journey is e2e/x-stale-token-401.spec.ts.
describe('a 401 answered after a fresh login, on the token it replaced', () => {
  let client: QueryClient | undefined

  afterEach(() => {
    client?.unmount()
    client?.clear()
    client = undefined
  })

  /**
   * A bar that honours one token. Its first answer to anything but the login
   * waits until the test lets it go; the login issues the honoured token.
   * Every call is kept as "path Authorization".
   */
  function slowFirstAnswer(honoured: string) {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const sent: string[] = []
    const json = { 'Content-Type': 'application/json' }
    const fetch = vi.fn(async (input: string, init?: RequestInit) => {
      const path = new URL(input, 'http://localhost').pathname.replace(/^\/api/, '')
      const auth = new Headers(init?.headers).get('Authorization')
      sent.push(`${path} ${auth ?? 'none'}`)
      if (path === '/auth/login') {
        return new Response(JSON.stringify({ data: { token: honoured } }), { status: 200, headers: json })
      }
      if (sent.filter((s) => !s.startsWith('/auth/login ')).length === 1) await held
      return auth === `Bearer ${honoured}`
        ? new Response(JSON.stringify({ data: [] }), { status: 200, headers: json })
        : new Response(JSON.stringify({ message: 'Unauthenticated.' }), { status: 401, headers: json })
    })
    vi.stubGlobal('fetch', fetch)
    return { sent, release: () => release() }
  }

  it('leave the new token stored and the user where they are', async () => {
    window.localStorage.setItem('barback.token', 'old')
    window.history.replaceState(null, '', '/tonight')
    const before = window.history.length
    const bar = slowFirstAnswer('new')

    const call = rejection(api('/bars'))
    await vi.waitFor(() => expect(bar.sent).toEqual(['/bars Bearer old']))
    await login('owner@example.com', 'secret')
    expect(window.localStorage.getItem('barback.token')).toBe('new')
    bar.release()

    // The caller still hears the refusal; the session it ended is already gone.
    const e = await call
    expect(isApiError(e) && e.status).toBe(401)
    expect(window.localStorage.getItem('barback.token')).toBe('new')
    expect(window.location.pathname + window.location.search).toBe('/tonight')
    expect(window.history.length).toBe(before)
  })

  it('let the app’s read ask again on the new token and settle', async () => {
    window.localStorage.setItem('barback.token', 'old')
    window.history.replaceState(null, '', '/tonight')
    const bar = slowFirstAnswer('new')
    client = new QueryClient({ defaultOptions: queryDefaults })
    client.mount()
    const observer = new QueryObserver(client, { queryKey: ['bars'], queryFn: () => api('/bars') })
    const unsubscribe = observer.subscribe(() => {})

    await vi.waitFor(() => expect(bar.sent).toEqual(['/bars Bearer old']))
    await login('owner@example.com', 'secret')
    bar.release()

    // The app's one retry goes out on whatever token is held by then.
    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('success'), { timeout: 3000 })
    expect(bar.sent.at(-1)).toBe('/bars Bearer new')
    expect(window.localStorage.getItem('barback.token')).toBe('new')
    expect(window.location.pathname + window.location.search).toBe('/tonight')
    unsubscribe()
  })

  it('still end the session, keeping the place, when the token is gone rather than replaced', async () => {
    // Another tab's refusal cleared the token both tabs share (localStorage)
    // while this tab's call was out. No login replaced it: the session is over.
    window.localStorage.setItem('barback.token', 'old')
    window.history.replaceState(null, '', '/shelf?x=1')
    const bar = slowFirstAnswer('new')

    const call = rejection(api('/shelf'))
    await vi.waitFor(() => expect(bar.sent).toEqual(['/shelf Bearer old']))
    window.localStorage.removeItem('barback.token')
    bar.release()

    const e = await call
    expect(isApiError(e) && e.status).toBe(401)
    expect(window.localStorage.getItem('barback.token')).toBeNull()
    expect(window.location.pathname + window.location.search).toBe(
      `/login?reason=expired&next=${encodeURIComponent('/shelf?x=1')}`,
    )
  })
})

describe('api() answers', () => {
  it('return the parsed body on success and undefined on 204', async () => {
    vi.stubGlobal('fetch', respond(200, JSON.stringify({ data: { id: 1 } })))
    await expect(api('/profile')).resolves.toEqual({ data: { id: 1 } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    await expect(api('/users/1/ingredients/batch-store', { method: 'POST', body: {} })).resolves.toBeUndefined()
  })
})

// The app's QueryClient defaults (src/app.tsx) with the device offline: the
// browser has said so, and fetch rejects as it does with no network. ADR-007:
// screens that need the API "say so in the error voice", and "mutations
// require connectivity" with no outbox. TanStack's default networkMode holds
// both instead. The screens are driven in e2e/x-offline-device.spec.ts.
describe('with the device offline, the app’s calls', () => {
  let client: QueryClient | undefined

  afterEach(() => {
    client?.unmount()
    client?.clear()
    client = undefined
    onlineManager.setOnline(true)
  })

  /** The app's client, mounted so it hears the device come back online. */
  function appClient(): QueryClient {
    client = new QueryClient({ defaultOptions: queryDefaults })
    client.mount()
    return client
  }

  /** No network: every fetch rejects as the browser's does. */
  function noNetwork() {
    const fetch = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')))
    vi.stubGlobal('fetch', fetch)
    onlineManager.setOnline(false)
    return fetch
  }

  it('fail a read after its one retry, never hold it, and ask it again on reconnect', async () => {
    const fetch = noNetwork()
    const observer = new QueryObserver(appClient(), {
      queryKey: ['shopping-list', 1],
      queryFn: () => api('/users/1/shopping-list', { barId: 1 }),
    })
    const seen: string[] = []
    const unsubscribe = observer.subscribe((r) => seen.push(r.fetchStatus))

    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('error'), { timeout: 3000 })
    // Asked, and asked once more: the error line's read, not a held one.
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(seen).not.toContain('paused')

    // The device comes back: the read that failed is asked again by itself.
    const answer = respond(200, JSON.stringify({ data: [] }))
    vi.stubGlobal('fetch', answer)
    onlineManager.setOnline(true)
    await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe('success'))
    expect(answer).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('try a write once, fail it to its own onError, and send nothing on reconnect', async () => {
    const fetch = noNetwork()
    const queryClient = appClient()
    const onError = vi.fn()
    const observer = new MutationObserver(queryClient, {
      mutationFn: ({ id }: { id: number }) =>
        api('/users/1/shopping-list/batch-delete', { method: 'POST', barId: 1, body: { ingredients: [{ id }] } }),
      onError,
    })

    const done = observer.mutate({ id: 3 }).then(
      () => 'taken',
      () => 'refused',
    )
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1), { timeout: 1000 })
    expect(await done).toBe('refused')
    expect(onError).toHaveBeenCalledTimes(1)

    // The device comes back: nothing was held, so nothing goes out.
    onlineManager.setOnline(true)
    await queryClient.resumePausedMutations()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(queryClient.getMutationCache().getAll().some((m) => m.state.isPaused)).toBe(false)
  })
})
