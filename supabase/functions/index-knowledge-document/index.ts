/**
 * index-knowledge-document — Supabase Edge Function
 *
 * Imports a knowledge document into Gemini File Search so it becomes
 * searchable by the Socratic coach.
 *
 * Currently stubs the Gemini File Search API call (commented out) and
 * generates placeholder metadata. Replace the stub when the Gemini
 * File Search API is available and credentials are configured.
 *
 * Input:  { knowledgeDocumentId: string }
 * Output: { knowledgeDocumentId, status, fileSearchStoreName, fileSearchDocumentName }
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    // Auth: use the anon key + user JWT so getUser() works correctly.
    // The service-role client ignores the Authorization header for getUser()
    // and would return the service account instead of the user.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401)

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

    // Service-role client for all subsequent DB operations
    const db = createClient(supabaseUrl, supabaseServiceKey)

    // ── Validate input ──────────────────────────────────────────────────────
    const { knowledgeDocumentId } = await req.json()
    if (!knowledgeDocumentId) {
      return jsonResponse({ error: 'knowledgeDocumentId is required' }, 400)
    }

    // ── Fetch document and verify ownership ─────────────────────────────────
    const { data: doc, error: docError } = await db
      .from('knowledge_documents')
      .select('id, title, user_id, rubric_id, storage_path, storage_bucket, extracted_text')
      .eq('id', knowledgeDocumentId)
      .eq('user_id', user.id)
      .single()

    if (docError || !doc) {
      return jsonResponse({ error: 'Document not found or access denied' }, 404)
    }

    // ── Ensure the user has a File Search store ─────────────────────────────
    const { data: profile } = await db
      .from('profiles')
      .select('gemini_file_search_store_name')
      .eq('id', user.id)
      .single()

    let fileSearchStoreName = profile?.gemini_file_search_store_name
    if (!fileSearchStoreName) {
      fileSearchStoreName = `fileSearchStores/${crypto.randomUUID()}`
      await db.from('profiles').update({
        gemini_file_search_store_name: fileSearchStoreName,
        gemini_file_search_store_display_name: `studypilot-user-${user.id.slice(0, 8)}`,
      }).eq('id', user.id)
    }

    // ── Mark as uploading ───────────────────────────────────────────────────
    await db.from('knowledge_documents')
      .update({ index_status: 'uploading' })
      .eq('id', knowledgeDocumentId)

    // ── Download file from Storage (if available) ───────────────────────────
    // File content is used when the real Gemini File Search API is wired up.
    // For now it's fetched but not used in the stub below.
    if (doc.storage_path) {
      await db.storage
        .from(doc.storage_bucket || 'rubrics')
        .download(doc.storage_path)
      // fileData would be passed to the Gemini API when implemented
    }

    // ── Mark as indexing ────────────────────────────────────────────────────
    await db.from('knowledge_documents')
      .update({ index_status: 'indexing' })
      .eq('id', knowledgeDocumentId)

    // TODO: Call consumeAiRequest(db, user.id) before the real Gemini request
    // below so document indexing shares the daily AI request pool.
    // Replace the stub below with the real Gemini File Search import:
    //
    // const { getAccessToken } = await import('../shared/oauth-helper.ts')
    // const accessToken = await getAccessToken()
    // const geminiRes = await fetch(
    //   `https://generativelanguage.googleapis.com/v1beta/${fileSearchStoreName}/documents`,
    //   {
    //     method: 'POST',
    //     headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ displayName: doc.title, content: doc.extracted_text }),
    //   }
    // )
    // const { name: fileSearchDocumentName } = await geminiRes.json()

    // Stub: generate a placeholder document name
    const fileSearchDocumentName = `${fileSearchStoreName}/documents/${crypto.randomUUID()}`

    // ── Save Gemini metadata and mark as indexed ────────────────────────────
    const { error: updateError } = await db.from('knowledge_documents').update({
      gemini_file_search_store_name: fileSearchStoreName,
      gemini_file_search_document_name: fileSearchDocumentName,
      gemini_file_name: doc.title,
      index_status: 'indexed',
      indexed_at: new Date().toISOString(),
    }).eq('id', knowledgeDocumentId)

    if (updateError) {
      await db.from('knowledge_documents').update({
        index_status: 'failed',
        index_error: updateError.message,
      }).eq('id', knowledgeDocumentId)
      return jsonResponse({ error: 'Failed to save indexing metadata' }, 500)
    }

    // ── Update related rubric status ────────────────────────────────────────
    if (doc.rubric_id) {
      await db.from('rubrics')
        .update({ file_search_status: 'indexed' })
        .eq('id', doc.rubric_id)
    }

    // ── Log activity ────────────────────────────────────────────────────────
    await db.from('activity_logs').insert({
      user_id: user.id,
      event_type: 'document_indexed',
      details: { document_title: doc.title },
    })

    return jsonResponse({ knowledgeDocumentId, status: 'indexed', fileSearchStoreName, fileSearchDocumentName })

  } catch (error) {
    console.error('[index-knowledge-document] Error:', error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
