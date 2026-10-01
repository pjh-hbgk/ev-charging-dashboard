import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT-REF'));

// When Supabase isn't configured yet (e.g. first run before the admin has
// created a project), we still create a client pointing at a harmless
// placeholder so imports don't crash — every call site should check
// `isSupabaseConfigured` (see src/lib/api/*) and surface a clear setup
// prompt instead of a raw network error.
export const supabase = createClient(
  isSupabaseConfigured ? url : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? anonKey : 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
