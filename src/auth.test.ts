import { describe, expect, it } from 'vitest'
import { safeNext } from './auth'

// safeNext decides where a login goes on to. Only a same-origin path is a
// destination, and the door itself never is: a next that names /login would
// log the visitor in and put them straight back on the login screen.

describe('safeNext', () => {
  it('keeps a same-origin app path, query and all', () => {
    for (const next of ['/tonight', '/shelf', '/drinks?family=sour', '/drinks/daiquiri-1', '/drinks?next=%2Flogin']) {
      expect(safeNext(next), next).toBe(next)
    }
  })

  it('sends anything without a same-origin path to Tonight', () => {
    for (const next of [undefined, '', 'tonight', '//evil.example', 'https://evil.example/']) {
      expect(safeNext(next), String(next)).toBe('/tonight')
    }
  })

  // The WHATWG URL parser reads a backslash in an http(s) URL as a slash and
  // strips tabs and newlines, so each of these starts with one "/" as written
  // and resolves to //evil.example: another host. history.pushState refuses it
  // with a SecurityError, after the token is already stored.
  it('sends a next the URL parser resolves to another host to Tonight', () => {
    for (const next of ['/\\evil.example', '/\\evil.example/tonight', '/\t/evil.example', '/\n/evil.example', '/\\/evil.example']) {
      expect(safeNext(next), JSON.stringify(next)).toBe('/tonight')
    }
  })

  // Dot segments can collapse to a path that starts "//": same origin as
  // written, but a string that would read as another host if handed on.
  it('never hands on a destination that reads as another host', () => {
    for (const next of ['/.//evil.example', '/..//evil.example', '/drinks/..//evil.example']) {
      expect(safeNext(next), next).toBe('/tonight')
    }
  })

  it('never sends a login back to the door, however the door is written', () => {
    for (const next of [
      '/login',
      '/login/',
      '/login?reason=expired',
      '/login?reason=expired&next=%2Ftonight',
      '/login?reason=expired&next=%2Flogin%3Freason%3Dexpired%26next%3D%252Ftonight',
      '/login#top',
    ]) {
      expect(safeNext(next), next).toBe('/tonight')
    }
  })
})
