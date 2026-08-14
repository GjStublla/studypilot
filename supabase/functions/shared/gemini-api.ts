/**
 * Gemini auth + model helpers — Vertex-only production path.
 *
 * Text / Interactions / RAG / Live use service-account OAuth against Vertex AI.
 * GEMINI_API_KEY is optional and unused by production Edge paths (kept only for
 * local experiments; do not require it).
 */

export const GENERATIVE_LANGUAGE_BASE =
  "https://generativelanguage.googleapis.com/v1beta"

/** @deprecated Google AI Studio Live ephemeral tokens — not used on Vertex-only. */
export const LIVE_AUTH_TOKENS_PATH = "auth_tokens"

/** Vertex Live WebSocket API revision. */
export const LIVE_API_VERSION = "v1beta1"

/** Interactions REST revision header required by Google. */
export const INTERACTIONS_API_REVISION = "2026-05-20"

export const DEFAULT_EMBEDDING_MODEL = "models/gemini-embedding-2"
/** Spec: gemini-3.5-flash for text/RAG. Vertex serves this id (not a 3-flash remap). */
export const DEFAULT_TEXT_MODEL = "gemini-3.5-flash"
export const DEFAULT_RAG_MODEL = "gemini-3.5-flash"
export const DEFAULT_LIVE_MODEL = "gemini-3.1-flash-live-preview"

/**
 * Strip `models/` and remap retired Gemini 1.5 / 2.0 ids only.
 * Pass through gemini-3.5-flash and gemini-3.1-flash-live-preview when env
 * asks for them — do not rewrite 3.5 → gemini-3-flash-preview.
 */
export function normalizeGeminiModelId(model: string): string {
  const trimmed = model.trim()
  if (!trimmed) return DEFAULT_TEXT_MODEL
  const lower = trimmed.toLowerCase().replace(/^models\//, "")
  if (
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

export type GeminiAuthMode = "vertex-interactions"

/** Optional — unused by Vertex production paths. */
export function getGeminiApiKey(): string | undefined {
  const key = Deno.env.get("GEMINI_API_KEY")?.trim()
  return key || undefined
}

/** @deprecated Prefer hasServiceAccountCredentials / canUseGeminiInteractions. */
export function hasGeminiApiKey(): boolean {
  return Boolean(getGeminiApiKey())
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

/** Vertex Interactions / Live location (default global). */
export function getVertexLocation(): string {
  const raw =
    Deno.env.get("VERTEX_LOCATION")?.trim() ||
    Deno.env.get("GEMINI_LOCATION")?.trim() ||
    "global"
  return normalizeVertexInteractionsLocation(raw)
}

/**
 * Interactions API only accepts global | us | eu — not regional codes like
 * us-central1 (those remain valid for VERTEX_RAG_LOCATION / RAG Engine).
 * Prefer `global` for regional secrets so the Interactions host stays
 * aiplatform.googleapis.com (us-aiplatform.googleapis.com 404s).
 */
export function normalizeVertexInteractionsLocation(location: string): string {
  const lower = location.trim().toLowerCase()
  if (!lower) return "global"
  if (lower === "global" || lower === "us" || lower === "eu") return lower
  // Regional Vertex codes (us-central1, europe-west1, …) → global for Interactions.
  return "global"
}

/**
 * Vertex RAG Engine location. RAG corpora are regional (not global).
 * Default us-central1; override with VERTEX_RAG_LOCATION.
 */
export function getVertexRagLocation(): string {
  return (
    Deno.env.get("VERTEX_RAG_LOCATION")?.trim() ||
    Deno.env.get("RAG_LOCATION")?.trim() ||
    "us-central1"
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

/**
 * Vertex Interactions only — no Generative Language / API-key fallback.
 */
export function resolveInteractionsAuthMode(
  projectId: string | undefined,
): GeminiAuthMode {
  if (!hasServiceAccountCredentials()) {
    throw new Error(
      "No Vertex auth configured. Set GOOGLE_PROJECT_ID + service-account credentials " +
        "(GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY or GEMINI_SERVICE_ACCOUNT_CREDENTIALS).",
    )
  }
  if (!projectId) {
    throw new Error(
      "GOOGLE_PROJECT_ID is required for Vertex Interactions (no Gemini API key fallback).",
    )
  }
  return "vertex-interactions"
}

/** Text/Interactions/RAG/Live require Vertex SA + project. */
export function canUseGeminiInteractions(): boolean {
  if (!hasServiceAccountCredentials()) return false
  try {
    requireVertexProjectId()
    return true
  } catch {
    return false
  }
}

export function canUseVertexLive(): boolean {
  return canUseGeminiInteractions()
}

export function interactionsHeaders(
  mode: GeminiAuthMode,
  accessToken?: string,
  _apiKey?: string,
  _projectId?: string,
): Record<string, string> {
  if (mode !== "vertex-interactions") {
    throw new Error(`Unsupported Interactions auth mode: ${mode}`)
  }
  if (!accessToken) throw new Error("OAuth access token missing for Vertex Interactions")
  return {
    "Content-Type": "application/json",
    "Api-Revision": INTERACTIONS_API_REVISION,
    Authorization: `Bearer ${accessToken}`,
  }
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
