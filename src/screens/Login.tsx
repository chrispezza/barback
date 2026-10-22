import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { isApiError, login } from '../api/client';
import { safeNext } from '../auth';
import { ErrorLine } from '../components/ErrorLine';

type LoginFailure = 'credentials' | 'throttled' | 'no-answer';

const FAILURE_LINES: Record<Exclude<LoginFailure, 'no-answer'>, string> = {
  credentials: 'That login did not take — check the email and password.',
  throttled: 'Too many tries — wait a minute, then log in again.',
};

/**
 * Why the login did not take. Upstream answers bad credentials with 400 (422
 * when a field fails validation) and throttles the sixth attempt a minute with
 * 429 (routes/api.php:60, RouteServiceProvider.php:64). No answer at all, or a
 * 5xx from the server or the proxy in front of it (deploy/nginx.conf), is the
 * bar not answering — never a reason to doubt the password.
 */
function loginFailure(e: unknown): LoginFailure {
  if (!isApiError(e) || e.status >= 500) return 'no-answer';
  if (e.status === 429) return 'throttled';
  return 'credentials';
}

export function Login() {
  const { route, query } = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const next = safeNext(query['next']);
  const sessionEnded = query['reason'] === 'expired';

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setFailure(null);
    // Only the login is tried here. Going on to `next` comes after, so a fault
    // in navigating is never reported as a login that did not take.
    try {
      await login(email, password);
    } catch (err) {
      setFailure(loginFailure(err));
      return;
    } finally {
      setIsSubmitting(false);
    }
    route(next);
  }

  return (
    <main class="screen">
      <form class="login-form" onSubmit={onSubmit}>
        <h1>Barback</h1>
        {sessionEnded && (
          <p class="recipe-aside">The session ended — log in to pick up where you were.</p>
        )}
        <label>
          Email
          <input
            type="email"
            name="email"
            autocomplete="email"
            inputMode="email"
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autocomplete="current-password"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
            required
          />
        </label>
        {/* A real submit button: Return in either field logs in (DS Button rev. 2). */}
        <Button type="submit" disabled={isSubmitting}>
          Log in
        </Button>
        {failure === 'no-answer' ? (
          <ErrorLine />
        ) : (
          failure !== null && (
            <p class="login-error" role="alert">
              {FAILURE_LINES[failure]}
            </p>
          )
        )}
      </form>
    </main>
  );
}
