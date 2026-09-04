/**
 * Gemini generateContent / streamGenerateContent client — Vertex-only.
 *
 * Uses the standard Vertex AI generateContent endpoint which works on any
 * GCP project with the Vertex AI API enabled and billing active. Does not
 * require the Agent Platform / Interactions API.
 *
 * Requires GOOGLE_PROJECT_ID + service-account credentials.
 * No GEMINI_API_KEY / Generative Language fallback for production paths.
 */

import {
  getAccessToken,
  getGoogleProjectId,
  invalidateToken,
} from "./oauth-helper.ts"
import {
  getGeminiTextModel as getTextModelFromApi,
  getVertexLocation,
  hasServiceAccountCredentials,
  normalizeGeminiModelId,
  requireVertexAiConfig,
} from "./gemini-api.ts"

type GeminiTextPart = { text: string }
type GeminiInlineDataPart = { inlineData: { mimeType: string; data: string } }
type GeminiPart = GeminiTextPart | GeminiInlineDataPart

/** Prefer the caller's purpose-specific model or GEMINI_TEXT_MODEL. */
export function getGeminiTextModel(): string {
  return getTextModelFromApi()
}

function isGeminiPart(value: unknown): value is GeminiPart {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  if (typeof record.text === "string" && record.text.trim().length > 0) {
    return true
  }
  const inlineData = record.inlineData
  if (!inlineData || typeof inlineData !== "object") return false
  const data = inlineData as Record<string, unknown>
  return typeof data.mimeType === "string" &&
    data.mimeType.trim().length > 0 &&
    typeof data.data === "string" &&
    data.data.trim().length > 0
}

function buildUserParts(body: Record<string, unknown>): GeminiPart[] {
  const parts = Array.isArray(body.parts) ? body.parts.filter(isGeminiPart) : []
  if (parts.length > 0) return parts
  const input = typeof body.input === "string" ? body.input : ""
  return [{ text: input }]
}

function toGenerateContentContents(
  body: Record<string, unknown>,
): Array<Record<string, unknown>> {
  if (Array.isArray(body.contents) && body.contents.length > 0) {
    return body.contents as Array<Record<string, unknown>>
  }

  // Legacy adapter input: an array of user/model steps.
  if (Array.isArray(body.input)) {
    const contents: Array<Record<string, unknown>> = []
    for (const step of body.input) {
      if (!step || typeof step !== "object") continue
      const s = step as Record<string, unknown>
      const role = s.type === "model_output" ? "model" : "user"
      const content = Array.isArray(s.content) ? s.content : []
      const parts = content
        .map((c: unknown) => {
          if (!c || typeof c !== "object") return null
          const block = c as Record<string, unknown>
          if (block.type === "text" && typeof block.text === "string") {
            return { text: block.text }
          }
          if (block.type === "image") {
            return {
              inlineData: {
                mimeType: block.mime_type ?? "image/jpeg",
                data: block.data,
              },
            }
          }
          return null
        })
        .filter(Boolean)
      if (parts.length > 0) {
        contents.push({ role, parts })
      }
    }
    return contents
  }

  // Plain string input or parts
  const parts = buildUserParts(body)
  return [{ role: "user", parts }]
}

/**
 * Build the canonical Vertex generateContent request body.
 */
export function buildVertexGenerateContentRequestBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const contents = toGenerateContentContents(body)

  const systemInstruction = typeof body.system_instruction === "string"
    ? { parts: [{ text: body.system_instruction }] }
    : typeof body.systemInstruction === "string"
    ? { parts: [{ text: body.systemInstruction }] }
    : undefined

  const rawConfig = body.generation_config ?? body.generationConfig
  const generationConfig = rawConfig && typeof rawConfig === "object" &&
      !Array.isArray(rawConfig)
    ? normalizeVertexGenerationConfig(rawConfig as Record<string, unknown>)
    : undefined

  // Only include Vertex-compatible tools (no file_search)
  const rawTools = Array.isArray(body.tools) ? body.tools : undefined
  const tools = rawTools?.filter((tool: unknown) => {
    if (!tool || typeof tool !== "object") return false
    const t = tool as Record<string, unknown>
    if (t.type === "file_search") return false
    if (t.file_search) return false
    return true
  })

  return {
    contents,
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(generationConfig ? { generationConfig } : {}),
    ...(tools?.length ? { tools } : {}),
  }
}

function normalizeVertexGenerationConfig(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config }
  if ("max_output_tokens" in result && !("maxOutputTokens" in result)) {
    result.maxOutputTokens = result.max_output_tokens
    delete result.max_output_tokens
  }
  if ("top_p" in result && !("topP" in result)) {
    result.topP = result.top_p
    delete result.top_p
  }
  if ("top_k" in result && !("topK" in result)) {
    result.topK = result.top_k
    delete result.top_k
  }
  return result
}

/**
 * Build the Vertex AI generateContent / streamGenerateContent endpoint URL.
 * Format: https://{host}/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:streamGenerateContent?alt=sse
 */
export function generateContentEndpoint(
  projectId: string,
  model: string,
  stream: boolean,
): string {
  const location = getVertexLocation()
  const useGlobalHost =
    location === "global" || location === "us" || location === "eu"
  const host = useGlobalHost
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`
  const resolvedLocation = useGlobalHost ? "us-central1" : location
  const method = stream ? "streamGenerateContent" : "generateContent"
  const suffix = stream ? "?alt=sse" : ""
  return `https://${host}/v1/projects/${projectId}/locations/${resolvedLocation}/publishers/google/models/${model}:${method}${suffix}`
}

/**
 * Calls Vertex AI streamGenerateContent / generateContent instead of the
 * legacy Agent Platform APIs.
 */
export async function createVertexGenerateContent(
  body: Record<string, unknown>,
): Promise<Response> {
  const projectId = getGoogleProjectId()
  requireVertexAiConfig(projectId)
  const stream = body.stream === true

  const model = normalizeGeminiModelId(
    (typeof body.model === "string" ? body.model : undefined) ||
      getGeminiTextModel(),
  )

  if (!projectId) {
    throw new Error("GOOGLE_PROJECT_ID is required for Vertex AI")
  }

  const requestBody = buildVertexGenerateContentRequestBody(body)
  const url = generateContentEndpoint(projectId, model, stream)

  const doFetch = async () => {
    const token = await getAccessToken()
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    })
  }

  let response = await doFetch()

  if (response.status === 401) {
    invalidateToken()
    response = await doFetch()
  }

  return response
}

export function describeGeminiError(errText: string): string {
  try {
    const parsed = JSON.parse(errText) as {
      error?: {
        status?: string
        message?: string
        details?: Array<{ reason?: string }>
      }
    }
    const status = parsed.error?.status ?? ""
    const reason =
      parsed.error?.details?.find((d) => typeof d?.reason === "string")
        ?.reason ?? ""
    const message = typeof parsed.error?.message === "string"
      ? parsed.error.message.slice(0, 180)
      : ""
    return [status, reason, message].filter(Boolean).join("/")
  } catch {
    return errText.trim().slice(0, 180)
  }
}

function collectText(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  if (Array.isArray(value)) {
    return value.map(collectText).join("")
  }
  const record = value as Record<string, unknown>
  if (typeof record.text === "string") return record.text
  return [
    collectText(record.content),
    collectText(record.parts),
  ].join("")
}

/**
 * Extract assistant text from a generateContent response (candidates array).
 * Also handles legacy response shapes for compatibility.
 */
export function extractGenerateContentText(response: unknown): string {
  if (!response || typeof response !== "object") return ""
  const record = response as Record<string, unknown>

  // generateContent response: { candidates: [{ content: { parts: [...] } }] }
  const candidates = Array.isArray(record.candidates) ? record.candidates : []
  if (candidates.length > 0) {
    return candidates
      .map((c: unknown) =>
        collectText((c as { content?: unknown })?.content)
      )
      .join("")
      .trim()
  }

  // Legacy response shapes kept only so old stored/replayed test fixtures parse.
  const steps = Array.isArray(record.steps) ? record.steps : []
  if (steps.length > 0) {
    const texts: string[] = []
    for (const step of steps) {
      if (!step || typeof step !== "object") continue
      const s = step as Record<string, unknown>
      if (s.type !== "model_output" && s.type !== "text") continue
      texts.push(collectText(s.content))
    }
    const joined = texts.join("").trim()
    if (joined) return joined
  }

  const outputs = Array.isArray(record.outputs) ? record.outputs : []
  if (outputs.length > 0) {
    const joined = outputs.map(collectText).join("").trim()
    if (joined) return joined
  }

  return ""
}

/**
 * Parse one SSE JSON payload from streamGenerateContent.
 * Each chunk is a generateContent candidate delta.
 * Also handles legacy SSE shapes for compatibility.
 */
export function parseVertexStreamEvent(parsed: unknown): {
  text: string
  grounding: Record<string, unknown> | null
  done: boolean
} {
  if (!parsed || typeof parsed !== "object") {
    return { text: "", grounding: null, done: false }
  }
  const record = parsed as Record<string, unknown>

  // streamGenerateContent SSE chunk: { candidates: [{ content: { parts: [...] }, finishReason?, ... }] }
  const candidates = Array.isArray(record.candidates) ? record.candidates : []
  if (candidates.length > 0) {
    const first = candidates[0] as Record<string, unknown>
    const text = collectText(first?.content)
    const grounding =
      first?.groundingMetadata && typeof first.groundingMetadata === "object"
        ? first.groundingMetadata as Record<string, unknown>
        : null
    // finishReason present and not STOP means still streaming; STOP = done
    const finishReason = typeof first?.finishReason === "string"
      ? first.finishReason
      : ""
    const done = finishReason === "STOP" || finishReason === "MAX_TOKENS"
    return { text, grounding, done }
  }

  // Legacy SSE event shapes.
  const eventType = typeof record.event_type === "string"
    ? record.event_type
    : ""

  if (
    eventType === "interaction.completed" ||
    eventType === "interaction.complete"
  ) {
    // Extract grounding annotations from model_output steps when present
    let grounding: Record<string, unknown> | null = null
    const interaction = record.interaction
    if (interaction && typeof interaction === "object") {
      const steps = Array.isArray((interaction as Record<string, unknown>).steps)
        ? (interaction as Record<string, unknown>).steps as unknown[]
        : []
      for (const step of steps) {
        if (!step || typeof step !== "object") continue
        const s = step as Record<string, unknown>
        if (s.type !== "model_output") continue
        const content = Array.isArray(s.content) ? s.content : []
        for (const block of content) {
          if (!block || typeof block !== "object") continue
          const b = block as Record<string, unknown>
          if (Array.isArray(b.annotations) && b.annotations.length > 0) {
            grounding = { annotations: b.annotations }
            break
          }
        }
        if (grounding) break
      }
    }
    return { text: "", grounding, done: true }
  }

  if (eventType === "step.delta" || eventType === "content.delta") {
    const delta = record.delta
    if (delta && typeof delta === "object") {
      const d = delta as Record<string, unknown>
      if (typeof d.text === "string") {
        return { text: d.text, grounding: null, done: false }
      }
    }
    return { text: "", grounding: null, done: false }
  }

  return { text: "", grounding: null, done: false }
}

// Keep legacy exports for callers that import these directly
export {
  canUseVertexAi,
  hasServiceAccountCredentials,
} from "./gemini-api.ts"
