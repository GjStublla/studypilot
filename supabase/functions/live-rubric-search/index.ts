/**
 * live-rubric-search — claim a live rubric lookup and run Vertex RAG retrieval.
 *
 * Input:  { liveSessionId, requestId, query }
 * Output: { evidence, citations, usedFileSearch, storeName? }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { verifyRequest } from "../shared/supabase-clients.ts"
import { queryVertexRag } from "../shared/vertex-rag.ts"
import { canUseVertexAi } from "../shared/gemini-api.ts"
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

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const liveSessionId = typeof body.liveSessionId === "string"
      ? body.liveSessionId.trim()
      : ""
    const requestId = typeof body.requestId === "string"
      ? body.requestId.trim()
      : ""
    const query = typeof body.query === "string" ? body.query.trim() : ""

    if (!liveSessionId || !isUuid(liveSessionId)) {
      return jsonResponse({ error: "liveSessionId must be a UUID" }, 400)
    }
    if (!requestId || !isUuid(requestId)) {
      return jsonResponse({ error: "requestId must be a UUID" }, 400)
    }
    if (!query) {
      return jsonResponse({ error: "query is required" }, 400)
    }

    const { data: liveSession } = await db
      .from("live_chat_sessions")
      .select("id, chat_id, status")
      .eq("id", liveSessionId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!liveSession) {
      return jsonResponse({ error: "Live session not found" }, 404)
    }

    const { data: claim, error: claimError } = await db.rpc(
      "claim_live_rubric_lookup",
      {
        p_live_session_id: liveSessionId,
        p_request_id: requestId,
      },
    )

    if (claimError) {
      console.error("[live-rubric-search] claim failed:", claimError)
      return jsonResponse({ error: "Unable to claim rubric lookup" }, 503)
    }

    const claimRow = (Array.isArray(claim) ? claim[0] : claim) as Record<
      string,
      unknown
    > | null

    if (claimRow?.allowed === false || claimRow?.action === "denied") {
      return jsonResponse({
        error: typeof claimRow.errorMessage === "string"
          ? claimRow.errorMessage
          : "Rubric lookup limit reached for this live session",
        lookupCount: claimRow.rubricLookupCount ?? claimRow.rubric_lookup_count,
        lookupCap: claimRow.rubricLookupCap ?? claimRow.rubric_lookup_cap,
      }, 429)
    }

    if (claimRow?.action === "error") {
      return jsonResponse({
        error: typeof claimRow.errorMessage === "string"
          ? claimRow.errorMessage
          : "Live session is already closed",
      }, typeof claimRow.errorStatus === "number" ? claimRow.errorStatus : 409)
    }

    const { data: chat } = await db
      .from("dashboard_chats")
      .select("id, rubric_id")
      .eq("id", liveSession.chat_id)
      .eq("user_id", user.id)
      .maybeSingle()

    const rubricId = chat?.rubric_id as string | null
    if (!rubricId) {
      return jsonResponse({
        evidence: "",
        citations: [],
        usedFileSearch: false,
        message: "No rubric is pinned to this chat",
      })
    }

    const { data: rubric } = await db
      .from("rubrics")
      .select(
        "id, title, course, extracted_text, file_search_status, rubric_criteria(name, score, max_score)",
      )
      .eq("id", rubricId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!rubric) {
      return jsonResponse({
        evidence: "",
        citations: [],
        usedFileSearch: false,
        message: "Pinned rubric not found",
      })
    }

    const { data: profile } = await db
      .from("profiles")
      .select("vertex_rag_corpus_name")
      .eq("id", user.id)
      .maybeSingle()

    const corpusName = profile?.vertex_rag_corpus_name as string | null
    const indexed = rubric.file_search_status === "indexed" && corpusName &&
      canUseVertexAi()

    if (!indexed) {
      const criteria = ((rubric.rubric_criteria as
        | Array<Record<string, unknown>>
        | null) ?? [])
        .map((c) => `- ${c.name}: ${c.score ?? 0}/${c.max_score ?? 4}`)
        .join("\n")
      const summary = typeof rubric.extracted_text === "string"
        ? rubric.extracted_text.slice(0, 1500)
        : ""
      return jsonResponse({
        evidence:
          `Rubric "${rubric.title}" (${rubric.course}) is not Vertex-RAG indexed yet (status: ${rubric.file_search_status}).\nCriteria:\n${criteria}${
            summary ? `\nSummary:\n${summary}` : ""
          }`,
        citations: [],
        usedFileSearch: false,
        fileSearchStatus: rubric.file_search_status,
      })
    }

    const result = await queryVertexRag({
      corpusName: corpusName!,
      query,
      rubricId,
      systemInstruction:
        `Extract compact evidence from the student's rubric relevant to: ${query}. Quote short passages. If nothing relevant is found, say so clearly.`,
    })

    return jsonResponse({
      evidence: result.text,
      citations: result.citations,
      usedFileSearch: result.usedFileSearch,
      storeName: result.storeName,
      ragCorpusName: result.storeName,
      groundingMetadata: result.groundingMetadata,
      requestId,
      liveSessionId,
    })
  } catch (error) {
    console.error("[live-rubric-search] Error:", error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
