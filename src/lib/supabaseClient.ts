// Supabase client for direct database access and Realtime subscriptions.
//
// Auth strategy: this client is shared by both auth paths:
//   - Google OAuth users: Supabase client session is set automatically after OAuth callback
//   - Email/password users: tokens live in localStorage (sp_access_token), managed by api.ts
//
// For email/password users we manually inject the stored access token so the
// client runs queries as the verified user and RLS works correctly.
// We call injectStoredToken() before any operation that needs auth via the helpers
// in studypilot-api.ts.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[StudyPilot] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
    'Copy .env.example to .env at the project root and fill in the values.',
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    // Persist the Supabase session so OAuth users stay logged in across page reloads.
    // Email/password users don't have a Supabase session — we use injectStoredToken()
    // to set the token from localStorage before each query.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // handled by supabase.ts (OAuth client)
  },
});

/**
 * Inject the FastAPI-managed access token into the Supabase client so that
 * email/password users can make RLS-scoped direct queries.
 *
 * Call this at the start of any function in studypilot-api.ts that queries
 * Supabase directly.  It is a no-op if the user is already authenticated
 * via Google OAuth (a real Supabase session already exists).
 */
export async function injectStoredToken(): Promise<boolean> {
  // If Supabase already has a valid session (OAuth user), nothing to do.
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return true;

  // Fall back to the token stored by the FastAPI auth flow.
  const token = localStorage.getItem('sp_access_token');
  const refreshToken = localStorage.getItem('sp_refresh_token');
  if (!token || !refreshToken) return false;

  // Set the session manually so PostgREST uses the user's JWT for RLS.
  const { error } = await supabase.auth.setSession({
    access_token: token,
    refresh_token: refreshToken,
  });

  if (!error) return true;

  // setSession failed — token is likely expired. Try refreshing it first
  // using the Supabase client, then update localStorage so api.ts stays in sync.
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (refreshError || !refreshed.session) return false;

  // Keep localStorage in sync so the FastAPI client (api.ts) also uses the new token
  try {
    localStorage.setItem('sp_access_token', refreshed.session.access_token);
    localStorage.setItem('sp_refresh_token', refreshed.session.refresh_token);
  } catch {
    /* localStorage unavailable */
  }

  return true;
}
