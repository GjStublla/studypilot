/**
 * Normalize Vertex RAG / Interactions citations into a stable dashboard shape.
 *
 * Handles:
 * - Vertex retrieveContexts groundingChunks[].retrievedContext
 * - Interactions annotations[] including file_citation
 * - Legacy File Search shapes (migration / tests)
 */

export type FileSearchCustomMetadata = {
  key: string
  stringValue?: string
  numericValue?: number
}

export type NormalizedCitation = {
  title?: string
  uri?: string
  text?: string
  pageNumber?: number
  documentName?: string
  fileSearchStore?: string
  mediaId?: string
  customMetadata?: FileSearchCustomMetadata[]
}

export const INDEX_OP_PREFIX = "op:"

export function encodeIndexOperationName(operationName: string): string {
  return `${INDEX_OP_PREFIX}${operationName}`
}

export function decodeIndexOperationName(
  indexError: string | null | undefined,
): string | null {
  if (!indexError?.startsWith(INDEX_OP_PREFIX)) return null
  const name = indexError.slice(INDEX_OP_PREFIX.length).trim()
  return name || null
}

export function buildDocumentMetadata(input: {
  rubricId?: string | null
  knowledgeDocumentId: string
}): FileSearchCustomMetadata[] {
  const meta: FileSearchCustomMetadata[] = [
    { key: "knowledge_document_id", stringValue: input.knowledgeDocumentId },
  ]
  if (input.rubricId) {
    meta.push({ key: "rubric_id", stringValue: input.rubricId })
  }
  return meta
}

/** Vertex RAG Engine CEL metadata filter (string equality). */
export function metadataFilterForRubric(rubricId: string): string {
  const escaped = rubricId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  return `rubric_id == "${escaped}"`
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readPageNumber(meta: unknown): number | undefined {
  if (!Array.isArray(meta)) return undefined
  for (const item of meta) {
    const row = asRecord(item)
    if (!row) continue
    const key = typeof row.key === "string" ? row.key.toLowerCase() : ""
    if (key === "page" || key === "page_number" || key === "pagenumber") {
      if (typeof row.numericValue === "number") return row.numericValue
      if (typeof row.stringValue === "string") {
        const n = Number(row.stringValue)
        if (Number.isFinite(n)) return n
      }
    }
  }
  return undefined
}

function coercePageNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

function citationKey(c: NormalizedCitation): string {
  return [
    c.title ?? "",
    c.uri ?? "",
    c.documentName ?? "",
    c.pageNumber ?? "",
    (c.text ?? "").slice(0, 80),
  ].join("|")
}

function pushUnique(
  citations: NormalizedCitation[],
  seen: Set<string>,
  citation: NormalizedCitation,
) {
  const hasSignal = Boolean(
    citation.title || citation.uri || citation.text || citation.documentName ||
      citation.pageNumber != null,
  )
  if (!hasSignal) return
  const key = citationKey(citation)
  if (seen.has(key)) return
  seen.add(key)
  citations.push(citation)
}

function fromRetrievedOrWeb(row: Record<string, unknown>): NormalizedCitation | null {
  const ctx = asRecord(row.retrievedContext) ??
    asRecord(row.retrieved_context) ??
    asRecord(row.web) ??
    asRecord(row.ragChunk) ??
    asRecord(row.rag_chunk)

  if (!ctx && (typeof row.text === "string" || typeof row.sourceUri === "string")) {
    // Flat Vertex context row
    const pageSpan = asRecord(row.pageSpan) ?? asRecord(row.page_span)
    return {
      title: typeof row.sourceDisplayName === "string"
        ? row.sourceDisplayName
        : typeof row.source_display_name === "string"
        ? row.source_display_name
        : undefined,
      uri: typeof row.sourceUri === "string"
        ? row.sourceUri
        : typeof row.source_uri === "string"
        ? row.source_uri
        : undefined,
      text: typeof row.text === "string" ? row.text : undefined,
      pageNumber: coercePageNumber(pageSpan?.firstPage) ??
        coercePageNumber(pageSpan?.first_page),
    }
  }

  if (!ctx) return null

  const customMetadata = Array.isArray(ctx.customMetadata)
    ? (ctx.customMetadata as FileSearchCustomMetadata[])
    : Array.isArray(ctx.custom_metadata)
    ? (ctx.custom_metadata as FileSearchCustomMetadata[])
    : undefined

  const pageSpan = asRecord(ctx.pageSpan) ?? asRecord(ctx.page_span)
  const pageFromField = coercePageNumber(ctx.pageNumber) ??
    coercePageNumber(ctx.page_number) ??
    coercePageNumber(pageSpan?.firstPage) ??
    coercePageNumber(pageSpan?.first_page)

  return {
    title: typeof ctx.title === "string"
      ? ctx.title
      : typeof ctx.sourceDisplayName === "string"
      ? ctx.sourceDisplayName
      : undefined,
    uri: typeof ctx.uri === "string"
      ? ctx.uri
      : typeof ctx.url === "string"
      ? ctx.url
      : typeof ctx.sourceUri === "string"
      ? ctx.sourceUri
      : undefined,
    text: typeof ctx.text === "string" ? ctx.text : undefined,
    pageNumber: pageFromField ?? readPageNumber(customMetadata),
    documentName: typeof ctx.documentName === "string"
      ? ctx.documentName
      : typeof ctx.document_name === "string"
      ? ctx.document_name
      : typeof ctx.name === "string"
      ? ctx.name
      : undefined,
    fileSearchStore: typeof ctx.fileSearchStore === "string"
      ? ctx.fileSearchStore
      : typeof ctx.ragCorpus === "string"
      ? ctx.ragCorpus
      : undefined,
    mediaId: typeof ctx.mediaId === "string"
      ? ctx.mediaId
      : typeof ctx.media_id === "string"
      ? ctx.media_id
      : undefined,
    customMetadata,
  }
}

export function citationFromAnnotation(
  annotation: unknown,
): NormalizedCitation | null {
  const row = asRecord(annotation)
  if (!row) return null

  const nested = asRecord(row.file_citation) ?? asRecord(row.fileCitation)
  if (nested) {
    const title = typeof nested.file_name === "string"
      ? nested.file_name
      : typeof nested.fileName === "string"
      ? nested.fileName
      : typeof nested.title === "string"
      ? nested.title
      : undefined
    const uri = typeof nested.source === "string"
      ? nested.source
      : typeof nested.uri === "string"
      ? nested.uri
      : typeof nested.url === "string"
      ? nested.url
      : undefined
    const pageNumber = coercePageNumber(nested.page_number) ??
      coercePageNumber(nested.pageNumber)
    const text = typeof nested.text === "string"
      ? nested.text
      : typeof nested.snippet === "string"
      ? nested.snippet
      : undefined
    return {
      title,
      uri,
      text,
      pageNumber,
      documentName: typeof nested.document_name === "string"
        ? nested.document_name
        : typeof nested.documentName === "string"
        ? nested.documentName
        : title,
    }
  }

  const type = typeof row.type === "string" ? row.type.toLowerCase() : ""
  if (
    type === "file_citation" || type === "filecitation" ||
    "file_name" in row || "fileName" in row || "page_number" in row
  ) {
    const title = typeof row.file_name === "string"
      ? row.file_name
      : typeof row.fileName === "string"
      ? row.fileName
      : typeof row.title === "string"
      ? row.title
      : undefined
    const uri = typeof row.source === "string"
      ? row.source
      : typeof row.uri === "string"
      ? row.uri
      : typeof row.url === "string"
      ? row.url
      : undefined
    const pageNumber = coercePageNumber(row.page_number) ??
      coercePageNumber(row.pageNumber)
    const text = typeof row.text === "string"
      ? row.text
      : typeof row.snippet === "string"
      ? row.snippet
      : undefined
    if (title || uri || pageNumber != null || text) {
      return { title, uri, text, pageNumber, documentName: title }
    }
  }

  return fromRetrievedOrWeb(row)
}

export function normalizeCitations(
  groundingMetadata: unknown,
): NormalizedCitation[] {
  const gm = asRecord(groundingMetadata)
  if (!gm) return []

  const citations: NormalizedCitation[] = []
  const seen = new Set<string>()

  const annotationLists: unknown[] = []
  if (Array.isArray(gm.annotations)) annotationLists.push(...gm.annotations)
  if (Array.isArray(gm.groundingChunks)) {
    annotationLists.push(...gm.groundingChunks)
  }
  if (Array.isArray(gm.grounding_chunks)) {
    annotationLists.push(...gm.grounding_chunks)
  }
  if (Array.isArray(gm.contexts)) annotationLists.push(...gm.contexts)

  for (const item of annotationLists) {
    const citation = citationFromAnnotation(item) ??
      (asRecord(item) ? fromRetrievedOrWeb(asRecord(item)!) : null)
    if (citation) pushUnique(citations, seen, citation)
  }

  return citations
}
