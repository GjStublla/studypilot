/**
 * delete-knowledge-document — Supabase Edge Function
 *
 * Deletes a knowledge document from Supabase Storage, Supabase metadata,
 * and Gemini File Search (when implemented).
 *
 * Input:  { knowledgeDocumentId: string }
 * Output: { success: true, documentId: string }
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

    // Auth: anon key + user JWT so auth.getUser() returns the actual user,
    // not the service account.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401)

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

    // Service-role client for all subsequent DB + Storage operations
    const db = createClient(supabaseUrl, supabaseServiceKey)

    // ── Validate input ──────────────────────────────────────────────────────
    const { knowledgeDocumentId } = await req.json()
    if (!knowledgeDocumentId) {
      return jsonResponse({ error: 'knowledgeDocumentId is required' }, 400)
    }

    // ── Fetch document and verify ownership ─────────────────────────────────
    const { data: doc, error: fetchError } = await db
      .from('knowledge_documents')
      .select('id, user_id, rubric_id, gemini_file_search_document_name, storage_path, storage_bucket')
      .eq('id', knowledgeDocumentId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !doc) {
      return jsonResponse({ error: 'Document not found or access denied' }, 404)
    }

    // ── Delete from Gemini File Search (if indexed) ─────────────────────────
    if (doc.gemini_file_search_document_name) {
      // TODO: Call consumeAiRequest(db, user.id) before the real Gemini request
      // below so File Search deletion shares the daily AI request pool.
      // Replace with real Gemini File Search delete call:
      //
      // const { getAccessToken } = await import('../shared/oauth-helper.ts')
      // const accessToken = await getAccessToken()
      // await fetch(
      //   `https://generativelanguage.googleapis.com/v1beta/${doc.gemini_file_search_document_name}`,
      //   { method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` } }
      // )
      console.log(`[delete-knowledge-document] TODO: delete from Gemini — ${doc.gemini_file_search_document_name}`)
    }

    // ── Delete from Supabase Storage (if a file was uploaded) ───────────────
    if (doc.storage_path && doc.storage_bucket) {
      const { error: storageError } = await db.storage
        .from(doc.storage_bucket)
        .remove([doc.storage_path])

      if (storageError) {
        // Log but don't abort — the DB row deletion is the critical step
        console.error('[delete-knowledge-document] Storage deletion failed:', storageError.message)
      }
    }

    // ── Delete the metadata row ─────────────────────────────────────────────
    // Note: we delete the row directly rather than setting index_status='deleted'
    // first — a pre-delete status update is pointless because if the delete
    // succeeds, the row is gone, and if it fails, we haven't corrupted anything.
    const { error: deleteError } = await db
      .from('knowledge_documents')
      .delete()
      .eq('id', knowledgeDocumentId)
      .eq('user_id', user.id)

    if (deleteError) {
      return jsonResponse({ error: 'Failed to delete document record' }, 500)
    }

    // ── Update related rubric status ────────────────────────────────────────
    if (doc.rubric_id) {
      await db.from('rubrics')
        .update({ file_search_status: 'deleted' })
        .eq('id', doc.rubric_id)
    }

    // ── Log activity ────────────────────────────────────────────────────────
    await db.from('activity_logs').insert({
      user_id: user.id,
      event_type: 'document_deleted',
      details: { document_id: knowledgeDocumentId },
    })

    return jsonResponse({ success: true, documentId: knowledgeDocumentId })

  } catch (error) {
    console.error('[delete-knowledge-document] Error:', error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
