import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { login } from '../api/client';

export function Login() {
  const { route } = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      route('/tonight');
    } catch {
      setError('Login failed — check email and password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main class="screen">
      <h1>Barback</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
            required
          />
        </label>
        <button type="submit" disabled={isSubmitting}>
          Log in
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}
