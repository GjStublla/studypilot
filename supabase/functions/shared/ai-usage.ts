import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

export interface AiUsageResult {
  allowed: boolean
  used: number
  limit: number
}

const FAIL_OPEN_RESULT: AiUsageResult = {
  allowed: true,
  used: 0,
  limit: 50,
}

function isAiUsageResult(value: unknown): value is AiUsageResult {
  if (!value || typeof value !== 'object') return false

  const result = value as Record<string, unknown>
  return typeof result.allowed === 'boolean'
    && typeof result.used === 'number'
    && typeof result.limit === 'number'
}

/**
 * Atomically reserve one request from a user's shared daily AI pool.
 * Fail open so a missing migration or transient database failure cannot brick
 * the AI features during deployment.
 */
export async function consumeAiRequest(
  db: SupabaseClient,
  userId: string,
): Promise<AiUsageResult> {
  try {
    const { data, error } = await db.rpc('consume_ai_request', { p_user_id: userId })

    if (error || !isAiUsageResult(data)) {
      console.error('[ai-usage] Failed to consume AI request:', error ?? data)
      return FAIL_OPEN_RESULT
    }

    return data
  } catch (error) {
    console.error('[ai-usage] Failed to consume AI request:', error)
    return FAIL_OPEN_RESULT
  }
}

export function limitReachedMessage(result: AiUsageResult): string {
  return `Daily AI limit reached (${result.used} of ${result.limit} used). Your limit resets at midnight UTC.`
}
