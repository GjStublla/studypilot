/**
 * Vertex AI RAG Engine helpers (OAuth service account only).
 *
 * Replaces Gemini Developer API File Search stores. Uses:
 * - ragCorpora.create / ragFiles:upload / ragFiles.delete
 * - :retrieveContexts for grounding
 * - RagDataSchema + RagMetadata for rubric_id filters
 */

import {
  getAccessToken,
  getGoogleProjectId,
  invalidateToken,
} from "./oauth-helper.ts"
import {
  describeGeminiApiError,
  getVertexLocation,
  getVertexRagLocation,
  hasServiceAccountCredentials,
  requireVertexProjectId,
} from "./gemini-api.ts"
import {
  metadataFilterForRubric,
  normalizeCitations,
  type NormalizedCitation,
} from "./file-search-normalize.ts"

export type VertexRagOperation = {
  name: string
  done: boolean
  error?: { code?: number; message?: string; status?: string }
  response?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type VertexRagQueryResult = {
  text: string
  groundingMetadata: Record<string, unknown> | null
  citations: NormalizedCitation[]
  usedFileSearch: boolean
  storeName: string
  model: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export function requireVertexAuth(): { projectId: string } {
  if (!hasServiceAccountCredentials()) {
    throw new Error(
      "Vertex service-account credentials required (GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY or GEMINI_SERVICE_ACCOUNT_CREDENTIALS)",
    )
  }
  return { projectId: requireVertexProjectId() }
}

export function vertexAiHost(location: string): string {
  return location === "global"
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`
}

export function ragCorpusParent(projectId: string, location?: string): string {
  const loc = location ?? getVertexRagLocation()
  return `projects/${projectId}/locations/${loc}`
}

export function ragCorpusPath(
  projectId: string,
  corpusIdOrName: string,
  location?: string,
): string {
  if (corpusIdOrName.includes("/ragCorpora/")) return corpusIdOrName
  return `${ragCorpusParent(projectId, location)}/ragCorpora/${corpusIdOrName}`
}

export function vertexResourceLocation(resourceName: string): string | null {
  const match = /\/locations\/([^/]+)/.exec(resourceName)
  return match?.[1] ?? null
}

const RAG_FILE_NAME_PATTERN =
  /^projects\/([^/]+)\/locations\/([^/]+)\/ragCorpora\/([^/]+)\/ragFiles\/([^/]+)$/

export function ownedRagFilePrefix(corpusName: string): string {
  return `${corpusName.replace(/\/+$/, "")}/ragFiles/`
}

/**
 * True when `fileName` is a Vertex RAG file under the user's owned corpus.
 * Do not trust client-updated columns — compare against the server-owned
 * profiles.vertex_rag_corpus_name prefix.
 */
export function isOwnedVertexRagFileName(
  fileName: string | null | undefined,
  ownedCorpusName: string | null | undefined,
  projectId?: string | null,
): boolean {
  if (typeof fileName !== "string" || typeof ownedCorpusName !== "string") {
    return false
  }
  const file = fileName.trim()
  const corpus = ownedCorpusName.trim().replace(/\/+$/, "")
  if (!file || !corpus) return false
  if (file.includes("..") || file.includes("\\")) return false

  const prefix = ownedRagFilePrefix(corpus)
  if (!file.startsWith(prefix)) return false
  const remainder = file.slice(prefix.length)
  if (!remainder || remainder.includes("/") || remainder.includes("..")) {
    return false
  }

  const match = RAG_FILE_NAME_PATTERN.exec(file)
  if (!match) return false
  if (projectId && match[1] !== projectId) return false
  const fileCorpus =
    `projects/${match[1]}/locations/${match[2]}/ragCorpora/${match[3]}`
  return fileCorpus === corpus
}

async function vertexFetch(
  path: string,
  init: RequestInit & { location?: string } = {},
): Promise<Response> {
  const projectId = requireVertexProjectId()
  const location = init.location ?? vertexResourceLocation(path) ?? getVertexRagLocation()
  const { location: _drop, headers, ...rest } = init
  const host = vertexAiHost(location)
  const url = path.startsWith("http")
    ? path
    : `https://${host}/v1beta1/${path.replace(/^\//, "")}`

  const doFetch = async () => {
    const token = await getAccessToken()
    return fetch(url, {
      ...rest,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(headers as Record<string, string> | undefined),
      },
    })
  }

  let response = await doFetch()
  if (response.status === 401) {
    invalidateToken()
    response = await doFetch()
  }
  return response
}

/**
 * New GCP projects cannot create Spanner-mode RAG corpora in us-central1
 * without allowlisting. Switch project RAG Engine config to Serverless
 * (us-central1 preview, open to all) before creating corpora.
 * Idempotent — safe to call on every corpus create.
 */
export async function ensureRagEngineServerlessMode(): Promise<void> {
  const { projectId } = requireVertexAuth()
  const location = getVertexRagLocation()
  const host = vertexAiHost(location)
  // ragEngineConfig uses v1 not v1beta1, and requires updateMask on PATCH.
  const name = `projects/${projectId}/locations/${location}/ragEngineConfig`
  const getUrl = `https://${host}/v1/${name}`
  const patchUrl = `https://${host}/v1/${name}?updateMask=ragManagedDbConfig`

  const doFetch = async (url: string, method: string, body?: string) => {
    const token = await getAccessToken()
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body } : {}),
    })
  }

  try {
    const getRes = await doFetch(getUrl, "GET")
    if (getRes.ok) {
      const cfg = await getRes.json() as {
        ragManagedDbConfig?: Record<string, unknown>
        rag_managed_db_config?: Record<string, unknown>
      }
      const managed =
        cfg.ragManagedDbConfig ?? cfg.rag_managed_db_config ?? {}
      if (managed && typeof managed === "object" && "serverless" in managed) {
        // Already serverless — nothing to do.
        return
      }
    }
  } catch (error) {
    console.warn("[vertex-rag] GetRagEngineConfig failed:", error)
  }

  // Switch to serverless mode. The updateMask tells the API exactly which
  // field to update — without it the PATCH is a no-op.
  const patchRes = await doFetch(
    patchUrl,
    "PATCH",
    JSON.stringify({ ragManagedDbConfig: { serverless: {} } }),
  )

  if (!patchRes.ok) {
    const text = await patchRes.text()
    console.warn(
      "[vertex-rag] UpdateRagEngineConfig(serverless):",
      patchRes.status,
      text.slice(0, 400),
    )
    // Throw so createRagCorpus knows the switch failed instead of proceeding
    // and hitting the same Spanner restriction error.
    throw new Error(
      `Failed to switch RAG Engine to Serverless mode (${patchRes.status}): ${text.slice(0, 300)}`,
    )
  }

  console.log("[vertex-rag] Switched RAG Engine to Serverless mode in", location)
}

export async function createRagCorpus(input: {
  displayName: string
}): Promise<{ name: string; displayName: string }> {
  await ensureRagEngineServerlessMode()
  const { projectId } = requireVertexAuth()
  const location = getVertexRagLocation()
  const parent = ragCorpusParent(projectId, location)
  const res = await vertexFetch(`${parent}/ragCorpora`, {
    method: "POST",
    location,
    body: JSON.stringify({
      display_name: input.displayName,
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Vertex RAG corpus create failed (${res.status}): ${describeGeminiApiError(text)}`,
    )
  }
  const data = JSON.parse(text) as { name?: string; displayName?: string; display_name?: string }
  // create may return LRO — if so, poll
  if (data.name && data.name.includes("/operations/")) {
    const op = await waitForVertexOperation(data.name, { location })
    const response = op.response ?? {}
    const name = typeof response.name === "string" ? response.name : ""
    if (!name) {
      throw new Error("Vertex RAG corpus create LRO returned no corpus name")
    }
    return {
      name,
      displayName:
        (typeof response.displayName === "string" && response.displayName) ||
        (typeof response.display_name === "string" && response.display_name) ||
        input.displayName,
    }
  }
  if (!data.name) {
    throw new Error("Vertex RAG corpus create returned no name")
  }
  return {
    name: data.name,
    displayName: data.displayName ?? data.display_name ?? input.displayName,
  }
}

/**
 * Ensure rubric_id + knowledge_document_id STRING schemas exist on the corpus.
 * Idempotent — ignores already-exists errors.
 */
export async function ensureRagMetadataSchemas(
  corpusName: string,
): Promise<void> {
  const keys = ["rubric_id", "knowledge_document_id"]
  const res = await vertexFetch(`${corpusName}/ragDataSchemas:batchCreate`, {
    method: "POST",
    body: JSON.stringify({
      parent: corpusName,
      requests: keys.map((key) => ({
        parent: corpusName,
        rag_data_schema: {
          key,
          schema_details: { type: "STRING" },
        },
      })),
    }),
  })
  if (res.ok || res.status === 409) return
  const text = await res.text()
  // Partial success / already exists often surfaces as 400 with ALREADY_EXISTS
  if (
    text.includes("ALREADY_EXISTS") ||
    text.includes("already exists") ||
    text.includes("Duplicate")
  ) {
    return
  }
  console.warn(
    "[vertex-rag] ragDataSchemas:batchCreate:",
    res.status,
    describeGeminiApiError(text),
  )
}

export async function attachRagFileMetadata(input: {
  ragFileName: string
  rubricId?: string | null
  knowledgeDocumentId: string
}): Promise<void> {
  const requests: Array<Record<string, unknown>> = [
    {
      parent: input.ragFileName,
      rag_metadata: {
        user_specified_metadata: {
          key: "knowledge_document_id",
          value: { str_value: input.knowledgeDocumentId },
        },
      },
    },
  ]
  if (input.rubricId) {
    requests.push({
      parent: input.ragFileName,
      rag_metadata: {
        user_specified_metadata: {
          key: "rubric_id",
          value: { str_value: input.rubricId },
        },
      },
    })
  }
  const res = await vertexFetch(
    `${input.ragFileName}/ragMetadata:batchCreate`,
    {
      method: "POST",
      body: JSON.stringify({
        parent: input.ragFileName,
        requests,
      }),
    },
  )
  if (res.ok || res.status === 409) return
  const text = await res.text()
  if (text.includes("ALREADY_EXISTS") || text.includes("already exists")) {
    return
  }
  console.warn(
    "[vertex-rag] ragMetadata:batchCreate:",
    res.status,
    describeGeminiApiError(text),
  )
}

/**
 * Multipart upload of local bytes into a Vertex RAG corpus (synchronous index).
 */
export async function uploadRagFile(input: {
  corpusName: string
  displayName: string
  mimeType: string
  bytes: Uint8Array
  description?: string
}): Promise<{ name: string; displayName: string }> {
  requireVertexAuth()
  const location = vertexResourceLocation(input.corpusName) ?? getVertexRagLocation()
  const host = vertexAiHost(location)
  const url =
    `https://${host}/upload/v1beta1/${input.corpusName}/ragFiles:upload`

  console.info("[vertex-rag] uploadRagFile", {
    uploadFilename: input.displayName,
    mimeType: input.mimeType,
  })

  const boundary = `studypilot_${crypto.randomUUID().replace(/-/g, "")}`
  const metadata = JSON.stringify({
    rag_file: {
      display_name: input.displayName,
      description: input.description ?? input.displayName,
    },
    upload_rag_file_config: {
      rag_file_transformation_config: {
        rag_file_chunking_config: {
          fixed_length_chunking: {
            chunk_size: 512,
            chunk_overlap: 100,
          },
        },
      },
    },
  })

  const enc = new TextEncoder()
const mid = enc.encode(
  `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${input.displayName}"\r\n` +
    `Content-Type: ${input.mimeType || "application/octet-stream"}\r\n\r\n`,
)
  const end = enc.encode(`\r\n--${boundary}--\r\n`)
  const body = new Uint8Array(mid.length + input.bytes.length + end.length)
  body.set(mid, 0)
  body.set(input.bytes, mid.length)
  body.set(end, mid.length + input.bytes.length)

  // Edge Functions idle-timeout around 150s — fail before the gateway kills us
  // so we can mark the knowledge document failed and allow retry.
  const UPLOAD_TIMEOUT_MS = 120_000

  const doFetch = async () => {
    const token = await getAccessToken()
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort("vertex-rag-upload-timeout"), UPLOAD_TIMEOUT_MS)
    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Goog-Upload-Protocol": "multipart",
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
        signal: ac.signal,
      })
    } catch (error) {
      if (ac.signal.aborted) {
        throw new Error(
          `Vertex RAG file upload timed out after ${UPLOAD_TIMEOUT_MS / 1000}s ` +
            `(corpus=${input.corpusName}). Check Vector Search / RAG Engine health on GCP.`,
        )
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  let res: Response
  try {
    res = await doFetch()
  } catch (error) {
    throw error
  }
  if (res.status === 401) {
    invalidateToken()
    res = await doFetch()
  }
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Vertex RAG file upload failed (${res.status}): ${describeGeminiApiError(text)}`,
    )
  }

  const data = JSON.parse(text) as Record<string, unknown>
  const ragFile = asRecord(data.ragFile) ?? asRecord(data.rag_file) ?? data
  const err = asRecord(data.error)
  if (err) {
    throw new Error(
      `Vertex RAG file upload error: ${err.message ?? JSON.stringify(err)}`,
    )
  }
  const name = typeof ragFile.name === "string" ? ragFile.name : ""
  if (!name) {
    throw new Error("Vertex RAG upload returned no ragFile.name")
  }
  return {
    name,
    displayName:
      (typeof ragFile.displayName === "string" && ragFile.displayName) ||
      (typeof ragFile.display_name === "string" && ragFile.display_name) ||
      input.displayName,
  }
}

export async function deleteRagFile(
  ragFileName: string,
): Promise<{ deleted: boolean; alreadyGone: boolean }> {
  const res = await vertexFetch(ragFileName, { method: "DELETE" })
  if (res.status === 404) {
    return { deleted: true, alreadyGone: true }
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(
      `Vertex RAG file delete failed (${res.status}): ${describeGeminiApiError(text)}`,
    )
  }
  return { deleted: true, alreadyGone: false }
}

export async function deleteRagCorpus(
  corpusName: string,
): Promise<{ deleted: boolean; alreadyGone: boolean }> {
  const res = await vertexFetch(`${corpusName}?force=true`, { method: "DELETE" })
  if (res.status === 404) return { deleted: true, alreadyGone: true }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(
      `Vertex RAG corpus delete failed (${res.status}): ${describeGeminiApiError(text)}`,
    )
  }
  const text = await res.text()
  if (text) {
    const data = JSON.parse(text) as { name?: string; done?: boolean }
    if (data.name?.includes("/operations/") && !data.done) {
      await waitForVertexOperation(data.name, {
        location: corpusName.split("/locations/")[1]?.split("/")[0],
      })
    }
  }
  return { deleted: true, alreadyGone: false }
}

export async function getVertexOperation(
  operationName: string,
  options?: { location?: string },
): Promise<VertexRagOperation> {
  const location = options?.location ??
    (operationName.includes("/locations/")
      ? operationName.split("/locations/")[1]?.split("/")[0]
      : getVertexRagLocation())
  const res = await vertexFetch(operationName, {
    method: "GET",
    location: location || getVertexRagLocation(),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Vertex operation get failed (${res.status}): ${describeGeminiApiError(text)}`,
    )
  }
  return parseOperation(JSON.parse(text))
}

export async function waitForVertexOperation(
  operationName: string,
  options?: { maxAttempts?: number; delayMs?: number; location?: string },
): Promise<VertexRagOperation> {
  const maxAttempts = options?.maxAttempts ?? 60
  const delayMs = options?.delayMs ?? 5_000
  let op = await getVertexOperation(operationName, {
    location: options?.location,
  })
  for (let i = 0; i < maxAttempts && !op.done; i++) {
    await new Promise((r) => setTimeout(r, delayMs))
    op = await getVertexOperation(operationName, {
      location: options?.location,
    })
  }
  if (!op.done) {
    throw new Error(`Vertex operation timed out: ${operationName}`)
  }
  if (op.error) {
    throw new Error(
      `Vertex operation failed: ${op.error.message ?? op.error.status ?? "unknown"}`,
    )
  }
  return op
}

function parseOperation(raw: unknown): VertexRagOperation {
  const record = asRecord(raw) ?? {}
  return {
    name: typeof record.name === "string" ? record.name : "",
    done: record.done === true,
    error: asRecord(record.error) as VertexRagOperation["error"],
    response: asRecord(record.response) ?? undefined,
    metadata: asRecord(record.metadata) ?? undefined,
  }
}

/**
 * Retrieve grounded contexts from a Vertex RAG corpus.
 */
export async function retrieveRagContexts(input: {
  corpusName: string
  query: string
  rubricId?: string | null
  topK?: number
}): Promise<{
  contexts: Array<Record<string, unknown>>
  groundingMetadata: Record<string, unknown>
  citations: NormalizedCitation[]
  text: string
}> {
  const { projectId } = requireVertexAuth()
  const location = vertexResourceLocation(input.corpusName) ?? getVertexRagLocation()
  const parent = ragCorpusParent(projectId, location)
  const corpusName = ragCorpusPath(projectId, input.corpusName, location)

  const ragRetrievalConfig: Record<string, unknown> = {
    top_k: input.topK ?? 8,
  }
  if (input.rubricId) {
    ragRetrievalConfig.filter = {
      metadata_filter: metadataFilterForRubric(input.rubricId),
    }
  }

  const res = await vertexFetch(`${parent}:retrieveContexts`, {
    method: "POST",
    location,
    body: JSON.stringify({
      vertex_rag_store: {
        rag_resources: [{ rag_corpus: corpusName }],
      },
      query: {
        text: input.query,
        rag_retrieval_config: ragRetrievalConfig,
      },
    }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(
      `Vertex retrieveContexts failed (${res.status}): ${describeGeminiApiError(text)}`,
    )
  }

  const data = JSON.parse(text) as Record<string, unknown>
  const contextsObj = asRecord(data.contexts) ?? data
  const contexts = Array.isArray((contextsObj as { contexts?: unknown }).contexts)
    ? ((contextsObj as { contexts: unknown[] }).contexts as Record<
      string,
      unknown
    >[])
    : Array.isArray(data.contexts)
    ? (data.contexts as Record<string, unknown>[])
    : []

  const groundingChunks = contexts.map((ctx) => {
    const source = asRecord(ctx.source) ?? {}
    const ragChunk = asRecord(ctx.ragChunk) ?? asRecord(ctx.rag_chunk) ?? {}
    const pageSpan = asRecord(ragChunk.pageSpan) ??
      asRecord(ragChunk.page_span) ??
      {}
    const firstPage = typeof pageSpan.firstPage === "number"
      ? pageSpan.firstPage
      : typeof pageSpan.first_page === "number"
      ? pageSpan.first_page
      : undefined
    return {
      retrievedContext: {
        title: typeof ctx.sourceDisplayName === "string"
          ? ctx.sourceDisplayName
          : typeof ctx.source_display_name === "string"
          ? ctx.source_display_name
          : typeof source.displayName === "string"
          ? source.displayName
          : undefined,
        uri: typeof ctx.sourceUri === "string"
          ? ctx.sourceUri
          : typeof ctx.source_uri === "string"
          ? ctx.source_uri
          : typeof ragChunk.name === "string"
          ? ragChunk.name
          : undefined,
        text: typeof ctx.text === "string"
          ? ctx.text
          : typeof ragChunk.text === "string"
          ? ragChunk.text
          : undefined,
        pageNumber: firstPage,
        documentName: typeof ragChunk.name === "string"
          ? ragChunk.name
          : undefined,
      },
    }
  })

  const groundingMetadata = { groundingChunks, contexts }
  const citations = normalizeCitations(groundingMetadata)
  const evidenceText = contexts
    .map((ctx, i) => {
      const body = typeof ctx.text === "string"
        ? ctx.text
        : typeof asRecord(ctx.ragChunk)?.text === "string"
        ? String(asRecord(ctx.ragChunk)!.text)
        : ""
      if (!body.trim()) return null
      const title = typeof ctx.sourceDisplayName === "string"
        ? ctx.sourceDisplayName
        : typeof ctx.source_display_name === "string"
        ? ctx.source_display_name
        : `chunk ${i + 1}`
      return `[${title}]\n${body.trim()}`
    })
    .filter(Boolean)
    .join("\n\n")

  return {
    contexts,
    groundingMetadata,
    citations,
    text: evidenceText,
  }
}

/**
 * Query Vertex RAG: retrieve contexts, optionally synthesize with Interactions.
 */
export async function queryVertexRag(input: {
  corpusName: string
  query: string
  rubricId?: string | null
  systemInstruction?: string
  model?: string
}): Promise<VertexRagQueryResult> {
  const retrieved = await retrieveRagContexts({
    corpusName: input.corpusName,
    query: input.query,
    rubricId: input.rubricId,
  })

  let answer = retrieved.text
  const { createVertexGenerateContent, extractGenerateContentText } = await import(
    "./gemini.ts"
  )
  const { getGeminiRagModel } = await import("./gemini-api.ts")
  const model = input.model ?? getGeminiRagModel()

  if (retrieved.text.trim()) {
    try {
      const prompt =
        `${input.systemInstruction ?? "Extract compact evidence from the retrieved rubric passages. Quote short passages. If nothing relevant, say so clearly."}\n\nQuestion: ${input.query}\n\nRetrieved passages:\n${retrieved.text}`
      const res = await createVertexGenerateContent({
        model,
        input: prompt,
        store: true,
        generation_config: { temperature: 0.2, max_output_tokens: 1024 },
      })
      if (res.ok) {
        const data = await res.json()
        const synthesized = extractGenerateContentText(data).trim()
        if (synthesized) answer = synthesized
      }
    } catch (error) {
      console.warn("[vertex-rag] synthesis failed; returning raw contexts", error)
    }
  } else {
    answer = "No relevant passages found in the indexed rubric document."
  }

  return {
    text: answer,
    groundingMetadata: retrieved.groundingMetadata,
    citations: retrieved.citations,
    usedFileSearch: retrieved.citations.length > 0 ||
      retrieved.contexts.length > 0,
    storeName: input.corpusName,
    model,
  }
}

/**
 * Interactions / generateContent tool config for Vertex RAG grounding.
 * Prefer retrieveRagContexts for citation-stable paths; this is for model-driven retrieval.
 */
export function vertexRagToolConfig(input: {
  corpusName: string
  rubricId?: string | null
  topK?: number
}): Record<string, unknown> {
  const ragRetrievalConfig: Record<string, unknown> = {
    top_k: input.topK ?? 8,
  }
  if (input.rubricId) {
    ragRetrievalConfig.filter = {
      metadata_filter: metadataFilterForRubric(input.rubricId),
    }
  }
  return {
    type: "retrieval",
    retrieval: {
      vertex_rag_store: {
        rag_resources: [{ rag_corpus: input.corpusName }],
        rag_retrieval_config: ragRetrievalConfig,
      },
    },
  }
}

/** Vertex Live WebSocket URL for BidiGenerateContent (OAuth Bearer, not ephemeral). */
export function vertexLiveWebSocketUrl(options?: {
  location?: string
  apiVersion?: string
}): string {
  const location = options?.location ?? getVertexLocation()
  const apiVersion = options?.apiVersion ?? "v1beta1"
  const host = vertexAiHost(location)
  return (
    `wss://${host}/ws/google.cloud.aiplatform.${apiVersion}` +
    `.LlmBidiService/BidiGenerateContent`
  )
}

export function vertexLiveModelResource(
  model: string,
  options?: { projectId?: string; location?: string },
): string {
  if (model.includes("/publishers/")) return model
  const projectId = options?.projectId ?? requireVertexProjectId()
  const location = options?.location ?? getVertexLocation()
  const short = model.startsWith("models/") ? model.slice("models/".length) : model
  return (
    `projects/${projectId}/locations/${location}/publishers/google/models/${short}`
  )
}

export { metadataFilterForRubric, normalizeCitations }
export type { NormalizedCitation }
