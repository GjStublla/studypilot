// Supabase client factory for Edge Functions.
//
// The correct pattern for Edge Function auth:
// - Use ANON KEY + user JWT to verify identity (auth.getUser())
// - Use SERVICE ROLE KEY for privileged DB writes after verification
//
// Using the service role key for getUser() causes 401 errors because
// the SDK behaves differently depending on which key it was initialized with.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

export interface EdgeClients {
  /** Anon client scoped to the user's JWT — use for auth.getUser() */
  authClient: SupabaseClient
  /** Service role client — use for all DB operations after auth is verified */
  db: SupabaseClient
  /** The verified user (set after calling verifyRequest) */
  user?: { id: string; email?: string }
}

/**
 * Create the two Supabase clients needed by every Edge Function.
 * Returns null for authClient/db if env vars are missing.
 */
export function createEdgeClients(authHeader: string): EdgeClients {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  // Auth client: anon key + user JWT — getUser() works correctly here
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // DB client: service role key — for reading/writing any row regardless of RLS
  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return { authClient, db }
}

/**
 * Verify the request's JWT and return the user.
 * Returns null if the token is missing, invalid, or expired.
 */
export async function verifyRequest(
  req: Request,
): Promise<{ user: { id: string; email?: string | null }; db: SupabaseClient } | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const accessToken = authHeader.slice('Bearer '.length).trim()
  if (!accessToken) return null

  const { authClient, db } = createEdgeClients(authHeader)

  // This repository pins supabase-js 2.38. With persistSession disabled,
  // getUser() without an explicit JWT reports "Auth session missing" even
  // though the PostgREST client has a global Authorization header.
  const { data: { user }, error } = await authClient.auth.getUser(accessToken)
  if (error || !user) return null

  return { user, db }
}
