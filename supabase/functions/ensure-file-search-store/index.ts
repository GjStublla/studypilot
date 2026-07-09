import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    // Auth: must use anon key + user JWT. The service-role client ignores the
    // Authorization header for auth.getUser() and would return the service account.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: userError } = await authClient.auth.getUser(token)
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Service-role client for all DB writes
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch profile to check if file search store already exists
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('gemini_file_search_store_name, gemini_file_search_store_display_name')
      .eq('id', user.id)
      .single()

    if (profileError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If store already exists, return it
    if (profile.gemini_file_search_store_name) {
      return new Response(
        JSON.stringify({
          fileSearchStoreName: profile.gemini_file_search_store_name,
          displayName: profile.gemini_file_search_store_display_name || 'studypilot-user-store',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate display name from the user's short ID
    const userIdShort = user.id.slice(0, 8)
    const displayName = `studypilot-user-${userIdShort}`

    // TODO: Call consumeAiRequest(supabaseClient, user.id) before the real
    // Gemini request below so File Search setup shares the daily AI request pool.
    // Replace the stub below with the real Gemini File Search Stores
    // create API once available:
    //
    // const accessToken = await getAccessToken()
    // const geminiResponse = await fetch(
    //   'https://generativelanguage.googleapis.com/v1beta/files/searchStores',
    //   {
    //     method: 'POST',
    //     headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ displayName, embeddingModel: 'models/gemini-embedding-2' }),
    //   }
    // )
    // const { name: fileSearchStoreName } = await geminiResponse.json()

    // Stub: generate a placeholder store name
    const fileSearchStoreName = `fileSearchStores/${crypto.randomUUID()}`

    // Update profile with store name
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({
        gemini_file_search_store_name: fileSearchStoreName,
        gemini_file_search_store_display_name: displayName,
      })
      .eq('id', user.id)

    if (updateError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        fileSearchStoreName,
        displayName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
