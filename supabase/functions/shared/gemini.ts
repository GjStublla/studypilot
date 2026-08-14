/**
 * Gemini Interactions API client — Vertex-only.
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
  type GeminiAuthMode,
  getGeminiTextModel as getTextModelFromApi,
  getVertexLocation,
  hasServiceAccountCredentials,
  interactionsHeaders,
  normalizeGeminiModelId,
  resolveInteractionsAuthMode,
} from "./gemini-api.ts"

type GeminiTextPart = { text: string }
type GeminiInlineDataPart = { inlineData: { mimeType: string; data: string } }
type GeminiPart = GeminiTextPart | GeminiInlineDataPart

/** Prefer GEMINI_TEXT_MODEL / gemini-3.5-flash (see gemini-api.ts). */
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

function partToInteractionContent(
  part: GeminiPart,
): Record<string, unknown> {
  if ("text" in part) {
    return { type: "text", text: part.text }
  }
  return {
    type: "image",
    data: part.inlineData.data,
    mime_type: part.inlineData.mimeType,
  }
}

/**
 * Convert generateContent-style `contents` into Interactions `input` steps.
 * Callers may also pass `input` (string | array) directly.
 */
export function contentsToInteractionInput(
  contents: unknown[],
): Array<Record<string, unknown>> {
  const steps: Array<Record<string, unknown>> = []
  for (const raw of contents) {
    if (!raw || typeof raw !== "object") continue
    const row = raw as Record<string, unknown>
    const role = typeof row.role === "string" ? row.role : "user"
    const parts = Array.isArray(row.parts)
      ? row.parts.filter(isGeminiPart).map(partToInteractionContent)
      : []
    if (parts.length === 0) continue
    if (role === "model" || role === "assistant") {
      steps.push({ type: "model_output", content: parts })
    } else {
      steps.push({ type: "user_input", content: parts })
    }
  }
  return steps
}

/**
 * Normalize tools for Interactions.
 * Accepts Vertex `retrieval` / `vertex_rag_store` and rejects bare File Search
 * store tools (Developer API only — not available on Vertex).
 */
export function normalizeInteractionTools(
  tools: unknown[] | undefined,
): unknown[] | undefined {
  if (!tools?.length) return undefined
  return tools.map((tool) => {
    if (!tool || typeof tool !== "object") return tool
    const record = tool as Record<string, unknown>
    if (typeof record.type === "string") {
      if (record.type === "file_search") {
        throw new Error(
          "Gemini File Search tools are not supported on Vertex. Use Vertex RAG (retrieval / vertex_rag_store).",
        )
      }
      return tool
    }
    if (record.retrieval && typeof record.retrieval === "object") {
      return { type: "retrieval", ...record }
    }
    if (record.file_search && typeof record.file_search === "object") {
      throw new Error(
        "Gemini File Search tools are not supported on Vertex. Use Vertex RAG (retrieval / vertex_rag_store).",
      )
    }
    return tool
  })
}

/** Normalize camelCase generation_config keys to Interactions snake_case. */
export function normalizeGenerationConfig(
  config: unknown,
): Record<string, unknown> | undefined {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return undefined
  }
  const src = config as Record<string, unknown>
  const out: Record<string, unknown> = { ...src }
  if ("maxOutputTokens" in src && !("max_output_tokens" in src)) {
    out.max_output_tokens = src.maxOutputTokens
    delete out.maxOutputTokens
  }
  if ("topP" in src && !("top_p" in src)) {
    out.top_p = src.topP
    delete out.topP
  }
  if ("topK" in src && !("top_k" in src)) {
    out.top_k = src.topK
    delete out.topK
  }
  return out
}

export function buildInteractionRequestBody(
  body: Record<string, unknown>,
  model: string,
): Record<string, unknown> {
  const stream = body.stream === true
  const systemInstruction = typeof body.system_instruction === "string"
    ? body.system_instruction
    : typeof body.systemInstruction === "string"
    ? body.systemInstruction
    : undefined

  let input: unknown = body.input
  if (input === undefined || input === null || input === "") {
    if (Array.isArray(body.contents) && body.contents.length > 0) {
      input = contentsToInteractionInput(body.contents)
    } else {
      const parts = buildUserParts(body)
      input = parts.map(partToInteractionContent)
    }
  }

  const tools = normalizeInteractionTools(
    Array.isArray(body.tools) ? body.tools : undefined,
  )
  const generationConfig = normalizeGenerationConfig(
    body.generation_config ?? body.generationConfig,
  )

  return {
    model,
    input,
    stream,
    // Vertex Interactions for Gemini 3.x requires store:true.
    store: body.store === false ? false : true,    ...(typeof body.previous_interaction_id === "string"
      ? { previous_interaction_id: body.previous_interaction_id }
      : {}),
    ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
    ...(tools ? { tools } : {}),
    ...(generationConfig ? { generation_config: generationConfig } : {}),
  }
}

export function interactionsEndpoint(
  mode: GeminiAuthMode,
  projectId: string | undefined,
  stream: boolean,
): string {
  const suffix = stream ? "?alt=sse" : ""
  if (mode !== "vertex-interactions") {
    throw new Error(`Unsupported Interactions mode: ${mode}`)
  }
  if (!projectId) {
    throw new Error("GOOGLE_PROJECT_ID is required for Vertex Interactions")
  }
  const location = getVertexLocation()
  // Multi-region codes (global/us/eu) share the global AI Platform hostname.
  // Only true regional IDs (us-central1, …) use {region}-aiplatform.googleapis.com —
  // and those are normalized away for Interactions via getVertexLocation().
  const useGlobalHost =
    location === "global" || location === "us" || location === "eu"
  const host = useGlobalHost
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`
  return `https://${host}/v1beta1/projects/${projectId}/locations/${location}/interactions${suffix}`
}

export async function createGeminiInteraction(
  body: Record<string, unknown>,
): Promise<Response> {
  const projectId = getGoogleProjectId()
  const mode = resolveInteractionsAuthMode(projectId)
  const stream = body.stream === true

  const model = normalizeGeminiModelId(
    Deno.env.get("VERTEX_MODEL")?.trim() ||
      (typeof body.model === "string" ? body.model : undefined) ||
      getGeminiTextModel(),
  )

  const requestBody = buildInteractionRequestBody(body, model)
  const url = interactionsEndpoint(mode, projectId, stream)

  const doFetch = async () => {
    const headers = interactionsHeaders(mode, await getAccessToken())
    return fetch(url, {
      method: "POST",
      headers,
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
 * Extract assistant text from an Interactions response (or legacy
 * generateContent candidates for transitional callers).
 */
export function extractInteractionText(response: unknown): string {
  if (!response || typeof response !== "object") return ""

  const record = response as Record<string, unknown>

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

  const candidates = Array.isArray(record.candidates) ? record.candidates : []
  if (candidates.length > 0) {
    return candidates
      .map((c: unknown) =>
        collectText((c as { content?: unknown })?.content)
      )
      .join("")
      .trim()
  }

  return ""
}

/**
 * Parse one Interactions (or legacy generateContent) SSE JSON payload.
 */
export function parseInteractionStreamEvent(parsed: unknown): {
  text: string
  grounding: Record<string, unknown> | null
  done: boolean
} {
  if (!parsed || typeof parsed !== "object") {
    return { text: "", grounding: null, done: false }
  }
  const record = parsed as Record<string, unknown>
  const eventType = typeof record.event_type === "string"
    ? record.event_type
    : ""

  if (
    eventType === "interaction.completed" ||
    eventType === "interaction.complete"
  ) {
    const interaction = record.interaction
    let grounding: Record<string, unknown> | null = null
    if (interaction && typeof interaction === "object") {
      grounding = extractGroundingFromInteraction(
        interaction as Record<string, unknown>,
      )
    }
    return { text: "", grounding, done: true }
  }

  if (eventType === "step.delta" || eventType === "content.delta") {
    const delta = record.delta
    if (delta && typeof delta === "object") {
      const d = delta as Record<string, unknown>
      if (
        (d.type === "text" || typeof d.text === "string") &&
        typeof d.text === "string"
      ) {
        return { text: d.text, grounding: null, done: false }
      }
    }
    return { text: "", grounding: null, done: false }
  }

  const candidates = Array.isArray(record.candidates) ? record.candidates : []
  if (candidates.length > 0) {
    const first = candidates[0] as Record<string, unknown>
    const text = collectText(first?.content)
    const grounding =
      first?.groundingMetadata && typeof first.groundingMetadata === "object"
        ? first.groundingMetadata as Record<string, unknown>
        : null
    return { text, grounding, done: false }
  }

  return { text: "", grounding: null, done: false }
}

function extractGroundingFromInteraction(
  interaction: Record<string, unknown>,
): Record<string, unknown> | null {
  const steps = Array.isArray(interaction.steps) ? interaction.steps : []
  const annotations: unknown[] = []
  for (const step of steps) {
    if (!step || typeof step !== "object") continue
    const content = (step as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!block || typeof block !== "object") continue
      const anns = (block as Record<string, unknown>).annotations
      if (Array.isArray(anns)) annotations.push(...anns)
    }
  }
  if (!annotations.length) return null
  return { annotations, groundingChunks: annotations }
}

export {
  canUseGeminiInteractions,
  hasServiceAccountCredentials,
} from "./gemini-api.ts"
