/**
 * delete-knowledge-document — Vertex RAG file delete, then Storage, then DB.
 *
 * Input:  { knowledgeDocumentId: string }
 * Output: { success: true, documentId: string }
 *
 * Storage deletion uses only ownership-validated paths under
 * `{userId}/{rubricId}/...` in the `rubrics` bucket.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { verifyRequest } from "../shared/supabase-clients.ts"
import { deleteRagFile, isOwnedVertexRagFileName } from "../shared/vertex-rag.ts"
import { canUseVertexAi } from "../shared/gemini-api.ts"
import { getGoogleProjectId } from "../shared/oauth-helper.ts"
import {
  RUBRICS_STORAGE_BUCKET,
  validateOwnedStoragePath,
} from "../shared/storage-path.ts"
import { buildCorsHeaders, handleOptions } from "../shared/cors.ts"

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

  try {
    const auth = await verifyRequest(req)
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401)
    const { user, db } = auth

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const knowledgeDocumentId = typeof body.knowledgeDocumentId === "string"
      ? body.knowledgeDocumentId.trim()
      : ""
    if (!knowledgeDocumentId) {
      return jsonResponse({ error: "knowledgeDocumentId is required" }, 400)
    }

    const { data: doc, error: fetchError } = await db
      .from("knowledge_documents")
      .select(
        "id, user_id, rubric_id, vertex_rag_file_name, gemini_file_search_document_name, storage_path, storage_bucket",
      )
      .eq("id", knowledgeDocumentId)
      .eq("user_id", user.id)
      .single()

    if (fetchError || !doc) {
      return jsonResponse({ error: "Document not found or access denied" }, 404)
    }

    const { data: profile } = await db
      .from("profiles")
      .select("vertex_rag_corpus_name")
      .eq("id", user.id)
      .maybeSingle()

    const ownedCorpus =
      typeof profile?.vertex_rag_corpus_name === "string"
        ? profile.vertex_rag_corpus_name
        : null
    const ragFileName = (doc.vertex_rag_file_name as string | null) || null
    const projectId = getGoogleProjectId() ?? null

    if (ragFileName) {
      if (!isOwnedVertexRagFileName(ragFileName, ownedCorpus, projectId)) {
        console.warn(
          "[delete-knowledge-document] Skipping Vertex RAG delete; file is not under the user's corpus",
        )
      } else if (!canUseVertexAi()) {
        console.warn(
          "[delete-knowledge-document] Vertex credentials missing; skipping RAG delete",
        )
      } else {
        try {
          await deleteRagFile(ragFileName)
        } catch (error) {
          console.error(
            "[delete-knowledge-document] Vertex RAG delete failed:",
            error,
          )
          return jsonResponse({
            error: `Failed to delete from Vertex RAG: ${(error as Error).message}`,
          }, 502)
        }
      }
    }

    const validated = doc.rubric_id
      ? validateOwnedStoragePath(doc.storage_path, user.id, doc.rubric_id)
      : null

    if (doc.storage_path && !validated) {
      console.warn(
        "[delete-knowledge-document] Skipping Storage delete for untrusted path",
        doc.storage_path,
      )
    }

    if (validated) {
      const { error: storageError } = await db.storage
        .from(RUBRICS_STORAGE_BUCKET)
        .remove([validated.path])

      if (storageError) {
        console.error(
          "[delete-knowledge-document] Storage deletion failed:",
          storageError.message,
        )
        return jsonResponse({
          error: "Failed to delete uploaded document from Storage. Please try again.",
        }, 502)
      }
    }

    const { error: deleteError } = await db
      .from("knowledge_documents")
      .delete()
      .eq("id", knowledgeDocumentId)
      .eq("user_id", user.id)

    if (deleteError) {
      return jsonResponse({ error: "Failed to delete document record" }, 500)
    }

    if (doc.rubric_id) {
      await db.from("rubrics").update({
        file_search_status: "deleted",
        knowledge_document_id: null,
      }).eq("id", doc.rubric_id)
    }

    await db.from("activity_logs").insert({
      user_id: user.id,
      event_type: "document_deleted",
      details: { document_id: knowledgeDocumentId },
    })

    return jsonResponse({ success: true, documentId: knowledgeDocumentId })
  } catch (error) {
    console.error("[delete-knowledge-document] Error:", error)
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
