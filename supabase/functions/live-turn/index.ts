/**
 * live-turn — idempotent commit of a finalized Live user/assistant pair.
 *
 * Input: {
 *   liveSessionId, requestId,
 *   userMessageId, assistantMessageId,
 *   userText, assistantText,
 *   userTimeOffsetSeconds?, assistantTimeOffsetSeconds?,
 *   groundingMetadata?
 * }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { verifyRequest } from "../shared/supabase-clients.ts"
import { liveTurnRpcHttpStatus, parseLiveTurnTexts } from "./validate.ts"
import { buildCorsHeaders, handleOptions } from "../shared/cors.ts"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }

  function requireUuid(value: unknown, field: string): string | Response {
    if (typeof value !== "string" || !isUuid(value.trim())) {
      return jsonResponse({ error: `${field} must be a UUID` }, 400)
    }
    return value.trim()
  }

  if (req.method === "OPTIONS") {
    return handleOptions(cors)
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  try {
    const auth = await verifyRequest(req)
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
    const { user, db } = auth

    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    const liveSessionId = requireUuid(body.liveSessionId, "liveSessionId")
    if (liveSessionId instanceof Response) return liveSessionId
    const requestId = requireUuid(body.requestId, "requestId")
    if (requestId instanceof Response) return requestId
    const userMessageId = requireUuid(body.userMessageId, "userMessageId")
    if (userMessageId instanceof Response) return userMessageId
    const assistantMessageId = requireUuid(
      body.assistantMessageId,
      "assistantMessageId",
    )
    if (assistantMessageId instanceof Response) return assistantMessageId

    const texts = parseLiveTurnTexts(body.userText, body.assistantText)
    if (!texts.ok) {
      return jsonResponse({ error: texts.error }, 400)
    }
    const { userText, assistantText } = texts

    // Migration uses a single p_time_offset_seconds (not split user/assistant).
    const timeOffsetSeconds = (() => {
      if (typeof body.timeOffsetSeconds === "number") {
        return Math.max(0, Math.floor(body.timeOffsetSeconds))
      }
      if (typeof body.time_offset_seconds === "number") {
        return Math.max(0, Math.floor(body.time_offset_seconds))
      }
      const userOffset =
        typeof body.userTimeOffsetSeconds === "number"
          ? body.userTimeOffsetSeconds
          : typeof body.user_time_offset_seconds === "number"
          ? body.user_time_offset_seconds
          : null
      const assistantOffset =
        typeof body.assistantTimeOffsetSeconds === "number"
          ? body.assistantTimeOffsetSeconds
          : typeof body.assistant_time_offset_seconds === "number"
          ? body.assistant_time_offset_seconds
          : null
      const candidates = [userOffset, assistantOffset].filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v),
      )
      if (!candidates.length) return 0
      return Math.max(0, Math.floor(Math.max(...candidates)))
    })()

    const originSurface = typeof body.originSurface === "string" &&
        body.originSurface.trim()
      ? body.originSurface.trim().slice(0, 40)
      : "extension"

    const usedFileSearch = body.usedFileSearch === true ||
      body.used_file_search === true
    const fileSearchStoreName = typeof body.fileSearchStoreName === "string"
      ? body.fileSearchStoreName.trim() || null
      : typeof body.file_search_store_name === "string"
      ? body.file_search_store_name.trim() || null
      : null

    const groundingMetadata =
      body.groundingMetadata && typeof body.groundingMetadata === "object" &&
        !Array.isArray(body.groundingMetadata)
        ? body.groundingMetadata
        : null

    const { data, error } = await db.rpc("commit_live_turn", {
      p_user_id: user.id,
      p_live_session_id: liveSessionId,
      p_request_id: requestId,
      p_user_message_id: userMessageId,
      p_assistant_message_id: assistantMessageId,
      p_user_text: userText,
      p_assistant_text: assistantText,
      p_time_offset_seconds: timeOffsetSeconds,
      p_origin_surface: originSurface,
      p_used_file_search: usedFileSearch,
      p_file_search_store_name: fileSearchStoreName,
      p_grounding_metadata: groundingMetadata,
    })

    if (error) {
      console.error("[live-turn] commit_live_turn failed:", error)
      const status = liveTurnRpcHttpStatus(error)
      const message = status === 404
        ? "Live session not found"
        : status === 400
        ? "Invalid live turn"
        : status === 409
        ? "Live session conflict"
        : "Unable to commit live turn"
      return jsonResponse({
        error: message,
        detail: error.message,
      }, status)
    }

    const row = Array.isArray(data) ? data[0] : data
    return jsonResponse({
      ok: true,
      ...(row && typeof row === "object" ? row : { result: row }),
    })
  } catch (error) {
    console.error("[live-turn] Error:", error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
