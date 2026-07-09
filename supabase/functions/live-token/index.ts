/**
 * live-token — Supabase Edge Function
 *
 * Issues a short-lived ephemeral token for the Chrome extension to connect
 * directly to Gemini Live WebSocket. The GEMINI_API_KEY never leaves the
 * server — only the ephemeral token is returned to the client.
 *
 * Currently a stub: returns a placeholder UUID until the Gemini Live
 * ephemeral token API endpoint is available and tested.
 *
 * Input:  { sessionId?: string }
 * Output: { ephemeralToken: string, expiresAt: string }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    // ── Auth — use anon key + user JWT so getUser() identifies the user ──────
    // Passing the JWT via global.headers to a service-role client does NOT
    // work — the SDK ignores it and getUser() returns the service account.
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401)

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

    // ── Parse input ─────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const sessionId: string | undefined = body.sessionId

    // ── TODO: Issue a real Gemini Live ephemeral token ───────────────────────
    // Create the service-role DB client and call consumeAiRequest(db, user.id)
    // after validation so the real Gemini request shares the daily AI pool.
    // Replace the stub below once the Gemini Live ephemeral token API is ready:
    //
    // const { getAccessToken } = await import('../shared/oauth-helper.ts')
    // const accessToken = await getAccessToken()
    // const geminiRes = await fetch(
    //   'https://generativelanguage.googleapis.com/v1beta/live/ephemeralTokens',
    //   {
    //     method: 'POST',
    //     headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ sessionId, userId: user.id }),
    //   }
    // )
    // if (!geminiRes.ok) throw new Error(`Gemini API error: ${geminiRes.status}`)
    // const { ephemeralToken, expiresAt } = await geminiRes.json()

    // Stub: placeholder token so the extension can test the auth flow
    const ephemeralToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString() // 1 hour

    console.log(`[live-token] Issued stub token for user ${user.id}, session ${sessionId ?? 'none'}`)

    return jsonResponse({ ephemeralToken, expiresAt })

  } catch (error) {
    console.error('[live-token] Error:', error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
