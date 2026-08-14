/**
 * ensure-file-search-store — create or return the user's Vertex RAG corpus.
 *
 * Function name kept for dashboard/extension allowlist compatibility.
 *
 * Input:  {}
 * Output: { ragCorpusName, displayName, fileSearchStoreName (compat) }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { verifyRequest } from "../shared/supabase-clients.ts"
import {
  createRagCorpus,
  ensureRagMetadataSchemas,
} from "../shared/vertex-rag.ts"
import { canUseGeminiInteractions } from "../shared/gemini-api.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const auth = await verifyRequest(req)
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
    const { user, db } = auth

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("vertex_rag_corpus_name, vertex_rag_corpus_display_name")
      .eq("id", user.id)
      .single()

    if (profileError) {
      return jsonResponse({ error: "Failed to fetch profile" }, 500)
    }

    if (profile.vertex_rag_corpus_name) {
      return jsonResponse({
        ragCorpusName: profile.vertex_rag_corpus_name,
        fileSearchStoreName: profile.vertex_rag_corpus_name,
        displayName:
          profile.vertex_rag_corpus_display_name || "studypilot-user-corpus",
      })
    }

    if (!canUseGeminiInteractions()) {
      return jsonResponse({
        error:
          "Vertex AI credentials are not configured for RAG corpus creation",
      }, 503)
    }

    const displayName = `studypilot-user-${user.id.slice(0, 8)}`
    const corpus = await createRagCorpus({ displayName })
    await ensureRagMetadataSchemas(corpus.name)

    const { error: updateError } = await db
      .from("profiles")
      .update({
        vertex_rag_corpus_name: corpus.name,
        vertex_rag_corpus_display_name: corpus.displayName || displayName,
      })
      .eq("id", user.id)
      .is("vertex_rag_corpus_name", null)

    if (updateError) {
      const { data: raced } = await db
        .from("profiles")
        .select("vertex_rag_corpus_name, vertex_rag_corpus_display_name")
        .eq("id", user.id)
        .single()
      if (raced?.vertex_rag_corpus_name) {
        return jsonResponse({
          ragCorpusName: raced.vertex_rag_corpus_name,
          fileSearchStoreName: raced.vertex_rag_corpus_name,
          displayName:
            raced.vertex_rag_corpus_display_name || displayName,
        })
      }
      return jsonResponse({ error: "Failed to update profile" }, 500)
    }

    const { data: saved } = await db
      .from("profiles")
      .select("vertex_rag_corpus_name, vertex_rag_corpus_display_name")
      .eq("id", user.id)
      .single()

    const name = saved?.vertex_rag_corpus_name ?? corpus.name
    return jsonResponse({
      ragCorpusName: name,
      fileSearchStoreName: name,
      displayName:
        saved?.vertex_rag_corpus_display_name || corpus.displayName ||
        displayName,
    })
  } catch (error) {
    console.error("[ensure-file-search-store]", error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
