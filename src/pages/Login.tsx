import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { session, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: err } = await signIn(email, password);
    setSubmitting(false);
    if (err) {
      setError(err);
    } else {
      // Don't rely solely on the auth-context re-render to trigger the <Navigate> above —
      // explicitly push to the dashboard as soon as sign-in succeeds.
      navigate('/', { replace: true });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page dark:bg-surface-darkpage px-4">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm p-6 space-y-4">
        <div>
          <div className="text-xl font-semibold">⚡ EV Charging Dashboard</div>
          <div className="text-sm text-ink-muted">Sign in to continue</div>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{error}</div>}
        <div className="space-y-1">
          <label className="text-sm font-medium">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn-primary w-full" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
