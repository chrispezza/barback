import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, isApiError } from './client'

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

  it('are not confused with any other Error', () => {
    expect(isApiError(new Error('API 500 on /x'))).toBe(false)
    expect(isApiError(Object.assign(new Error('x'), { name: 'ApiError' }))).toBe(false)
    expect(isApiError({ name: 'ApiError', status: 500 })).toBe(false)
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
