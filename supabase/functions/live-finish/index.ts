/**
 * live-finish — close a live chat session; optionally summarize the saved session.
 *
 * Input:  { liveSessionId, status?, durationSeconds? }
 * Output: { ok, sessionId?, summaryStarted? }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { verifyRequest } from "../shared/supabase-clients.ts"
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
    const authHeader = req.headers.get("Authorization") ?? ""

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const liveSessionId = typeof body.liveSessionId === "string"
      ? body.liveSessionId.trim()
      : ""
    if (!liveSessionId || !isUuid(liveSessionId)) {
      return jsonResponse({ error: "liveSessionId must be a UUID" }, 400)
    }

    const rawStatus = typeof body.status === "string" && body.status.trim()
      ? body.status.trim().slice(0, 40)
      : typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim().slice(0, 40)
      : "finished"
    // Map extension reason codes onto migration finish statuses.
    const status = rawStatus === "error" || rawStatus === "failed"
      ? "failed"
      : rawStatus === "paused"
      ? "paused"
      : "finished"
    const durationSeconds = typeof body.durationSeconds === "number"
      ? Math.max(0, Math.floor(body.durationSeconds))
      : typeof body.duration_seconds === "number"
      ? Math.max(0, Math.floor(body.duration_seconds))
      : null
    const resumeHandle = typeof body.resumeHandle === "string"
      ? body.resumeHandle.trim().slice(0, 2_000) || null
      : typeof body.resume_handle === "string"
      ? body.resume_handle.trim().slice(0, 2_000) || null
      : null

    const { data, error } = await db.rpc("finish_live_chat_session", {
      p_user_id: user.id,
      p_live_session_id: liveSessionId,
      p_status: status,
      p_duration_seconds: durationSeconds,
      p_resume_handle: resumeHandle,
    })

    if (error) {
      console.error("[live-finish] finish_live_chat_session failed:", error)
      const httpStatus = error.code === "P0002" ? 404 : 503
      return jsonResponse({
        error: httpStatus === 404
          ? "Live session not found"
          : "Unable to finish live session",
        detail: error.message,
      }, httpStatus)
    }

    const row = (Array.isArray(data) ? data[0] : data) as Record<
      string,
      unknown
    > | null

    const sessionId =
      (typeof row?.sessionId === "string"
        ? row.sessionId
        : typeof row?.session_id === "string"
        ? row.session_id
        : null) ?? null

    // session_id is only set when save_to_dashboard was true at start.
    let summaryStarted = false
    if (sessionId && status === "finished") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
      const summarizeUrl = `${supabaseUrl}/functions/v1/summarize-session`
      summaryStarted = true
      fetch(summarizeUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        },
        body: JSON.stringify({ sessionId }),
      }).catch((err) => {
        console.warn("[live-finish] summarize-session kickoff failed:", err)
      })
    }

    return jsonResponse({
      ok: true,
      liveSessionId,
      status,
      sessionId,
      summaryStarted,
      ...(row && typeof row === "object" ? { live: row } : {}),
    })
  } catch (error) {
    console.error("[live-finish] Error:", error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
