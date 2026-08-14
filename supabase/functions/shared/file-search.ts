/**
 * RAG helpers — Vertex AI RAG Engine only (compat facade).
 *
 * Historical File Search (GEMINI_API_KEY) paths are removed. Callers that still
 * use createFileSearchStore / queryFileSearch names hit Vertex RAG corpora.
 */

export {
  buildDocumentMetadata,
  decodeIndexOperationName,
  encodeIndexOperationName,
  metadataFilterForRubric,
  normalizeCitations,
  type FileSearchCustomMetadata,
  type NormalizedCitation,
} from "./file-search-normalize.ts"

export {
  attachRagFileMetadata,
  createRagCorpus,
  deleteRagFile,
  ensureRagMetadataSchemas,
  queryVertexRag as queryFileSearch,
  retrieveRagContexts,
  uploadRagFile,
  vertexRagToolConfig as fileSearchToolConfig,
  type VertexRagQueryResult as FileSearchQueryResult,
} from "./vertex-rag.ts"

/** @deprecated Use createRagCorpus — name kept for transitional imports. */
export { createRagCorpus as createFileSearchStore } from "./vertex-rag.ts"

/** @deprecated Use deleteRagFile. */
export { deleteRagFile as deleteFileSearchDocument } from "./vertex-rag.ts"

/** @deprecated Upload is synchronous on Vertex — no LRO poll needed. */
export async function uploadDocumentToStore(input: {
  storeName: string
  displayName: string
  mimeType: string
  bytes: Uint8Array
  customMetadata?: unknown
}): Promise<{ name: string; ragFileName: string; done: true }> {
  const { uploadRagFile } = await import("./vertex-rag.ts")
  const file = await uploadRagFile({
    corpusName: input.storeName,
    displayName: input.displayName,
    mimeType: input.mimeType,
    bytes: input.bytes,
  })
  return { name: file.name, ragFileName: file.name, done: true }
}

export async function waitForFileSearchOperation(
  _operationName: string,
): Promise<{ done: true; name: string; response?: Record<string, unknown> }> {
  throw new Error(
    "Vertex RAG uploads are synchronous; waitForFileSearchOperation is unused",
  )
}

export async function getFileSearchOperation(
  _operationName: string,
): Promise<{ done: boolean; name: string }> {
  throw new Error(
    "Vertex RAG uploads are synchronous; getFileSearchOperation is unused",
  )
}

export function extractDocumentNameFromOperation(op: {
  response?: Record<string, unknown>
  name?: string
}): string | null {
  if (typeof op.name === "string" && op.name.includes("/ragFiles/")) {
    return op.name
  }
  const response = op.response
  if (!response) return null
  if (typeof response.name === "string") return response.name
  return null
}
