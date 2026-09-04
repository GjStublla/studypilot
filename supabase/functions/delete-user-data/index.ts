import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { verifyRequest } from "../shared/supabase-clients.ts"
import {
  deleteRagCorpus,
  deleteRagFile,
  isOwnedVertexRagFileName,
} from "../shared/vertex-rag.ts"
import { canUseVertexAi } from "../shared/gemini-api.ts"
import { getGoogleProjectId } from "../shared/oauth-helper.ts"
import {
  RUBRICS_STORAGE_BUCKET,
  validateOwnedStoragePath,
} from "../shared/storage-path.ts"
import { buildCorsHeaders, handleOptions } from "../shared/cors.ts"

type UserDocument = {
  rubric_id: string | null
  vertex_rag_file_name: string | null
  storage_path: string | null
  storage_bucket: string | null
}

function ownedSessionCapturePath(path: string | null, userId: string): string | null {
  if (!path || path.trim() !== path || path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    return null
  }
  const prefix = `${userId}/`
  if (!path.startsWith(prefix) || path.slice(prefix.length).includes("/")) return null
  return path
}

async function listStorageObjects(db: any, bucket: string, prefix: string): Promise<string[]> {
  const result: string[] = []
  const walk = async (current: string): Promise<void> => {
    let offset = 0
    while (true) {
      const { data, error } = await db.storage.from(bucket).list(current, { limit: 1000, offset })
      if (error) throw new Error(`Storage listing failed for ${bucket}`)
      for (const item of data ?? []) {
        const path = current ? `${current}/${item.name}` : item.name
        if (item.id) result.push(path)
        else await walk(path)
      }
      if (!data || data.length < 1000) break
      offset += data.length
    }
  }
  await walk(prefix)
  return result
}

async function removeStorageObjects(db: any, bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return
  const { error } = await db.storage.from(bucket).remove([...new Set(paths)])
  if (error) throw new Error(`Storage deletion failed for ${bucket}`)
}

async function deleteRows(db: any, table: string, userId: string): Promise<void> {
  const { error } = await db.from(table).delete().eq("user_id", userId)
  if (error) throw new Error(`Database cleanup failed for ${table}`)
}

async function deleteUserData(db: any, userId: string): Promise<void> {
  const [{ data: profile, error: profileError }, { data: documents, error: documentsError }, { data: rubrics, error: rubricsError }, { data: sessions, error: sessionsError }] = await Promise.all([
    db.from("profiles").select("vertex_rag_corpus_name").eq("id", userId).maybeSingle(),
    db.from("knowledge_documents").select("rubric_id, vertex_rag_file_name, storage_path, storage_bucket").eq("user_id", userId),
    db.from("rubrics").select("id, file_path").eq("user_id", userId),
    db.from("sessions").select("id, screenshot_path").eq("user_id", userId),
  ])
  if (profileError || documentsError || rubricsError || sessionsError) {
    throw new Error("Could not snapshot user-owned deletion resources")
  }

  const docs = (documents ?? []) as UserDocument[]
  const corpus = typeof profile?.vertex_rag_corpus_name === "string"
    ? profile.vertex_rag_corpus_name
    : null
  const projectId = getGoogleProjectId() ?? null
  const ragFiles = docs.map((doc) => doc.vertex_rag_file_name).filter((name): name is string =>
    isOwnedVertexRagFileName(name, corpus, projectId)
  )
  if ((ragFiles.length || corpus) && !canUseVertexAi()) {
    throw new Error("Vertex credentials are required to finish user data deletion")
  }
  for (const file of [...new Set(ragFiles)]) await deleteRagFile(file)
  if (corpus) await deleteRagCorpus(corpus)

  const rubricPaths = (rubrics ?? []).map((rubric: { id: string; file_path: string | null }) =>
    validateOwnedStoragePath(rubric.file_path, userId, rubric.id)?.path ?? null
  ).filter((path: string | null): path is string => Boolean(path))
  const documentPaths = docs.map((doc) =>
    doc.storage_bucket === RUBRICS_STORAGE_BUCKET && doc.storage_path && doc.rubric_id
      ? validateOwnedStoragePath(doc.storage_path, userId, doc.rubric_id)?.path ?? null
      : null
  ).filter((path: string | null): path is string => Boolean(path))
  const sessionPaths = (sessions ?? []).map((session: { screenshot_path: string | null }) =>
    ownedSessionCapturePath(session.screenshot_path, userId)
  ).filter((path: string | null): path is string => Boolean(path))
  const [rubricObjects, captureObjects] = await Promise.all([
    listStorageObjects(db, RUBRICS_STORAGE_BUCKET, userId),
    listStorageObjects(db, "session-captures", userId),
  ])
  await removeStorageObjects(db, RUBRICS_STORAGE_BUCKET, [...rubricObjects, ...rubricPaths, ...documentPaths])
  await removeStorageObjects(db, "session-captures", [...captureObjects, ...sessionPaths])

  for (const table of [
    "live_chat_rubric_lookups",
    "live_chat_sessions",
    "dashboard_chat_messages",
    "dashboard_chats",
    "action_items",
    "knowledge_documents",
    "sessions",
    "rubrics",
    "activity_logs",
    "ai_usage",
  ]) await deleteRows(db, table, userId)

  const { error: profileResetError } = await db.from("profiles").update({
    vertex_rag_corpus_name: null,
    vertex_rag_corpus_display_name: null,
  }).eq("id", userId)
  if (profileResetError) throw new Error("Database cleanup failed for profile")
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
  if (req.method === "OPTIONS") return handleOptions(cors)
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405)

  try {
    const auth = await verifyRequest(req)
    if (!auth) return response({ error: "Unauthorized" }, 401)
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mode = body.mode === "account" ? "account" : body.mode === "data" ? "data" : null
    if (!mode) return response({ error: "mode must be data or account" }, 400)

    await deleteUserData(auth.db, auth.user.id)
    if (mode === "account") {
      const { error } = await auth.db.auth.admin.deleteUser(auth.user.id)
      if (error) throw new Error("Account deletion failed after data cleanup")
    }
    return response({ success: true, mode })
  } catch (error) {
    console.error("[delete-user-data] cleanup failed:", error instanceof Error ? error.message : "unknown error")
    return response({ error: "Deletion could not be completed. No final success was recorded; retry is safe." }, 502)
  }
})