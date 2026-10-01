import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { Zap } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setError(error);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-page dark:bg-surface-darkpage px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="h-9 w-9 rounded-lg bg-series-1 flex items-center justify-center">
            <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold">EV Charging Dashboard</span>
        </div>

        {!isSupabaseConfigured && (
          <div className="card p-4 mb-4 text-sm text-status-serious border-status-serious/30">
            Supabase isn't configured yet. Set <code className="tabular">VITE_SUPABASE_URL</code> and{' '}
            <code className="tabular">VITE_SUPABASE_ANON_KEY</code> in your <code>.env</code> file (see{' '}
            <code>.env.example</code>), then create an admin user in Supabase Auth → Users.
          </div>
        )}

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label mb-1 block">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="admin@example.com" />
          </div>
          <div>
            <label className="label mb-1 block">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-status-critical">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full justify-center">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-xs text-ink-muted text-center mt-4">
          Admin logins are created in Supabase → Authentication → Users. See README.md for setup steps.
        </p>
      </div>
    </div>
  );
}
