/**
 * socratic-coach — Supabase Edge Function
 *
 * Streams a Socratic coaching response from Gemini Flash using the student's
 * session context, active rubric, and recent chat history.
 *
 * Input (POST body):
 *   { sessionId?: string, userMessage: string }
 *
 * Output:
 *   SSE stream: data: {"text":"..."} ... data: [DONE]
 *   On error:   { "error": "..." }
 *
 * Side effects:
 *   - Saves the user message to dashboard_chat_messages
 *   - Saves the full AI response to dashboard_chat_messages on stream complete
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { createGeminiInteraction, getGeminiTextModel } from "../shared/gemini.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are StudyPilot, a Socratic academic coach. Your role is to help students improve their own work — never to do it for them.

WHAT YOU MAY DO:
- Explain rubric criteria in plain language
- Ask Socratic questions that guide the student toward their own insights
- Identify where their work is strong and where it falls short of the rubric
- Suggest specific revision strategies and structural approaches
- Reference the transcript and summary from the coaching session when available
- Help turn feedback into concrete, actionable next steps
- Use retrieved context from the student's uploaded rubric documents when available

WHAT YOU MUST NOT DO:
- Write paragraphs, essays, or complete sentences meant for submission
- Complete assignments or generate final answers
- Invent rubric criteria that don't exist in the provided context
- Claim to have read a document unless it appears in the provided context
- Ignore academic integrity

When you refuse to write something for the student, offer a guiding question or a structural suggestion instead.
Example refusal: "I can't write that section for you, but I can help you think through it. What is the main claim you want your reader to walk away believing?"

Keep responses concise. Prefer questions over lectures. When the student is on the right track, say so briefly and push them one step further.`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sseChunk(text: string): string {
  return `data: ${JSON.stringify({ text })}\n\n`
}

function sseDone(): string {
  return `data: [DONE]\n\n`
}

function sseError(message: string): string {
  return `data: ${JSON.stringify({ error: message })}\n\n`
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  // With JWT verification ON in Supabase Dashboard, the gateway has already
  // validated the token before this code runs. We just decode the payload
  // locally to get the user ID — no network call needed.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const token = authHeader.slice(7)

  let userId: string
  try {
    const payloadB64 = token.split('.')[1]
    if (!payloadB64) throw new Error('Malformed JWT')
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload.sub) throw new Error('No subject in token')
    // Token expiry is already checked by the Supabase gateway when JWT verify is ON
    userId = payload.sub
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  // Service role client for all DB operations
  const db = createClient(supabaseUrl, supabaseServiceKey)

  // ── Parse body ────────────────────────────────────────────────────────────
  let sessionId: string | undefined
  let userMessage: string

  try {
    const body = await req.json()
    sessionId = body.sessionId
    userMessage = body.userMessage

    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'userMessage is required and must be a non-empty string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    userMessage = userMessage.trim()
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Load context from Supabase ─────────────────────────────────────────────
  // 1. User profile (for active rubric store name)
  const { data: profile } = await db
    .from('profiles')
    .select('name, default_coach_mode, gemini_file_search_store_name')
    .eq('id', userId)
    .single()

  // 2. Session metadata + summary (if sessionId provided)
  let sessionContext = ''
  let rubricContext = ''

  if (sessionId) {
    // Verify ownership before loading
    const { data: session } = await db
      .from('sessions')
      .select('title, mode, summary, rubric_id, when_timestamp')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single()

    if (session) {
      sessionContext = `SESSION: "${session.title}" (${session.mode})\nSUMMARY: ${session.summary || 'No summary yet.'}`

      // 3. Recent transcript (last 20 messages to stay within token limits)
      const { data: transcript } = await db
        .from('session_messages')
        .select('role, message_text, time_offset_seconds')
        .eq('session_id', sessionId)
        .order('time_offset_seconds', { ascending: false })
        .limit(20)

      if (transcript && transcript.length > 0) {
        const transcriptText = transcript
          .reverse()
          .map((m: any) => `${m.role === 'user' ? 'Student' : 'StudyPilot'}: ${m.message_text}`)
          .join('\n')
        sessionContext += `\n\nRECENT TRANSCRIPT:\n${transcriptText}`
      }

      // 4. Active rubric + criteria
      if (session.rubric_id) {
        const { data: rubric } = await db
          .from('rubrics')
          .select('title, course, extracted_text, rubric_criteria(name, score, max_score)')
          .eq('id', session.rubric_id)
          .eq('user_id', userId)
          .single()

        if (rubric) {
          const criteriaText = (rubric.rubric_criteria as any[] || [])
            .map((c: any) => `  - ${c.name}: ${c.score ?? 0}/${c.max_score ?? 4}`)
            .join('\n')

          rubricContext = `RUBRIC: "${rubric.title}" (${rubric.course})\nCRITERIA:\n${criteriaText}`

          if (rubric.extracted_text) {
            // Truncate to avoid exceeding context limits
            const truncated = rubric.extracted_text.slice(0, 2000)
            rubricContext += `\n\nRUBRIC TEXT:\n${truncated}${rubric.extracted_text.length > 2000 ? '... [truncated]' : ''}`
          }
        }
      }
    }
  } else {
    // No session — load the user's active rubric as fallback context
    const { data: activeRubric } = await db
      .from('rubrics')
      .select('title, course, extracted_text, rubric_criteria(name, score, max_score)')
      .eq('user_id', userId)
      .eq('active', true)
      .single()

    if (activeRubric) {
      const criteriaText = (activeRubric.rubric_criteria as any[] || [])
        .map((c: any) => `  - ${c.name}: ${c.score ?? 0}/${c.max_score ?? 4}`)
        .join('\n')

      rubricContext = `ACTIVE RUBRIC: "${activeRubric.title}" (${activeRubric.course})\nCRITERIA:\n${criteriaText}`
    }
  }

  // 5. Recent chat history for this session (last 10 exchanges = 20 messages)
  // NOTE: Supabase query builders are immutable — each chained method returns a
  // NEW builder. We must build the full chain in one expression so the
  // optional sessionId filter is never silently dropped.
  let chatHistory: Array<{ role: string; text: string }> = []
  {
    const baseQuery = db
      .from('dashboard_chat_messages')
      .select('role, text')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    const { data: history } = await (
      sessionId ? baseQuery.eq('session_id', sessionId) : baseQuery
    )

    if (history && history.length > 0) {
      // Reverse to get chronological order.
      chatHistory = history
        .reverse()
        .map((m: any) => ({
          role: m.role === 'user' ? 'Student' : 'StudyPilot',
          text: m.text,
        }))
    }
  }

  // ── Save the user's message to the DB (fire-and-forget) ───────────────────
  db.from('dashboard_chat_messages').insert({
    user_id: userId,
    session_id: sessionId ?? null,
    role: 'user',
    text: userMessage,
  }).then().catch((e: Error) => console.error('[socratic-coach] Failed to save user message:', e))

  // ── Build Gemini request ──────────────────────────────────────────────────
  // Assemble the context block shown once at the top of the conversation
  const contextParts: string[] = []
  if (rubricContext) contextParts.push(rubricContext)
  if (sessionContext) contextParts.push(sessionContext)

  const systemWithContext = contextParts.length > 0
    ? `${SYSTEM_PROMPT}\n\n---\nCONTEXT:\n${contextParts.join('\n\n')}\n---`
    : SYSTEM_PROMPT

  const historyText = chatHistory
    .map((m) => `${m.role}: ${m.text}`)
    .join('\n')

  const interactionInput = historyText
    ? `Recent chat history:\n${historyText}\n\nStudent: ${userMessage}`
    : userMessage

  const geminiModel = getGeminiTextModel()

  const geminiPayload = {
    model: geminiModel,
    system_instruction: systemWithContext,
    input: interactionInput,
    stream: true,
    store: false,
    generation_config: {
      temperature: 0.7,
      max_output_tokens: 1024,
    },
  }

  // ── Call Gemini with streaming ─────────────────────────────────────────────
  let geminiResponse: Response
  try {
    geminiResponse = await createGeminiInteraction(geminiPayload)
  } catch (e) {
    console.error('[socratic-coach] Gemini fetch failed:', e)
    return new Response(
      JSON.stringify({ error: 'Failed to reach AI service. Please try again.' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!geminiResponse.ok) {
    const errText = await geminiResponse.text()
    console.error('[socratic-coach] Gemini API error:', geminiResponse.status, errText)
    return new Response(
      JSON.stringify({ error: 'AI service returned an error. Please try again.' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Stream Gemini SSE → client SSE ────────────────────────────────────────
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  // Accumulate the full response so we can save it to the DB after streaming
  let fullResponse = ''

  ;(async () => {
    const reader = geminiResponse.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const clean = line.trim()
          if (!clean.startsWith('data: ')) continue

          const raw = clean.slice(6).trim()
          if (raw === '[DONE]') continue  // Gemini's own done signal - we send ours below

          try {
            const parsed = JSON.parse(raw)
            if (parsed?.event_type === 'error') {
              const message = parsed?.error?.message ?? 'AI service stream error.'
              console.error('[socratic-coach] Gemini stream error:', message)
              await writer.write(encoder.encode(sseError(message)))
              continue
            }

            const text: string =
              parsed?.event_type === 'step.delta' && parsed?.delta?.type === 'text'
              ? parsed.delta.text
              : ''

            if (text) {
              fullResponse += text
              await writer.write(encoder.encode(sseChunk(text)))
            }
          } catch {
            // Partial JSON chunk — safe to skip
          }
        }
      }

      // Send our own DONE signal
      await writer.write(encoder.encode(sseDone()))
    } catch (e) {
      console.error('[socratic-coach] Stream read error:', e)
      await writer.write(encoder.encode(sseError('Stream interrupted.')))
      await writer.write(encoder.encode(sseDone()))
    } finally {
      await writer.close()

      // Save the complete AI response to the DB (fire-and-forget)
      if (fullResponse.trim()) {
        db.from('dashboard_chat_messages').insert({
          user_id: userId,
          session_id: sessionId ?? null,
          role: 'ai',
          text: fullResponse.trim(),
        }).then().catch((e: Error) =>
          console.error('[socratic-coach] Failed to save AI message:', e)
        )
      }
    }
  })()

  return new Response(readable, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})
