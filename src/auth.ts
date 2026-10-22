const TOKEN_KEY = 'barback.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

const DOOR = '/login';

/**
 * Whether a path is the login screen itself, however it is written — with a
 * query or hash, a trailing slash or dot segments. Read the way the router
 * reads location: the resolved pathname, trailing slashes dropped (preact-iso).
 */
export function isDoor(path: string): boolean {
  try {
    return new URL(path, window.location.origin).pathname.replace(/\/+$/, '') === DOOR;
  } catch {
    return false;
  }
}

/**
 * Only same-origin paths may be a post-login destination, and never the door
 * itself: logging in there would land back on the login screen.
 */
export function safeNext(next: string | undefined): string {
  if (next && next.startsWith('/') && !next.startsWith('//') && !isDoor(next)) return next;
  return '/tonight';
}

/**
 * Client-side navigation from outside the component tree (the API layer):
 * pushState plus a synthetic popstate, which preact-iso's LocationProvider
 * treats like a back/forward — no full reload, no lost query cache.
 */
export function navigateOutsideTree(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
