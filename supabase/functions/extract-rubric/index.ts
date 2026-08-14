/**

 * extract-rubric — Supabase Edge Function

 *

 * Extracts evaluation criteria from a rubric document using Gemini Flash.

 * Saves the extracted text and criteria back to Supabase and creates a

 * knowledge_documents row so the rubric can be indexed for RAG later.

 *

 * Input:  { rubricId: string, filePath?: string }

 *   `filePath` is ignored for Storage access (trust boundary). Path is loaded

 *   from the owned rubric / knowledge_document and validated as

 *   `{userId}/{rubricId}/...`.

 * Output: { rubricId, extractedText, criteria }

 */



import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

import { consumeAiRequest, limitReachedMessage, QUOTA_UNAVAILABLE_MESSAGE } from "../shared/ai-usage.ts"

import { createGeminiInteraction, describeGeminiError, extractInteractionText, getGeminiTextModel } from "../shared/gemini.ts"

import {

  RUBRICS_STORAGE_BUCKET,

  resolveValidatedRubricStoragePath,

} from "../shared/storage-path.ts"

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void
}

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



const IN_FLIGHT = new Set(["uploading", "indexing"])



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



    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    const rubricId = typeof body.rubricId === "string" ? body.rubricId.trim() : ""

    if (!rubricId) return jsonResponse({ error: 'rubricId is required' }, 400)

    // Intentionally ignore body.filePath / storage_path / storage_bucket.



    // ── Fetch rubric and verify ownership ────────────────────────────────────

    const { data: rubric, error: rubricError } = await db

      .from('rubrics')

      .select('id, title, course, user_id, extracted_text, file_path')

      .eq('id', rubricId)

      .eq('user_id', user.id)

      .single()



    if (rubricError || !rubric) {

      return jsonResponse({ error: 'Rubric not found or access denied' }, 404)

    }



    const { data: existingDoc } = await db

      .from('knowledge_documents')

      .select('id, index_status, storage_path, storage_bucket')

      .eq('rubric_id', rubricId)

      .eq('user_id', user.id)

      .maybeSingle()



    const validatedPath = resolveValidatedRubricStoragePath({

      userId: user.id,

      rubricId,

      rubricFilePath: rubric.file_path,

      documentStoragePath: existingDoc?.storage_path,

    })



    // ── Get source text ──────────────────────────────────────────────────────

    // Prefer the owned uploaded file; fall back to previously extracted text.

    let sourceText = rubric.extracted_text || ''



    if (validatedPath) {

      const { data: fileBlob, error: downloadError } = await db.storage

        .from(validatedPath.bucket)

        .download(validatedPath.path)



      if (!downloadError && fileBlob) {

        const mimeType = fileBlob.type?.toLowerCase() ?? ''



        if (

          mimeType.includes('pdf') ||

          mimeType.includes('word') ||

          mimeType.includes('octet-stream')

        ) {

          // For binary formats, extract the readable ASCII characters.

          // This is a best-effort approach — it works well for most PDFs

          // since they embed readable text strings in the binary stream.

          const arrayBuffer = await fileBlob.arrayBuffer()

          const bytes = new Uint8Array(arrayBuffer)

          const chars: string[] = []

          for (let i = 0; i < bytes.length; i++) {

            const b = bytes[i]

            // Include printable ASCII and common whitespace

            if ((b >= 32 && b < 127) || b === 9 || b === 10 || b === 13) {

              chars.push(String.fromCharCode(b))

            } else {

              chars.push(' ')

            }

          }

          // Collapse whitespace runs that result from binary noise

          sourceText = chars.join('').replace(/\s{4,}/g, ' ').trim()

        } else {

          // Plain text, Markdown, CSV, etc.

          sourceText = await fileBlob.text()

        }

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

      store: true,

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

    let knowledgeDocumentId = existingDoc?.id as string | undefined

    const priorStatus = existingDoc?.index_status as string | undefined

    const nextIndexStatus =

      priorStatus === "indexed"

        ? "indexed"

        : priorStatus && IN_FLIGHT.has(priorStatus)

        ? priorStatus

        : "pending"



    const storageFields = validatedPath

      ? {

        storage_bucket: RUBRICS_STORAGE_BUCKET,

        storage_path: validatedPath.path,

      }

      : {}



    if (existingDoc) {

      await db.from('knowledge_documents')

        .update({

          extracted_text: sourceText,

          title: rubric.title,

          ...storageFields,

          index_status: nextIndexStatus,

        })

        .eq('id', existingDoc.id)

        .eq('user_id', user.id)

    } else {

      const { data: inserted } = await db.from('knowledge_documents').insert({

        user_id: user.id,

        rubric_id: rubricId,

        title: rubric.title,

        document_type: 'rubric',

        storage_bucket: RUBRICS_STORAGE_BUCKET,

        storage_path: validatedPath?.path ?? null,

        extracted_text: sourceText,

        index_status: 'pending',

      }).select('id').single()

      knowledgeDocumentId = inserted?.id

    }



    if (knowledgeDocumentId) {

      await db.from('rubrics').update({

        knowledge_document_id: knowledgeDocumentId,

        file_search_status: nextIndexStatus === "indexed"

          ? "indexed"

          : IN_FLIGHT.has(nextIndexStatus)

          ? "indexing"

          : "pending",

      }).eq('id', rubricId)

    }



    // ── Log activity ─────────────────────────────────────────────────────────

    await db.from('activity_logs').insert({

      user_id: user.id,

      event_type: 'rubric_extracted',

      details: { rubric_name: rubric.title },

    })



    // Kick indexing once when not already indexed / in-flight.

    // Concurrent callers share one claim inside index-knowledge-document.

    // Use EdgeRuntime.waitUntil so the request is not dropped when this

    // function returns; on failure mark the rubric/document as failed.

    const shouldStartIndexing = Boolean(

      knowledgeDocumentId &&

        nextIndexStatus !== "indexed" &&

        !IN_FLIGHT.has(nextIndexStatus),

    )

    if (shouldStartIndexing && knowledgeDocumentId) {

      const indexUrl = `${supabaseUrl}/functions/v1/index-knowledge-document`

      const kickoffId = knowledgeDocumentId

      const kickoffRubricId = rubricId

      const kickIndexing = async () => {

        try {

          const indexRes = await fetch(indexUrl, {

            method: 'POST',

            headers: {

              'Authorization': authHeader,

              'Content-Type': 'application/json',

              'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',

            },

            body: JSON.stringify({ knowledgeDocumentId: kickoffId }),

          })

          if (!indexRes.ok) {

            const errText = await indexRes.text()

            console.error(

              '[extract-rubric] index-knowledge-document failed:',

              indexRes.status,

              errText,

            )

            const message =

              `Vertex RAG indexing failed (${indexRes.status}): ${errText.slice(0, 500)}`

            await db.from('knowledge_documents').update({

              index_status: 'failed',

              index_error: message.slice(0, 2000),

            }).eq('id', kickoffId).eq('user_id', user.id)

            await db.from('rubrics').update({

              file_search_status: 'failed',

              file_search_error: message.slice(0, 2000),

            }).eq('id', kickoffRubricId)

          }

        } catch (err) {

          console.error('[extract-rubric] Failed to kick off indexing:', err)

          const message =

            `Vertex RAG indexing kickoff error: ${(err as Error).message}`

          await db.from('knowledge_documents').update({

            index_status: 'failed',

            index_error: message.slice(0, 2000),

          }).eq('id', kickoffId).eq('user_id', user.id)

          await db.from('rubrics').update({

            file_search_status: 'failed',

            file_search_error: message.slice(0, 2000),

          }).eq('id', kickoffRubricId)

        }

      }

      try {

        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {

          EdgeRuntime.waitUntil(kickIndexing())

        } else {

          await kickIndexing()

        }

      } catch {

        await kickIndexing()

      }

    }



    return jsonResponse({

      rubricId,

      extractedText: sourceText,

      criteria: extractedCriteria,

      knowledgeDocumentId: knowledgeDocumentId ?? null,

      indexingStarted: shouldStartIndexing,

    })



  } catch (error) {

    console.error('[extract-rubric] Error:', error)

    return jsonResponse({ error: (error as Error).message }, 500)

  }

})


