// Supabase browser client — used for OAuth flows only.
//
// All data fetching and auth token validation goes through the FastAPI backend
// (src/lib/api.ts). This client's sole job is to trigger the Google OAuth
// redirect and read the resulting session from the URL hash on the callback
// page — after which the tokens are handed off to storeAuth() and the app
// continues through its normal JWT-based flow.

import { createClient } from '@supabase/supabase-js';

// Keep OAuth-only imports safe before a developer creates `.env`. The Vite
// production gate rejects missing public values before bundling; this fallback
// only prevents module-load crashes in an unconfigured dev/test checkout.
const FALLBACK_SUPABASE_URL = 'https://missing-supabase.invalid';
const FALLBACK_SUPABASE_ANON_KEY = 'missing-public-anon-key';
const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const configuredSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const supabaseUrl = configuredSupabaseUrl || FALLBACK_SUPABASE_URL;
const supabaseAnonKey = configuredSupabaseAnonKey || FALLBACK_SUPABASE_ANON_KEY;

if (!configuredSupabaseUrl || !configuredSupabaseAnonKey) {
  // Log clearly in dev so the developer knows exactly what to do.
  // We don't throw here because that would crash the entire app — users
  // who only use email/password auth should still be able to log in.
  console.error(
    '[StudyPilot] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
    'Copy .env.example to .env at the project root and fill in the values.\n' +
    'Google sign-in will not work until these are set.',
  );
}

// The fallback keeps this OAuth-only client importable; requests still fail
// against the non-routable placeholder until public configuration is supplied.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // We manage session storage ourselves via storeAuth() / clearAuth()
    // in src/lib/api.ts. Disable Supabase's own localStorage persistence
    // so the two stores don't diverge.
    persistSession: false,
    autoRefreshToken: false,
    // Required: tells the SDK to parse the #access_token fragment that
    // Supabase appends to the redirect URL after Google auth completes.
    detectSessionInUrl: true,
    // Use a separate storage key so this OAuth-only client doesn't clash
    // with the data client in supabaseClient.ts.
    storageKey: 'sp-oauth-session',
  },
});
