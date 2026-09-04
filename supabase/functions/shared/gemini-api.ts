/**
 * Gemini auth + model helpers — Vertex-only production path.
 *
 * Text / RAG / Live use service-account OAuth against Vertex AI.
 * GEMINI_API_KEY is intentionally unused by production Edge paths.
 */

/** Vertex Live WebSocket API revision. */
export const LIVE_API_VERSION = "v1beta1"

export const DEFAULT_EMBEDDING_MODEL = "models/gemini-embedding-2"
/** Stable Vertex model fallback for text/RAG when secrets are not configured. */
export const DEFAULT_TEXT_MODEL = "gemini-2.5-flash"
export const DEFAULT_RAG_MODEL = "gemini-2.5-flash"
export const DEFAULT_LIVE_MODEL = "gemini-3.1-flash-live-preview"

/**
 * Strip `models/` and remap retired Gemini 1.5 / 2.0 ids only.
 * Pass through configured model IDs while remapping known retired text models
 * to the stable text fallback.
 */
export function normalizeGeminiModelId(model: string): string {
  const trimmed = model.trim()
  if (!trimmed) return DEFAULT_TEXT_MODEL
  const lower = trimmed.toLowerCase().replace(/^models\//, "")
  if (
    lower === "gemini-3.5-flash" || // retired configuration alias
    lower === "gemini-3.6-flash" ||
    lower === "gemini-2.0-flash" ||
    lower === "gemini-1.5-flash" ||
    lower === "gemini-1.5-pro" ||
    lower === "gemini-1.5-flash-latest" ||
    lower === "gemini-1.5-pro-latest"
  ) {
    return DEFAULT_TEXT_MODEL
  }
  return trimmed.replace(/^models\//i, "")
}

/** True when split GOOGLE_* secrets or full SA JSON is configured. */
export function hasServiceAccountCredentials(): boolean {
  const email = Deno.env.get("GOOGLE_CLIENT_EMAIL")?.trim()
  const key = Deno.env.get("GOOGLE_PRIVATE_KEY")?.trim()
  if (email && key) return true
  const json = Deno.env.get("GEMINI_SERVICE_ACCOUNT_CREDENTIALS")?.trim()
  return Boolean(json)
}

export function getGeminiTextModel(): string {
  return normalizeGeminiModelId(
    Deno.env.get("GEMINI_TEXT_MODEL")?.trim() || DEFAULT_TEXT_MODEL,
  )
}

export function getGeminiRagModel(): string {
  return normalizeGeminiModelId(
    Deno.env.get("GEMINI_RAG_MODEL")?.trim() ||
      Deno.env.get("GEMINI_TEXT_MODEL")?.trim() ||
      DEFAULT_RAG_MODEL,
  )
}

export function getGeminiLiveModel(): string {
  return normalizeGeminiModelId(
    Deno.env.get("GEMINI_LIVE_MODEL")?.trim() || DEFAULT_LIVE_MODEL,
  )
}

export function getGeminiEmbeddingModel(): string {
  return Deno.env.get("GEMINI_EMBEDDING_MODEL")?.trim() || DEFAULT_EMBEDDING_MODEL
}

/** Vertex generateContent / Live location (default global). */
export function getVertexLocation(): string {
  const raw =
    Deno.env.get("VERTEX_LOCATION")?.trim() ||
    Deno.env.get("GEMINI_LOCATION")?.trim() ||
    "global"
  return normalizeVertexLocation(raw)
}

/**
 * Normalize general Vertex model serving locations. Regional RAG Engine
 * locations remain controlled separately by VERTEX_RAG_LOCATION.
 */
export function normalizeVertexLocation(location: string): string {
  const lower = location.trim().toLowerCase()
  if (!lower) return "global"
  if (lower === "global" || lower === "us" || lower === "eu") return lower
  // Regional Vertex codes use the regional host/path directly.
  if (/^[a-z]+-[a-z]+[0-9]+$/.test(lower)) return lower
  return "global"
}

/**
 * Vertex RAG Engine location. RAG corpora are regional (not global).
 * Default us-west1 for regional RAG resources. Override with VERTEX_RAG_LOCATION.
 */
export function getVertexRagLocation(): string {
  return (
    Deno.env.get("VERTEX_RAG_LOCATION")?.trim() ||
    Deno.env.get("RAG_LOCATION")?.trim() ||
    "us-west1"
  )
}

export function requireVertexProjectId(): string {
  const { getGoogleProjectId } = requireProjectIdLazy()
  const projectId = getGoogleProjectId()
  if (!projectId) {
    throw new Error(
      "GOOGLE_PROJECT_ID (or credentials project_id) is required for Vertex AI",
    )
  }
  return projectId
}

function requireProjectIdLazy(): {
  getGoogleProjectId: () => string | undefined
} {
  // Avoid circular import at module load — oauth-helper imports nothing from here.
  // deno-lint-ignore no-explicit-any
  const mod = (globalThis as any).__studypilot_oauth_helper
  if (mod?.getGoogleProjectId) return mod
  // Synchronous dynamic would fail; call sites import getGoogleProjectId directly.
  // This helper is only used from requireVertexProjectId which we inline below.
  return {
    getGoogleProjectId: () => {
      const explicit = Deno.env.get("GOOGLE_PROJECT_ID") ||
        Deno.env.get("GOOGLE_CLOUD_PROJECT") ||
        Deno.env.get("GCP_PROJECT_ID") ||
        Deno.env.get("GEMINI_PROJECT_ID")
      if (explicit?.trim()) return explicit.trim()
      const credentialsJson = Deno.env.get("GEMINI_SERVICE_ACCOUNT_CREDENTIALS")
        ?.trim()
      if (!credentialsJson) return undefined
      try {
        return (JSON.parse(credentialsJson) as { project_id?: string })
          .project_id
      } catch {
        return undefined
      }
    },
  }
}

/** Vertex service-account auth only — no Generative Language / API-key fallback. */
export function requireVertexAiConfig(projectId: string | undefined): void {
  if (!hasServiceAccountCredentials()) {
    throw new Error(
      "No Vertex auth configured. Set GOOGLE_PROJECT_ID + service-account credentials " +
        "(GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY or GEMINI_SERVICE_ACCOUNT_CREDENTIALS).",
    )
  }
  if (!projectId) {
    throw new Error(
      "GOOGLE_PROJECT_ID is required for Vertex AI (no Gemini API key fallback).",
    )
  }
}

/** Text/RAG/Live require Vertex service-account credentials + project. */
export function canUseVertexAi(): boolean {
  if (!hasServiceAccountCredentials()) return false
  try {
    requireVertexProjectId()
    return true
  } catch {
    return false
  }
}

export function canUseVertexLive(): boolean {
  return canUseVertexAi()
}

export function describeGeminiApiError(errText: string): string {
  try {
    const parsed = JSON.parse(errText) as {
      error?: { status?: string; message?: string; details?: Array<{ reason?: string }> }
    }
    const status = parsed.error?.status ?? ""
    const reason =
      parsed.error?.details?.find((d) => typeof d?.reason === "string")?.reason ??
      ""
    const message = parsed.error?.message ?? ""
    return [status, reason, message].filter(Boolean).join(" — ").slice(0, 500)
  } catch {
    return errText.slice(0, 300)
  }
}
