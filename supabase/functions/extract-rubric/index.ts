/**
 * extract-rubric — Supabase Edge Function
 *
 * Extracts evaluation criteria from a rubric document using Gemini Flash.
 * Saves the extracted text and criteria back to Supabase and creates a
 * knowledge_documents row so the rubric can be indexed for RAG later.
 *
 * Input:  { rubricId: string, filePath?: string }
 * Output: { rubricId, extractedText, criteria }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { consumeAiRequest, limitReachedMessage, QUOTA_UNAVAILABLE_MESSAGE } from "../shared/ai-usage.ts"
import { createGeminiInteraction, describeGeminiError, extractInteractionText, getGeminiTextModel } from "../shared/gemini.ts"

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

    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401)

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const db = createClient(supabaseUrl, supabaseServiceKey)

    const { rubricId, filePath } = await req.json()
    if (!rubricId) return jsonResponse({ error: 'rubricId is required' }, 400)

    // ── Fetch rubric and verify ownership ────────────────────────────────────
    const { data: rubric, error: rubricError } = await db
      .from('rubrics')
      .select('id, title, course, user_id, extracted_text')
      .eq('id', rubricId)
      .eq('user_id', user.id)
      .single()

    if (rubricError || !rubric) {
      return jsonResponse({ error: 'Rubric not found or access denied' }, 404)
    }

    // ── Get source text ──────────────────────────────────────────────────────
    // Prefer the uploaded file; fall back to previously extracted text.
    let sourceText = rubric.extracted_text || ''

    if (filePath) {
      const { data: fileBlob, error: downloadError } = await db.storage
        .from('rubrics')
        .download(filePath)

      if (!downloadError && fileBlob) {
        // Blob → text (handles plain text and most text-based formats)
        sourceText = await fileBlob.text()
      }
    }

    if (!sourceText.trim()) {
      return jsonResponse({ error: 'No text content available for extraction' }, 400)
    }

    const aiUsage = await consumeAiRequest(db, user.id)
    if (aiUsage.status === "unavailable") {
      return jsonResponse({ error: QUOTA_UNAVAILABLE_MESSAGE }, 503)
    }
    if (!aiUsage.usage.allowed) {
      return jsonResponse({ error: limitReachedMessage(aiUsage.usage) }, 429)
    }

    // ── Call Gemini Flash for structured extraction ──────────────────────────
    // Ask for JSON directly to avoid brittle text parsing.
    const prompt = `You are an academic assistant extracting evaluation criteria from a rubric document.

Rubric: "${rubric.title}" — ${rubric.course}

Document text:
${sourceText.slice(0, 8000)}${sourceText.length > 8000 ? '\n... [truncated]' : ''}

Respond with a single valid JSON object (no markdown, no code fences):
{
  "criteria": [
    { "name": "criterion name", "max_score": 4, "description": "what this criterion evaluates" }
  ]
}

Rules:
- Extract only criteria that appear explicitly in the document
- max_score should match the document's scale (default 4 if not specified)
- Name should be concise (3-6 words)
- Include 3-8 criteria maximum`

    const geminiModel = getGeminiTextModel()

    const geminiRes = await createGeminiInteraction({
      model: geminiModel,
      input: prompt,
      store: false,
      generation_config: {
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('[extract-rubric] Gemini API error:', geminiRes.status, errText)
      const detail = describeGeminiError(errText)
      return jsonResponse({ error: `Failed to extract rubric criteria (Gemini ${geminiRes.status}${detail ? ` ${detail}` : ''})` }, 502)
    }

    const geminiData = await geminiRes.json()
    const rawText = extractInteractionText(geminiData)

    // ── Parse Gemini response ────────────────────────────────────────────────
    let extractedCriteria: Array<{ name: string; max_score: number }> = []
    try {
      const clean = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
      const parsed = JSON.parse(clean)
      if (Array.isArray(parsed.criteria)) {
        extractedCriteria = parsed.criteria.map((c: any) => ({
          name: String(c.name || 'Criterion').slice(0, 200),
          max_score: Number(c.max_score) || 4,
        }))
      }
    } catch {
      console.error('[extract-rubric] Failed to parse Gemini response:', rawText)
      // Proceed with empty criteria rather than failing — the extracted text
      // is still valuable even without parsed criteria.
    }

    // ── Save extracted text to rubric ────────────────────────────────────────
    await db.from('rubrics')
      .update({ extracted_text: sourceText })
      .eq('id', rubricId)

    // ── Replace criteria ─────────────────────────────────────────────────────
    if (extractedCriteria.length > 0) {
      // Delete old criteria before inserting new ones
      await db.from('rubric_criteria').delete().eq('rubric_id', rubricId)

      await db.from('rubric_criteria').insert(
        extractedCriteria.map((c) => ({
          rubric_id: rubricId,
          name: c.name,
          score: 0,       // starts ungraded
          max_score: c.max_score,
        }))
      )
    }

    // ── Create or update knowledge_documents row ─────────────────────────────
    const { data: existingDoc } = await db
      .from('knowledge_documents')
      .select('id')
      .eq('rubric_id', rubricId)
      .maybeSingle()

    if (existingDoc) {
      await db.from('knowledge_documents')
        .update({ extracted_text: sourceText, title: rubric.title })
        .eq('id', existingDoc.id)
    } else {
      await db.from('knowledge_documents').insert({
        user_id: user.id,
        rubric_id: rubricId,
        title: rubric.title,
        document_type: 'rubric',
        storage_bucket: 'rubrics',
        storage_path: filePath ?? null,
        extracted_text: sourceText,
        index_status: 'pending',
      })
    }

    // ── Log activity ─────────────────────────────────────────────────────────
    await db.from('activity_logs').insert({
      user_id: user.id,
      event_type: 'rubric_extracted',
      details: { rubric_name: rubric.title },
    })

    return jsonResponse({
      rubricId,
      extractedText: sourceText,
      criteria: extractedCriteria,
    })

  } catch (error) {
    console.error('[extract-rubric] Error:', error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
