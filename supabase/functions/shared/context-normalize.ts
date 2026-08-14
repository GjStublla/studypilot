/**
 * Pure context / turn normalization helpers (no Supabase or Gemini I/O).
 */

export const MAX_CANONICAL_MESSAGES = 20
export const MAX_SESSION_TRANSCRIPT = 20
export const RUBRIC_SUMMARY_CHAR_LIMIT = 2_000

export type ContextTurnRole = "user" | "model"

export type ContextTurn = {
  role: ContextTurnRole
  text: string
}

export type ContextRubricCriterion = {
  name: string
  score: number
  maxScore: number
}

export type ContextRubric = {
  id: string
  title: string
  course: string
  criteria: ContextRubricCriterion[]
  summary: string | null
  fileSearchStatus: string | null
  knowledgeDocumentId: string | null
} | null

/**
 * Map dashboard/session roles onto Gemini Live/generateContent roles.
 * `ai` and `assistant` become `model`.
 */
export function toModelRole(role: string): ContextTurnRole | "system" | null {
  const normalized = role.trim().toLowerCase()
  if (normalized === "user" || normalized === "student") return "user"
  if (
    normalized === "ai" || normalized === "assistant" ||
    normalized === "model" || normalized === "coach"
  ) {
    return "model"
  }
  if (normalized === "system") return "system"
  return null
}

/**
 * Convert message rows to Gemini turns: map roles, drop system, merge adjacent
 * same-role messages.
 */
export function normalizeTurns(
  messages: Array<{ role: string; text: string }>,
): ContextTurn[] {
  const mapped: ContextTurn[] = []
  for (const message of messages) {
    const role = toModelRole(message.role)
    if (role !== "user" && role !== "model") continue
    const text = message.text.trim()
    if (!text) continue
    const last = mapped[mapped.length - 1]
    if (last && last.role === role) {
      last.text = `${last.text}\n${text}`
    } else {
      mapped.push({ role, text })
    }
  }
  return mapped
}

export function formatRubricBlock(rubric: ContextRubric): string {
  if (!rubric) return ""
  const criteriaText = rubric.criteria.length > 0
    ? rubric.criteria
      .map((c) => `  - ${c.name}: ${c.score}/${c.maxScore}`)
      .join("\n")
    : "  (no criteria extracted yet)"
  let block =
    `RUBRIC: "${rubric.title}" (${rubric.course})\nCRITERIA:\n${criteriaText}`
  if (rubric.summary) {
    block += `\n\nRUBRIC SUMMARY:\n${rubric.summary}`
  }
  if (rubric.fileSearchStatus && rubric.fileSearchStatus !== "indexed") {
    block +=
      `\n\nNOTE: Rubric document indexing status is "${rubric.fileSearchStatus}". Do not claim to have searched the uploaded file via Vertex RAG.`
  }
  return block
}

export function boundRubricSummary(text: string | null | undefined): string | null {
  if (!text?.trim()) return null
  const trimmed = text.trim()
  if (trimmed.length <= RUBRIC_SUMMARY_CHAR_LIMIT) return trimmed
  return `${trimmed.slice(0, RUBRIC_SUMMARY_CHAR_LIMIT)}... [truncated]`
}

/** Convert ContextTurns to Gemini Live / generateContent contents. */
export function turnsToGeminiContents(
  turns: ContextTurn[],
): Array<{ role: string; parts: Array<{ text: string }> }> {
  return turns.map((t) => ({
    role: t.role,
    parts: [{ text: t.text }],
  }))
}
