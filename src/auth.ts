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

/** Only same-origin paths may be a post-login destination. */
export function safeNext(next: string | undefined): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
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
