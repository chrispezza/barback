import { clearToken, getToken, isDoor, navigateOutsideTree } from '../auth';

// ADR-005: multi-origin only until the reverse proxy lands — keep the base
// swappable and never bake absolute URLs deeper than this module.
const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  barId?: number;
}

/**
 * What api() throws when the bar answered with an error status: the status,
 * and upstream's `message` when the body carried one (Laravel's JSON error
 * shape, e.g. 429 "Too Many Attempts."). The Error's own message is unchanged,
 * so callers that only catch keep behaving as before. A connection that never
 * answered rejects with fetch's own error, untouched — that is not an ApiError.
 */
export interface ApiError extends Error {
  readonly name: 'ApiError';
  readonly status: number;
  readonly upstreamMessage: string | null;
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof Error && e.name === 'ApiError' && typeof (e as { status?: unknown }).status === 'number';
}

function apiError(message: string, status: number, upstreamMessage: string | null): ApiError {
  return Object.assign(new Error(message), { name: 'ApiError' as const, status, upstreamMessage });
}

/** Upstream's error `message`, or null when the body is not Laravel JSON (a proxy's 502 page). */
async function readUpstreamMessage(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
      return body.message;
    }
  } catch {
    // Not JSON — the status is all there is.
  }
  return null;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.barId !== undefined) headers['Bar-Assistant-Bar-Id'] = String(opts.barId);
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    // Session ended mid-use: keep their place and say so on the login screen,
    // rather than a hard reload onto a blank form. Calls in flight together
    // all 401 at once (the bootstrap's /profile and /bars on a stale token):
    // the first moves to the door, and the rest find it already there — taking
    // `next` from the location again would wrap the door into its own next.
    clearToken();
    if (!isDoor(window.location.pathname)) {
      const next = window.location.pathname + window.location.search;
      navigateOutsideTree(`/login?reason=expired&next=${encodeURIComponent(next)}`);
    }
    throw apiError('unauthenticated', res.status, null);
  }
  if (!res.ok) throw apiError(`API ${res.status} on ${path}`, res.status, await readUpstreamMessage(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<void> {
  const res = await api<{ data: { token: string } }>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  setTokenFromLogin(res.data.token);
}

function setTokenFromLogin(token: string): void {
  // Kept as a seam so a future refresh-token flow lands in one place.
  localStorage.setItem('barback.token', token);
}
