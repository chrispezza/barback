import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { login } from '../api/client';
import { safeNext } from '../auth';

export function Login() {
  const { route, query } = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const next = safeNext(query['next']);
  const sessionEnded = query['reason'] === 'expired';

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      route(next);
    } catch {
      setError('That login did not take — check the email and password.');
    } finally {
      setIsSubmitting(false);
    }
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
        {error && (
          <p class="login-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
