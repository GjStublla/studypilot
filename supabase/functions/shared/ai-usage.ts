export interface AiUsageResult {
  allowed: boolean
  used: number
  limit: number
}

export type ConsumeAiRequestResult =
  | { status: "available"; usage: AiUsageResult }
  | { status: "unavailable" }

export interface AiUsageDbClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>
}

export const QUOTA_UNAVAILABLE_MESSAGE =
  "AI usage tracking is temporarily unavailable. Please try again in a moment."

interface AiUsageEnvironment {
  disabled?: string
  supabaseUrl?: string
}

const LOCAL_SUPABASE_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
  "kong",
  "host.docker.internal",
])

export function shouldBypassAiUsageLimits(environment: AiUsageEnvironment): boolean {
  if (environment.disabled !== "true" || !environment.supabaseUrl) return false

  try {
    const url = new URL(environment.supabaseUrl)
    return url.protocol === "http:" && LOCAL_SUPABASE_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

function localAiUsageLimitsDisabled(): boolean {
  try {
    return shouldBypassAiUsageLimits({
      disabled: Deno.env.get("AI_USAGE_LIMITS_DISABLED"),
      supabaseUrl: Deno.env.get("SUPABASE_URL"),
    })
  } catch {
    return false
  }
}

function isAiUsageResult(value: unknown): value is AiUsageResult {
  if (!value || typeof value !== "object") return false

  const result = value as Record<string, unknown>
  return typeof result.allowed === "boolean"
    && typeof result.used === "number"
    && typeof result.limit === "number"
}

/**
 * Atomically reserve one request from a user's shared daily AI pool.
 * Fail closed so a missing migration or transient database failure cannot
 * silently bypass the quota.
 */
export async function consumeAiRequest(
  db: AiUsageDbClient,
  userId: string,
): Promise<ConsumeAiRequestResult> {
  if (localAiUsageLimitsDisabled()) {
    return {
      status: "available",
      usage: { allowed: true, used: 0, limit: 50 },
    }
  }

  try {
    const { data, error } = await db.rpc("consume_ai_request", { p_user_id: userId })

    if (error || !isAiUsageResult(data)) {
      console.error("[ai-usage] Failed to consume AI request:", error ?? data)
      return { status: "unavailable" }
    }

    return { status: "available", usage: data }
  } catch (error) {
    console.error("[ai-usage] Failed to consume AI request:", error)
    return { status: "unavailable" }
  }
}

export function limitReachedMessage(result: AiUsageResult): string {
  return `Daily AI limit reached (${result.used} of ${result.limit} used). Your limit resets at midnight UTC.`
}
