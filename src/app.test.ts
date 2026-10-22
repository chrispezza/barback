import { describe, expect, it } from 'vitest'
import { isScreen } from './app'

// isScreen is how RouteEffects reads the route table: a path a screen answers
// is named and, after a route change, focused; any other path lands on Tonight
// (Landing) and is neither, so landing at "/" is part of the page load. It has
// to read the table as preact-iso's Router does: segment by segment, exact
// and case-sensitive, a `:slug` taking any one segment, nothing left over.
// RouteEffects gets the Router's path, trailing slashes already dropped.

describe('isScreen', () => {
  it.each(['/login', '/tonight', '/shelf', '/drinks', '/first-pours', '/drinks/daiquiri-1', '/drinks/old%20pal-2'])(
    'a screen answers %s',
    (path) => {
      expect(isScreen(path)).toBe(true)
    },
  )

  it.each(['/', '/tonite', '/Tonight', '/drinks/daiquiri-1/notes', '/shelf/gin', '/login/again', '/index.html'])(
    'no screen answers %s',
    (path) => {
      expect(isScreen(path)).toBe(false)
    },
  )
})
