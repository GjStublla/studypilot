/**
 * index-knowledge-document — upload + index into Vertex AI RAG Engine.
 *
 * Consumes one AI quota unit per durable indexing claim. Vertex upload is
 * synchronous (chunk + index in the upload call).
 *
 * Input:  { knowledgeDocumentId: string }
 * Output: { knowledgeDocumentId, status, ragCorpusName, ragFileName? }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { verifyRequest } from "../shared/supabase-clients.ts"
import {
  consumeAiRequest,
  limitReachedMessage,
  QUOTA_UNAVAILABLE_MESSAGE,
} from "../shared/ai-usage.ts"
import {
  attachRagFileMetadata,
  createRagCorpus,
  ensureRagMetadataSchemas,
  uploadRagFile,
} from "../shared/vertex-rag.ts"
import {
  canUseGeminiInteractions,
  getGeminiEmbeddingModel,
} from "../shared/gemini-api.ts"
import {
  RUBRICS_STORAGE_BUCKET,
  validateOwnedStoragePath,
} from "../shared/storage-path.ts"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { buildCorsHeaders, handleOptions } from "../shared/cors.ts"

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void
}

const DOC_SELECT =
  "id, title, user_id, rubric_id, storage_path, storage_bucket, mime_type, extracted_text, index_status, index_error, vertex_rag_corpus_name, vertex_rag_file_name"

function jsonResponse(body: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

async function markFailed(
  db: SupabaseClient,
  knowledgeDocumentId: string,
  rubricId: string | null,
  message: string,
) {
  await db.from("knowledge_documents").update({
    index_status: "failed",
    index_error: message.slice(0, 2000),
  }).eq("id", knowledgeDocumentId)

  if (rubricId) {
    await db.from("rubrics").update({
      file_search_status: "failed",
      file_search_error: message.slice(0, 2000),
    }).eq("id", rubricId)
  }
}

async function markIndexed(
  db: SupabaseClient,
  input: {
    knowledgeDocumentId: string
    rubricId: string | null
    userId: string
    title: string
    corpusName: string
    ragFileName: string
  },
) {
  await db.from("knowledge_documents").update({
    vertex_rag_corpus_name: input.corpusName,
    vertex_rag_file_name: input.ragFileName,
    gemini_file_name: input.title,
    embedding_model: getGeminiEmbeddingModel(),
    index_status: "indexed",
    index_error: null,
    indexed_at: new Date().toISOString(),
  }).eq("id", input.knowledgeDocumentId)

  if (input.rubricId) {
    await db.from("rubrics").update({
      file_search_status: "indexed",
      file_search_error: null,
      knowledge_document_id: input.knowledgeDocumentId,
    }).eq("id", input.rubricId)
  }

  await db.from("activity_logs").insert({
    user_id: input.userId,
    event_type: "document_indexed",
    details: { document_title: input.title, backend: "vertex_rag" },
  })
}

function statusPayload(
  knowledgeDocumentId: string,
  doc: {
    index_status?: string | null
    vertex_rag_corpus_name?: string | null
    vertex_rag_file_name?: string | null
    index_error?: string | null
  },
  extras?: Record<string, unknown>,
) {
  return {
    knowledgeDocumentId,
    status: doc.index_status ?? "indexing",
    ragCorpusName: doc.vertex_rag_corpus_name ?? null,
    ragFileName: doc.vertex_rag_file_name ?? null,
    // Compat aliases for older dashboard clients
    fileSearchStoreName: doc.vertex_rag_corpus_name ?? null,
    fileSearchDocumentName: doc.vertex_rag_file_name ?? null,
    ...extras,
  }
}

/** Reclaim uploading/indexing rows left behind by Edge IDLE_TIMEOUT kills. */
const STALE_INDEX_MS = 3 * 60 * 1000

async function claimIndexingJob(
  db: SupabaseClient,
  knowledgeDocumentId: string,
  userId: string,
): Promise<
  | { action: "claimed"; doc: Record<string, unknown> }
  | { action: "replay"; doc: Record<string, unknown> }
  | { action: "missing" }
> {
  const { data: claimed } = await db
    .from("knowledge_documents")
    .update({
      index_status: "uploading",
      index_error: null,
    })
    .eq("id", knowledgeDocumentId)
    .eq("user_id", userId)
    .in("index_status", ["pending", "failed"])
    .select(DOC_SELECT)
    .maybeSingle()

  if (claimed) {
    return { action: "claimed", doc: claimed as Record<string, unknown> }
  }

  const { data: current } = await db
    .from("knowledge_documents")
    .select(DOC_SELECT + ", updated_at")
    .eq("id", knowledgeDocumentId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!current) return { action: "missing" }

  const status = String(current.index_status ?? "")
  const updatedAt = Date.parse(String((current as { updated_at?: string }).updated_at ?? ""))
  const stale =
    (status === "uploading" || status === "indexing") &&
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt > STALE_INDEX_MS

  if (stale) {
    const { data: reclaimed } = await db
      .from("knowledge_documents")
      .update({
        index_status: "uploading",
        index_error: null,
      })
      .eq("id", knowledgeDocumentId)
      .eq("user_id", userId)
      .in("index_status", ["uploading", "indexing"])
      .select(DOC_SELECT)
      .maybeSingle()
    if (reclaimed) {
      return { action: "claimed", doc: reclaimed as Record<string, unknown> }
    }
  }

  return { action: "replay", doc: current as Record<string, unknown> }
}

async function runVertexIndex(
  db: SupabaseClient,
  input: {
    knowledgeDocumentId: string
    userId: string
    claimedDoc: Record<string, unknown>
    priorStatus: string | null
    cors: Record<string, string>
  },
): Promise<Response> {
  const cors = input.cors
  const claimedDoc = input.claimedDoc
  const rubricId = (claimedDoc.rubric_id as string | null) ?? null
  const knowledgeDocumentId = input.knowledgeDocumentId

  const aiUsage = await consumeAiRequest(db, input.userId)
  if (aiUsage.status === "unavailable") {
    await db.from("knowledge_documents").update({
      index_status: input.priorStatus === "failed" ? "failed" : "pending",
      index_error: QUOTA_UNAVAILABLE_MESSAGE.slice(0, 2000),
    }).eq("id", knowledgeDocumentId)
    return jsonResponse({ error: QUOTA_UNAVAILABLE_MESSAGE }, 503)
  }
  if (!aiUsage.usage.allowed) {
    await db.from("knowledge_documents").update({
      index_status: input.priorStatus === "failed" ? "failed" : "pending",
      index_error: limitReachedMessage(aiUsage.usage).slice(0, 2000),
    }).eq("id", knowledgeDocumentId)
    return jsonResponse({ error: limitReachedMessage(aiUsage.usage) }, 429)
  }

  const { data: profile } = await db
    .from("profiles")
    .select("vertex_rag_corpus_name")
    .eq("id", input.userId)
    .single()

  let corpusName = profile?.vertex_rag_corpus_name as string | undefined
  if (!corpusName) {
    const displayName = `studypilot-user-${input.userId.slice(0, 8)}`
    const corpus = await createRagCorpus({ displayName })
    corpusName = corpus.name
    await ensureRagMetadataSchemas(corpusName)
    await db.from("profiles").update({
      vertex_rag_corpus_name: corpus.name,
      vertex_rag_corpus_display_name: corpus.displayName || displayName,
    }).eq("id", input.userId)
  } else {
    await ensureRagMetadataSchemas(corpusName)
  }

  await db.from("knowledge_documents").update({
    vertex_rag_corpus_name: corpusName,
  }).eq("id", knowledgeDocumentId)

  if (rubricId) {
    await db.from("rubrics").update({
      file_search_status: "indexing",
      file_search_error: null,
    }).eq("id", rubricId)
  }

  let bytes: Uint8Array | null = null
  let mimeType =
    (typeof claimedDoc.mime_type === "string" && claimedDoc.mime_type) ||
    "application/octet-stream"
  let displayName =
    (typeof claimedDoc.title === "string" && claimedDoc.title) || "document"

  const validated = rubricId
    ? validateOwnedStoragePath(
      typeof claimedDoc.storage_path === "string"
        ? claimedDoc.storage_path
        : null,
      input.userId,
      rubricId,
    )
    : null

  if (claimedDoc.storage_path && !validated) {
    console.warn(
      "[index-knowledge-document] Rejecting untrusted storage_path for",
      knowledgeDocumentId,
    )
  }

  if (validated) {
    const { data: fileBlob, error: downloadError } = await db.storage
      .from(RUBRICS_STORAGE_BUCKET)
      .download(validated.path)

    if (!downloadError && fileBlob) {
      bytes = new Uint8Array(await fileBlob.arrayBuffer())
      if (fileBlob.type) mimeType = fileBlob.type
      const base = validated.path.split("/").pop()
      if (base) displayName = base
    }
  }

  if (!bytes || bytes.byteLength === 0) {
    const extracted = typeof claimedDoc.extracted_text === "string"
      ? claimedDoc.extracted_text
      : ""
    if (!extracted.trim()) {
      await markFailed(
        db,
        knowledgeDocumentId,
        rubricId,
        validated
          ? "No file bytes or extracted text available to index"
          : "No trusted storage path or extracted text available to index",
      )
      return jsonResponse({ error: "No content available to index" }, 400)
    }
    bytes = new TextEncoder().encode(extracted)
    mimeType = "text/plain"
    displayName = `${displayName}.txt`
  }

  try {
    const ragFile = await uploadRagFile({
      corpusName,
      displayName,
      mimeType,
      bytes,
      description: `knowledge_document:${knowledgeDocumentId}`,
    })

    await attachRagFileMetadata({
      ragFileName: ragFile.name,
      rubricId,
      knowledgeDocumentId,
    })

    await markIndexed(db, {
      knowledgeDocumentId,
      rubricId,
      userId: input.userId,
      title: String(claimedDoc.title ?? "document"),
      corpusName,
      ragFileName: ragFile.name,
    })

    return jsonResponse({
      knowledgeDocumentId,
      status: "indexed",
      ragCorpusName: corpusName,
      ragFileName: ragFile.name,
      fileSearchStoreName: corpusName,
      fileSearchDocumentName: ragFile.name,
    })
  } catch (error) {
    console.error("[index-knowledge-document] Vertex RAG upload failed:", error)
    await markFailed(
      db,
      knowledgeDocumentId,
      rubricId,
      (error as Error).message,
    )
    return jsonResponse({
      error: (error as Error).message,
      knowledgeDocumentId,
      status: "failed",
    }, 502)
  }
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === "OPTIONS") {
    return handleOptions(cors)
  }
  // Bind cors to jsonResponse for this request so all responses in the
  // serve handler carry the correct CORS headers.
  const respond = (body: unknown, status = 200) =>
    jsonResponse(body, status, cors)

  try {
    const auth = await verifyRequest(req)
    if (!auth) return respond({ error: "Unauthorized" }, 401)
    const { user, db } = auth

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const knowledgeDocumentId = typeof body.knowledgeDocumentId === "string"
      ? body.knowledgeDocumentId.trim()
      : ""
    if (!knowledgeDocumentId) {
      return respond({ error: "knowledgeDocumentId is required" }, 400)
    }

    const { data: doc, error: docError } = await db
      .from("knowledge_documents")
      .select(DOC_SELECT)
      .eq("id", knowledgeDocumentId)
      .eq("user_id", user.id)
      .single()

    if (docError || !doc) {
      return respond({ error: "Document not found or access denied" }, 404)
    }

    if (doc.index_status === "indexed" && doc.vertex_rag_file_name) {
      return respond(statusPayload(knowledgeDocumentId, doc))
    }

    if (!canUseGeminiInteractions()) {
      return respond({
        error:
          "Vertex AI credentials are not configured for RAG indexing (GOOGLE_PROJECT_ID + service account)",
      }, 503)
    }

    // In-flight uploading/indexing is handled inside claimIndexingJob (replay
    // unless the row is stale after an Edge idle-timeout kill).

    const claim = await claimIndexingJob(db, knowledgeDocumentId, user.id)
    if (claim.action === "missing") {
      return respond({ error: "Document not found or access denied" }, 404)
    }
    if (claim.action === "replay") {
      const replay = claim.doc
      if (
        replay.index_status === "indexed" &&
        replay.vertex_rag_file_name
      ) {
        return respond(statusPayload(knowledgeDocumentId, {
          index_status: String(replay.index_status),
          vertex_rag_corpus_name: replay.vertex_rag_corpus_name as
            | string
            | null,
          vertex_rag_file_name: replay.vertex_rag_file_name as string | null,
          index_error: replay.index_error as string | null,
        }))
      }
      return respond(statusPayload(knowledgeDocumentId, {
        index_status: "indexing",
        vertex_rag_corpus_name: replay.vertex_rag_corpus_name as string | null,
        vertex_rag_file_name: replay.vertex_rag_file_name as string | null,
        index_error: replay.index_error as string | null,
      }))
    }

    const priorStatus = typeof doc.index_status === "string"
      ? doc.index_status
      : null

    // Prefer waitUntil so extract-rubric kickoffs stay reliable under Edge.
    const work = runVertexIndex(db, {
      knowledgeDocumentId,
      userId: user.id,
      claimedDoc: claim.doc,
      priorStatus,
      cors,
    })

    try {
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        // Still await — indexing is sync on Vertex and we need the response body.
        return await work
      }
    } catch {
      // fall through
    }
    return await work
  } catch (error) {
    console.error("[index-knowledge-document] Error:", error)
    return respond({ error: (error as Error).message }, 500)
  }
})
