/**
 * Generates and persists a summary for an owned coaching session.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  consumeAiRequest,
  limitReachedMessage,
  QUOTA_UNAVAILABLE_MESSAGE,
} from "../shared/ai-usage.ts";
import {
  createGeminiInteraction,
  describeGeminiError,
  extractInteractionText,
  getGeminiTextModel,
} from "../shared/gemini.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseSummaryJson(rawText: string): {
  summary?: string;
  actionItems?: string[];
  followUpPrompts?: string[];
} | null {
  const clean = rawText
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
  const candidates = [clean];
  const firstBrace = clean.indexOf("{");
  const lastBrace = clean.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(clean.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

const MODE_INSTRUCTIONS: Record<string, string> = {
  "Essay Coach":
    "Focus on thesis clarity, argument structure, evidence quality, and areas for revision.",
  "Presentation Coach":
    "Focus on structure, delivery feedback, key talking points, and rehearsal suggestions.",
  "Study Coach":
    "Focus on key concepts covered, learning gaps identified, and study priorities.",
  "Lecture":
    "Focus on main topics, key definitions, examples given, and important takeaways.",
  "Research Reader":
    "Focus on research findings, methodology, key insights, and how they relate to the student's work.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return jsonResponse({ error: "Unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(
      token,
    );
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const db = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: Record<string, unknown>;
    try {
      const rawBody = await req.json();
      if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
        throw new Error("invalid body");
      }
      body = rawBody as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const sessionId = typeof body.sessionId === "string"
      ? body.sessionId.trim()
      : undefined;
    if (
      body.sessionId !== undefined &&
      (!sessionId || !UUID_PATTERN.test(sessionId))
    ) {
      return jsonResponse(
        { error: "sessionId must be a UUID when provided" },
        400,
      );
    }
    if (body.transcript !== undefined && typeof body.transcript !== "string") {
      return jsonResponse({
        error: "transcript must be a string when provided",
      }, 400);
    }
    if (body.mode !== undefined && typeof body.mode !== "string") {
      return jsonResponse(
        { error: "mode must be a string when provided" },
        400,
      );
    }

    // Verify ownership before reading transcript rows, consuming quota, or
    // accepting inline content that will later update this session.
    let ownedSession: { id: string; mode: string } | null = null;
    if (sessionId) {
      const { data, error } = await db
        .from("sessions")
        .select("id, mode")
        .eq("id", sessionId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        console.error(
          "[summarize-session] Failed to verify session ownership:",
          error,
        );
        return jsonResponse({ error: "Unable to load session" }, 500);
      }
      if (!data) return jsonResponse({ error: "Session not found" }, 404);
      ownedSession = data;
    }

    const requestedMode = typeof body.mode === "string" ? body.mode.trim() : "";
    const mode = requestedMode || ownedSession?.mode || "Study Coach";
    let transcriptText = typeof body.transcript === "string"
      ? body.transcript
      : undefined;

    if (!transcriptText?.trim() && sessionId) {
      const { data: messages, error: transcriptError } = await db
        .from("session_messages")
        .select("role, message_text, time_offset_seconds, server_sequence")
        .eq("session_id", sessionId)
        .order("time_offset_seconds", { ascending: true })
        .order("server_sequence", { ascending: true });
      if (transcriptError) {
        console.error(
          "[summarize-session] Failed to load transcript:",
          transcriptError,
        );
        return jsonResponse(
          { error: "Unable to load session transcript" },
          500,
        );
      }
      if (messages?.length) {
        transcriptText = messages
          .map((message) =>
            `${
              message.role === "user" ? "Student" : "StudyPilot"
            }: ${message.message_text}`
          )
          .join("\n");
      }
    }

    if (!transcriptText?.trim()) {
      return jsonResponse({
        error: "No transcript content found for this session",
      }, 400);
    }

    const aiUsage = await consumeAiRequest(db, user.id);
    if (aiUsage.status === "unavailable") {
      return jsonResponse({ error: QUOTA_UNAVAILABLE_MESSAGE }, 503);
    }
    if (!aiUsage.usage.allowed) {
      return jsonResponse({ error: limitReachedMessage(aiUsage.usage) }, 429);
    }

    const modeInstruction = MODE_INSTRUCTIONS[mode] ??
      MODE_INSTRUCTIONS["Study Coach"];
    const prompt =
      `You are StudyPilot, a Socratic academic coach reviewing a completed coaching session.

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
- Never write content that would replace the student's own work`;

    const geminiResponse = await createGeminiInteraction({
      model: getGeminiTextModel(),
      input: prompt,
      store: true,
      generation_config: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
      },
    });
    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(
        "[summarize-session] Gemini API error:",
        geminiResponse.status,
        errorText,
      );
      const detail = describeGeminiError(errorText);
      return jsonResponse({
        error: `Failed to generate summary (Gemini ${geminiResponse.status}${
          detail ? ` ${detail}` : ""
        })`,
      }, 502);
    }

    const rawText = extractInteractionText(await geminiResponse.json());
    let parsed = parseSummaryJson(rawText);
    if (!parsed) {
      console.error(
        "[summarize-session] Failed to parse Gemini response:",
        rawText,
      );
      parsed = {
        summary: rawText.slice(0, 300) || "Session completed.",
        actionItems: [],
        followUpPrompts: [],
      };
    }

    const summary = typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : "Session completed.";
    const actionItems = Array.isArray(parsed.actionItems)
      ? parsed.actionItems.filter((item): item is string =>
        typeof item === "string" && Boolean(item.trim())
      ).slice(0, 5)
      : [];
    const followUpPrompts = Array.isArray(parsed.followUpPrompts)
      ? parsed.followUpPrompts.filter((item): item is string =>
        typeof item === "string" && Boolean(item.trim())
      ).slice(0, 3)
      : [];

    if (sessionId) {
      const { error: summaryUpdateError } = await db
        .from("sessions")
        .update({ summary })
        .eq("id", sessionId)
        .eq("user_id", user.id);
      if (summaryUpdateError) {
        console.error(
          "[summarize-session] Failed to save summary:",
          summaryUpdateError,
        );
        return jsonResponse({
          error: "Summary generated but could not be saved",
        }, 500);
      }

      if (actionItems.length > 0) {
        const { error: actionItemsError } = await db.from("action_items")
          .insert(
            actionItems.map((text) => ({
              user_id: user.id,
              session_id: sessionId,
              text,
              done: false,
            })),
          );
        if (actionItemsError) {
          console.error(
            "[summarize-session] Failed to save action items:",
            actionItemsError,
          );
          return jsonResponse({
            error: "Summary generated but action items could not be saved",
          }, 500);
        }
      }

      const { error: activityError } = await db.from("activity_logs").insert({
        user_id: user.id,
        event_type: "session_summarized",
        details: { session_id: sessionId, summary: summary.slice(0, 200) },
      });
      if (activityError) {
        console.error(
          "[summarize-session] Failed to log summary activity:",
          activityError,
        );
      }
    }

    return jsonResponse({ summary, actionItems, followUpPrompts });
  } catch (error) {
    console.error("[summarize-session] Error:", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Unexpected error",
    }, 500);
  }
});
