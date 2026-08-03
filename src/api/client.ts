import { clearToken, getToken, setToken } from '../auth';

// ADR-005: multi-origin only until the reverse proxy lands — keep the base
// swappable and never bake absolute URLs deeper than this module.
const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  barId?: number;
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
    clearToken();
    window.location.assign('/login');
    throw new Error('unauthenticated');
  }
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string): Promise<void> {
  const res = await api<{ data: { token: string } }>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  setToken(res.data.token);
}
