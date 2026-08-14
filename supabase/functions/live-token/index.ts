/**
 * live-token — mint Vertex Live OAuth credentials for the extension.
 *
 * Vertex Live uses BidiGenerateContent with a short-lived OAuth access token
 * (service account). Google AI Studio ephemeral auth_tokens / GEMINI_API_KEY
 * are not used.
 *
 * Input:  { liveSessionId, chatId, saveToDashboard, page?, mode? }
 * Output: accessToken, websocketUrl, model, authMode: "vertex", …
 *
 * Never returns service-account private keys or GEMINI_API_KEY.
 * Live access tokens are minted separately from RAG/admin (~15 min).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { verifyRequest } from "../shared/supabase-clients.ts"
import {
  consumeAiRequest,
  limitReachedMessage,
  QUOTA_UNAVAILABLE_MESSAGE,
  shouldBypassAiUsageLimits,
} from "../shared/ai-usage.ts"
import {
  buildContextSnapshot,
  turnsToGeminiContents,
} from "../shared/context.ts"
import {
  canUseVertexLive,
  getGeminiLiveModel,
  LIVE_API_VERSION,
} from "../shared/gemini-api.ts"
import { getGoogleProjectId, getLiveAccessToken } from "../shared/oauth-helper.ts"
import {
  vertexLiveModelResource,
  vertexLiveWebSocketUrl,
} from "../shared/vertex-rag.ts"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const LIVE_SYSTEM_PROMPT =
  `You are StudyPilot, a Socratic academic coach speaking live with a student.
Keep replies short and conversational. Ask guiding questions. Never write
assignment text for the student. When you need rubric document evidence, call
the search_rubric tool instead of inventing citations.`

const SEARCH_RUBRIC_DECLARATION = {
  name: "search_rubric",
  description:
    "Search the student's pinned rubric document for evidence relevant to the current coaching question. Call this when you need specific rubric criteria language or examples from the uploaded file.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "What to look up in the rubric document",
      },
    },
    required: ["query"],
  },
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

function optionalString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  try {
    const auth = await verifyRequest(req)
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
    const { user, db } = auth

    if (!canUseVertexLive()) {
      return jsonResponse({
        error:
          "Vertex AI credentials are required for Live (GOOGLE_PROJECT_ID + service account). GEMINI_API_KEY is not used.",
        blocker:
          "Configure Vertex service-account secrets. Live connects via Vertex BidiGenerateContent with a short-lived OAuth access token.",
      }, 503)
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const liveSessionId = optionalString(body.liveSessionId, 64)
    const chatId = optionalString(body.chatId, 64)
    if (!liveSessionId || !isUuid(liveSessionId)) {
      return jsonResponse({ error: "liveSessionId must be a UUID" }, 400)
    }
    if (!chatId || !isUuid(chatId)) {
      return jsonResponse({ error: "chatId must be a UUID" }, 400)
    }

    const saveToDashboard = body.saveToDashboard === true
    const page = body.page && typeof body.page === "object" &&
        !Array.isArray(body.page)
      ? body.page as Record<string, unknown>
      : undefined
    const pageTitle = optionalString(page?.title, 500)
    const pageUrl = optionalString(page?.url, 2_000)
    const mode = optionalString(body.mode, 100) ?? "Live Coach"

    const { data: chat, error: chatError } = await db
      .from("dashboard_chats")
      .select("id, rubric_id, title")
      .eq("id", chatId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (chatError || !chat) {
      return jsonResponse({ error: "Chat not found" }, 404)
    }

    const { error: lockError } = await db.rpc("ensure_chat_rubric_locked", {
      p_chat_id: chatId,
      p_user_id: user.id,
    })
    if (lockError) {
      console.error("[live-token] ensure_chat_rubric_locked failed:", lockError)
      return jsonResponse({
        error: "Unable to lock chat rubric context",
        detail: lockError.message,
      }, 503)
    }

    const skipQuota = shouldBypassAiUsageLimits({
      disabled: Deno.env.get("AI_USAGE_LIMITS_DISABLED"),
      supabaseUrl: Deno.env.get("SUPABASE_URL"),
    })
    const rawQuotaRequestId = optionalString(body.quotaRequestId, 64)
    const quotaRequestId = rawQuotaRequestId && isUuid(rawQuotaRequestId)
      ? rawQuotaRequestId
      : liveSessionId

    if (!skipQuota) {
      const { data: existingQuotaRow } = await db
        .from("live_chat_sessions")
        .select("id")
        .eq("user_id", user.id)
        .eq("quota_request_id", quotaRequestId)
        .maybeSingle()

      if (!existingQuotaRow) {
        const aiUsage = await consumeAiRequest(db, user.id)
        if (aiUsage.status === "unavailable") {
          return jsonResponse({ error: QUOTA_UNAVAILABLE_MESSAGE }, 503)
        }
        if (!aiUsage.usage.allowed) {
          return jsonResponse({ error: limitReachedMessage(aiUsage.usage) }, 429)
        }
      }
    }

    const { data: started, error: startError } = await db.rpc(
      "start_live_chat_session",
      {
        p_user_id: user.id,
        p_live_session_id: liveSessionId,
        p_chat_id: chatId,
        p_save_to_dashboard: saveToDashboard,
        p_page_title: pageTitle ?? null,
        p_page_url: pageUrl ?? null,
        p_mode: mode,
        p_quota_request_id: quotaRequestId,
      },
    )

    let liveRow: Record<string, unknown> | null = null
    if (startError) {
      console.error("[live-token] start_live_chat_session failed:", startError)
      return jsonResponse({
        error: "Unable to start live chat session",
        detail: startError.message,
      }, 503)
    }

    liveRow = Array.isArray(started) ? started[0] : started
    if (liveRow && typeof liveRow === "object") {
      const action = liveRow.action
      if (action === "conflict") {
        return jsonResponse({
          error: typeof liveRow.errorMessage === "string"
            ? liveRow.errorMessage
            : "Live session conflict",
        }, 409)
      }
    }

    const pageBlock = pageTitle || pageUrl
      ? `CURRENT PAGE:\n${pageTitle ? `Title: ${pageTitle}` : ""}${
        pageTitle && pageUrl ? "\n" : ""
      }${pageUrl ? `URL: ${pageUrl}` : ""}`
      : ""

    const snapshot = await buildContextSnapshot(db, {
      chatId,
      userId: user.id,
      baseSystemPrompt: LIVE_SYSTEM_PROMPT,
      extraContextBlocks: pageBlock ? [pageBlock] : [],
      maintainSummary: true,
    })

    const liveModel = getGeminiLiveModel()
    const projectId = getGoogleProjectId()
    const modelResource = vertexLiveModelResource(liveModel, { projectId })
    const websocketUrl = vertexLiveWebSocketUrl({
      apiVersion: LIVE_API_VERSION,
    })
    // Residual risk: Vertex BidiGenerateContent documents
    // https://www.googleapis.com/auth/cloud-platform as the OAuth scope.
    // We mint a *separate* ~15 min Live token (never the RAG/admin cache, never
    // GEMINI_API_KEY). Narrower aiplatform / generative-language scopes are
    // tried first; if Google rejects them, the Live token still has
    // cloud-platform and can call other GCP APIs this SA can access until expiry.
    const liveAuth = await getLiveAccessToken()
    if (liveAuth.usedCloudPlatform) {
      console.warn(
        "[live-token] Live token fell back to cloud-platform; narrower scopes were not accepted",
      )
    }
    const accessToken = liveAuth.accessToken
    const expireTime = new Date(liveAuth.expiresAt).toISOString()
    const newSessionExpireTime = new Date(Date.now() + 2 * 60_000).toISOString()

    const dashboardSessionId =
      (typeof liveRow?.sessionId === "string"
        ? liveRow.sessionId
        : typeof liveRow?.session_id === "string"
        ? liveRow.session_id
        : null) ?? snapshot.primarySessionId

    const responseBody = {
      authMode: "vertex" as const,
      accessToken,
      /** Compat: older clients expected ephemeralToken — same short-lived secret. */
      ephemeralToken: accessToken,
      websocketUrl,
      model: modelResource,
      modelId: liveModel,
      apiVersion: LIVE_API_VERSION,
      expireTime,
      newSessionExpireTime,
      liveSessionId,
      chatId,
      sessionId: dashboardSessionId,
      contextThroughSequence: snapshot.throughSequence,
      initialTurns: turnsToGeminiContents(snapshot.turns),
      systemInstruction: snapshot.systemInstruction,
      setupHints: {
        responseModalities: ["AUDIO"],
        historyConfig: { initialHistoryInClientContent: true },
        tools: [{ functionDeclarations: [SEARCH_RUBRIC_DECLARATION] }],
      },
      rubric: snapshot.rubric
        ? {
          id: snapshot.rubric.id,
          title: snapshot.rubric.title,
          course: snapshot.rubric.course,
          fileSearchStatus: snapshot.rubric.fileSearchStatus,
          criteriaCount: snapshot.rubric.criteria.length,
        }
        : null,
      ragReady: snapshot.usedFileSearchEligible,
      saveToDashboard,
    }

    return jsonResponse(responseBody)
  } catch (error) {
    console.error("[live-token] Error:", error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
