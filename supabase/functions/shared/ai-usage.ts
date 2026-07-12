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
