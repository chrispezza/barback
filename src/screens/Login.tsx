import { useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Button } from '@ds/core/Button';
import { login } from '../api/client';

export function Login() {
  const { route } = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      route('/tonight');
    } catch {
      setError('That login did not take — check the email and password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main class="screen">
      <form ref={formRef} class="login-form" onSubmit={onSubmit}>
        <h1>Barback</h1>
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
        <Button disabled={isSubmitting} onClick={() => formRef.current?.requestSubmit()}>
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
