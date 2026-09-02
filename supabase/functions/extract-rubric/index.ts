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

import { buildCorsHeaders, handleOptions } from "../shared/cors.ts"

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void
}

const IN_FLIGHT = new Set(["uploading", "indexing"])

/**
 * Extract plain text from a DOCX file (which is a ZIP archive).
 * Reads word/document.xml and strips all XML tags, leaving only text nodes.
 */
async function extractDocxText(bytes: Uint8Array): Promise<string> {
  // DOCX = ZIP. Find the word/document.xml entry by scanning the ZIP central
  // directory. We use a simple approach: decompress the specific file entry.
  // The local file header signature is 0x04034b50 (PK\x03\x04).
  const target = 'word/document.xml'
  const targetBytes = new TextEncoder().encode(target)

  let i = 0
  while (i < bytes.length - 30) {
    // Look for local file header signature PK\x03\x04
    if (
      bytes[i] === 0x50 && bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04
    ) {
      const compression = bytes[i + 8] | (bytes[i + 9] << 8)
      const compressedSize = bytes[i + 18] | (bytes[i + 19] << 8) |
        (bytes[i + 20] << 16) | (bytes[i + 21] << 24)
      const fnLen = bytes[i + 26] | (bytes[i + 27] << 8)
      const extraLen = bytes[i + 28] | (bytes[i + 29] << 8)
      const dataOffset = i + 30 + fnLen + extraLen

      // Check if this entry is word/document.xml
      const fnBytes = bytes.slice(i + 30, i + 30 + fnLen)
      if (fnLen === targetBytes.length) {
        let match = true
        for (let j = 0; j < fnLen; j++) {
          if (fnBytes[j] !== targetBytes[j]) { match = false; break }
        }
        if (match) {
          const compressedData = bytes.slice(dataOffset, dataOffset + compressedSize)
          let xmlBytes: Uint8Array
          if (compression === 0) {
            // Stored (no compression)
            xmlBytes = compressedData
          } else if (compression === 8) {
            // Deflate
            const ds = new DecompressionStream('deflate-raw')
            const writer = ds.writable.getWriter()
            const reader = ds.readable.getReader()
            writer.write(compressedData)
            writer.close()
            const chunks: Uint8Array[] = []
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              chunks.push(value)
            }
            const total = chunks.reduce((s, c) => s + c.length, 0)
            xmlBytes = new Uint8Array(total)
            let offset = 0
            for (const chunk of chunks) {
              xmlBytes.set(chunk, offset)
              offset += chunk.length
            }
          } else {
            throw new Error(`Unsupported ZIP compression: ${compression}`)
          }
          const xml = new TextDecoder('utf-8', { fatal: false }).decode(xmlBytes)
          // Strip XML tags and decode common entities
          return xml
            .replace(/<\/w:p>/g, '\n')     // paragraph end → newline
            .replace(/<\/w:tr>/g, '\n')     // table row end → newline
            .replace(/<[^>]+>/g, '')        // strip all tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#x[0-9a-fA-F]+;/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
        }
      }
      i = dataOffset + compressedSize
    } else {
      i++
    }
  }
  throw new Error('word/document.xml not found in DOCX archive')
}

/**
 * Extract plain text from a PDF by scanning for text between BT/ET markers
 * and decoding Tj / TJ / ' / " operators. Better than raw ASCII scan.
 */
function extractPdfText(bytes: Uint8Array): string {
  const raw = new TextDecoder('latin1').decode(bytes)
  const lines: string[] = []

  // Find all BT...ET blocks (PDF text objects)
  const btEtRegex = /BT[\s\S]*?ET/g
  let match: RegExpExecArray | null
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[0]
    // Extract string arguments from Tj, TJ, ' and " operators
    // Tj: (text) Tj   or  <hex> Tj
    const tjRegex = /\(([^)]*)\)\s*(?:Tj|'|")|<([0-9a-fA-F]+)>\s*(?:Tj|'|")/g
    let tj: RegExpExecArray | null
    while ((tj = tjRegex.exec(block)) !== null) {
      if (tj[1] !== undefined) {
        // Literal string — unescape PDF escape sequences
        lines.push(
          tj[1]
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\')
        )
      } else if (tj[2] !== undefined) {
        // Hex string
        const hex = tj[2]
        let str = ''
        for (let i = 0; i < hex.length - 1; i += 2) {
          str += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
        }
        lines.push(str)
      }
    }
    // TJ operator: [(text) spacing (text) ...] TJ
    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g
    let tja: RegExpExecArray | null
    while ((tja = tjArrayRegex.exec(block)) !== null) {
      const inner = tja[1]
      const strRegex = /\(([^)]*)\)|<([0-9a-fA-F]+)>/g
      let s: RegExpExecArray | null
      let line = ''
      while ((s = strRegex.exec(inner)) !== null) {
        if (s[1] !== undefined) line += s[1]
        else if (s[2] !== undefined) {
          const hex = s[2]
          for (let i = 0; i < hex.length - 1; i += 2) {
            line += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
          }
        }
      }
      if (line) lines.push(line)
    }
  }

  if (lines.length === 0) {
    // Fallback: raw printable ASCII (old behaviour)
    const chars: string[] = []
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      if ((b >= 32 && b < 127) || b === 9 || b === 10 || b === 13) {
        chars.push(String.fromCharCode(b))
      } else {
        chars.push(' ')
      }
    }
    return chars.join('').replace(/\s{4,}/g, ' ').trim()
  }

  return lines
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (req.method === 'OPTIONS') {
    return handleOptions(cors)
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
        const fileName = validatedPath.path.split('/').pop()?.toLowerCase() ?? ''
        const isDocx = mimeType.includes('word') ||
          mimeType.includes('officedocument') ||
          fileName.endsWith('.docx')
        const isPdf = mimeType.includes('pdf') || fileName.endsWith('.pdf')

        if (isDocx) {
          // DOCX files are ZIP archives. Parse word/document.xml to get text.
          try {
            const arrayBuffer = await fileBlob.arrayBuffer()
            const bytes = new Uint8Array(arrayBuffer)
            sourceText = await extractDocxText(bytes)
          } catch (err) {
            console.warn('[extract-rubric] DOCX parse failed, falling back to raw:', err)
            // Fall back to raw text attempt
            sourceText = await fileBlob.text().catch(() => '')
          }
        } else if (isPdf || mimeType.includes('octet-stream')) {

          // For PDFs: use a smarter extraction that looks for text between
          // PDF stream markers and decodes common PDF text operators.
          const arrayBuffer = await fileBlob.arrayBuffer()
          const bytes = new Uint8Array(arrayBuffer)
          sourceText = extractPdfText(bytes)

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


