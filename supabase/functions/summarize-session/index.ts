/**
 * summarize-session — Supabase Edge Function
 *
 * Generates a session summary, action items, and follow-up prompts
 * from a coaching session transcript using Gemini Flash.
 *
 * Input:  { sessionId: string, transcript?: string, mode?: string }
 * Output: { summary, actionItems, followUpPrompts }
 *
 * Side effects:
 *   - Updates sessions.summary
 *   - Inserts action_items rows
 *   - Inserts activity_logs row
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

function parseSummaryJson(rawText: string): { summary?: string; actionItems?: string[]; followUpPrompts?: string[] } | null {
  const clean = rawText
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim()

  const candidates = [clean]
  const firstBrace = clean.indexOf('{')
  const lastBrace = clean.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(clean.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null
}

const MODE_INSTRUCTIONS: Record<string, string> = {
  'Essay Coach': 'Focus on thesis clarity, argument structure, evidence quality, and areas for revision.',
  'Presentation Coach': 'Focus on structure, delivery feedback, key talking points, and rehearsal suggestions.',
  'Study Coach': 'Focus on key concepts covered, learning gaps identified, and study priorities.',
  'Lecture': 'Focus on main topics, key definitions, examples given, and important takeaways.',
  'Research Reader': 'Focus on research findings, methodology, key insights, and how they relate to the student\'s work.',
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

    // ── Parse input ─────────────────────────────────────────────────────────
    const { sessionId, transcript: inlineTranscript, mode = 'Study Coach' } = await req.json()

    // ── Load transcript from DB if not provided inline ───────────────────────
    let transcriptText = inlineTranscript as string | undefined
    if (!transcriptText && sessionId) {
      const { data: messages } = await db
        .from('session_messages')
        .select('role, message_text, time_offset_seconds')
        .eq('session_id', sessionId)
        .order('time_offset_seconds', { ascending: true })

      if (messages && messages.length > 0) {
        transcriptText = messages
          .map((m: any) => `${m.role === 'user' ? 'Student' : 'StudyPilot'}: ${m.message_text}`)
          .join('\n')
      }
    }

    if (!transcriptText?.trim()) {
      return jsonResponse({ error: 'No transcript content found for this session' }, 400)
    }

    const aiUsage = await consumeAiRequest(db, user.id)
    if (aiUsage.status === "unavailable") {
      return jsonResponse({ error: QUOTA_UNAVAILABLE_MESSAGE }, 503)
    }
    if (!aiUsage.usage.allowed) {
      return jsonResponse({ error: limitReachedMessage(aiUsage.usage) }, 429)
    }

    // ── Build the prompt — ask Gemini for JSON directly ──────────────────────
    // Requesting JSON avoids brittle line-counting parsers for markdown output.
    const modeInstruction = MODE_INSTRUCTIONS[mode] ?? MODE_INSTRUCTIONS['Study Coach']

    const prompt = `You are StudyPilot, a Socratic academic coach reviewing a completed coaching session.

Session mode: ${mode}
${modeInstruction}

Transcript:
${transcriptText}

Respond with a single valid JSON object (no markdown, no code fences) with these exact keys:
{
  "summary": "2-3 sentence summary of the session and the student's main challenge or progress",
  "actionItems": ["specific action 1", "specific action 2", "specific action 3"],
  "followUpPrompts": ["follow-up question 1", "follow-up question 2", "follow-up question 3"]
}

Rules:
- summary: focus on what the student worked on and what needs attention
- actionItems: 3-5 concrete, specific tasks the student should do next (not generic advice)
- followUpPrompts: 2-3 questions the student might ask in a future chat session
- Never write content that would replace the student's own work`

    // ── Call Gemini Flash ────────────────────────────────────────────────────
    const geminiModel = getGeminiTextModel()

    const geminiRes = await createGeminiInteraction({
      model: geminiModel,
      input: prompt,
      store: false,
      generation_config: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('[summarize-session] Gemini API error:', geminiRes.status, errText)
      const detail = describeGeminiError(errText)
      return jsonResponse({ error: `Failed to generate summary (Gemini ${geminiRes.status}${detail ? ` ${detail}` : ''})` }, 502)
    }

    const geminiData = await geminiRes.json()
    const rawText = extractInteractionText(geminiData)

    // ── Parse the JSON response ──────────────────────────────────────────────
    let parsed = parseSummaryJson(rawText)
    if (!parsed) {
      console.error('[summarize-session] Failed to parse Gemini response:', rawText)
      // Fallback so the function still returns something useful
      parsed = {
        summary: rawText.slice(0, 300) || 'Session completed.',
        actionItems: [],
        followUpPrompts: [],
      }
    }

    const summary = parsed.summary || 'Session completed.'
    const actionItems: string[] = Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 5) : []
    const followUpPrompts: string[] = Array.isArray(parsed.followUpPrompts) ? parsed.followUpPrompts.slice(0, 3) : []

    // ── Write back to Supabase ───────────────────────────────────────────────
    if (sessionId) {
      // Update session summary
      await db.from('sessions')
        .update({ summary })
        .eq('id', sessionId)
        .eq('user_id', user.id)

      // Insert action items
      if (actionItems.length > 0) {
        await db.from('action_items').insert(
          actionItems.map((text) => ({
            user_id: user.id,
            session_id: sessionId,
            text,
            done: false,
          }))
        )
      }

      // Log activity
      await db.from('activity_logs').insert({
        user_id: user.id,
        event_type: 'session_summarized',
        details: { session_id: sessionId, summary: summary.slice(0, 200) },
      })
    }

    return jsonResponse({ summary, actionItems, followUpPrompts })

  } catch (error) {
    console.error('[summarize-session] Error:', error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
