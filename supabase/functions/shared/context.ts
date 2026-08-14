/**
 * Shared ContextSnapshot builder for socratic-coach and live-token.
 *
 * Assembles rolling chat summary, latest canonical messages, primary-session
 * transcript (deduped), and rubric criteria — then normalizes turns for Gemini.
 *
 * Summary watermark: summarizes the oldest unsummarized batch (queried
 * ascending from the watermark), never advances past never-summarized older
 * messages when only a newest-N window is loaded.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import {
  createGeminiInteraction,
  extractInteractionText,
} from "./gemini.ts"
import { getGeminiTextModel } from "./gemini-api.ts"
import {
  MAX_CANONICAL_MESSAGES,
  MAX_SESSION_TRANSCRIPT,
  boundRubricSummary,
  formatRubricBlock,
  normalizeTurns,
  toModelRole,
  turnsToGeminiContents,
  type ContextRubric,
  type ContextTurn,
} from "./context-normalize.ts"

export * from "./context-normalize.ts"

/** Max messages to fold into one rolling-summary advance. */
export const SUMMARY_BATCH_SIZE = 40

export type ContextSnapshot = {
  chatId: string
  systemInstruction: string
  turns: ContextTurn[]
  throughSequence: number
  rubric: ContextRubric
  primarySessionId: string | null
  contextSummary: string | null
  usedFileSearchEligible: boolean
  /** Vertex RAG corpus resource name (profiles.vertex_rag_corpus_name). */
  fileSearchStoreName: string | null
}

export type BuildContextOptions = {
  chatId: string
  userId: string
  /** Exclude this message id (current in-flight user turn). */
  excludeMessageId?: string | null
  /** Extra system prompt body (coach personality). */
  baseSystemPrompt: string
  /** Optional client/page context block appended to system instruction. */
  extraContextBlocks?: string[]
  studentName?: string | null
  /** When true, attempt CAS summary advance if >20 unsummarized messages. */
  maintainSummary?: boolean
}

type ChatRow = {
  id: string
  session_id: string | null
  rubric_id: string | null
  rubric_context_locked: boolean | null
  context_summary: string | null
  summary_through_sequence: number | null
  title: string
}

type MessageRow = {
  id: string
  role: string
  text: string
  server_sequence: number
}

type SessionMessageRow = {
  id: string
  role: string
  message_text: string
  time_offset_seconds: number
  server_sequence: number | null
}

async function loadRubric(
  db: SupabaseClient,
  userId: string,
  rubricId: string | null,
  options?: { allowActiveFallback?: boolean },
): Promise<ContextRubric> {
  if (!rubricId) {
    if (options?.allowActiveFallback === false) return null

    const { data: active } = await db
      .from("rubrics")
      .select(
        "id, title, course, extracted_text, file_search_status, knowledge_document_id, rubric_criteria(name, score, max_score)",
      )
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle()
    if (!active) return null
    return mapRubric(active)
  }

  const { data } = await db
    .from("rubrics")
    .select(
      "id, title, course, extracted_text, file_search_status, knowledge_document_id, rubric_criteria(name, score, max_score)",
    )
    .eq("id", rubricId)
    .eq("user_id", userId)
    .maybeSingle()
  if (!data) return null
  return mapRubric(data)
}

function mapRubric(row: Record<string, unknown>): ContextRubric {
  const criteriaRaw = (row.rubric_criteria as Array<Record<string, unknown>> | null) ??
    []
  return {
    id: String(row.id),
    title: String(row.title ?? "Rubric"),
    course: String(row.course ?? ""),
    criteria: criteriaRaw.map((c) => ({
      name: String(c.name ?? "Criterion"),
      score: Number(c.score) || 0,
      maxScore: Number(c.max_score) || 4,
    })),
    summary: boundRubricSummary(
      typeof row.extracted_text === "string" ? row.extracted_text : null,
    ),
    fileSearchStatus: typeof row.file_search_status === "string"
      ? row.file_search_status
      : null,
    knowledgeDocumentId: typeof row.knowledge_document_id === "string"
      ? row.knowledge_document_id
      : null,
  }
}

/**
 * When more than MAX_CANONICAL_MESSAGES exist beyond the summary watermark,
 * summarize the oldest unsummarized batch and CAS-advance summary_through_sequence.
 *
 * Important: does NOT rely on a newest-N window alone — older never-summarized
 * messages are loaded ascending from the watermark.
 */
export async function maybeAdvanceContextSummary(
  db: SupabaseClient,
  input: {
    userId: string
    chatId: string
    existingSummary: string | null
    summaryThroughSequence: number
    /** Optional hint from a newest window; not used to skip older messages. */
    messagesNewestFirst?: MessageRow[]
  },
): Promise<{ contextSummary: string | null; summaryThroughSequence: number }> {
  let countQuery = db
    .from("dashboard_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("chat_id", input.chatId)
    .gt("server_sequence", input.summaryThroughSequence)

  const { count, error: countError } = await countQuery
  if (countError) {
    console.warn("[context] unsummarized count failed:", countError.message)
    return {
      contextSummary: input.existingSummary,
      summaryThroughSequence: input.summaryThroughSequence,
    }
  }

  const unsummarizedCount = count ?? 0
  if (unsummarizedCount <= MAX_CANONICAL_MESSAGES) {
    return {
      contextSummary: input.existingSummary,
      summaryThroughSequence: input.summaryThroughSequence,
    }
  }

  const overflow = unsummarizedCount - MAX_CANONICAL_MESSAGES
  const batchSize = Math.min(SUMMARY_BATCH_SIZE, overflow)

  const { data: oldestBatch, error: batchError } = await db
    .from("dashboard_chat_messages")
    .select("id, role, text, server_sequence")
    .eq("user_id", input.userId)
    .eq("chat_id", input.chatId)
    .gt("server_sequence", input.summaryThroughSequence)
    .order("server_sequence", { ascending: true })
    .limit(batchSize)

  if (batchError || !oldestBatch?.length) {
    if (batchError) {
      console.warn("[context] oldest unsummarized load failed:", batchError.message)
    }
    return {
      contextSummary: input.existingSummary,
      summaryThroughSequence: input.summaryThroughSequence,
    }
  }

  const toSummarize = oldestBatch as MessageRow[]
  const throughSequence = Math.max(
    ...toSummarize.map((m) => m.server_sequence),
  )
  const transcript = toSummarize
    .map((m) => {
      const role = toModelRole(m.role)
      const label = role === "user"
        ? "Student"
        : role === "model"
        ? "Coach"
        : m.role
      return `${label}: ${m.text}`
    })
    .join("\n")

  const prompt =
    `Summarize this tutoring chat segment into a concise rolling memory (max 400 words). Preserve rubric criteria mentioned, student goals, open questions, and coaching commitments. Do not invent details.\n\nPrior summary:\n${
      input.existingSummary || "(none)"
    }\n\nNew messages:\n${transcript}`

  let newSummary = input.existingSummary
  try {
    const res = await createGeminiInteraction({
      model: getGeminiTextModel(),
      input: prompt,
      generation_config: { temperature: 0.2, maxOutputTokens: 800 },
    })
    if (res.ok) {
      const data = await res.json()
      const text = extractInteractionText(data).trim()
      if (text) newSummary = text
    } else {
      console.warn(
        "[context] summary generation failed:",
        res.status,
        await res.text(),
      )
      // Do not advance watermark if summarization failed.
      return {
        contextSummary: input.existingSummary,
        summaryThroughSequence: input.summaryThroughSequence,
      }
    }
  } catch (error) {
    console.warn("[context] summary generation error:", error)
    return {
      contextSummary: input.existingSummary,
      summaryThroughSequence: input.summaryThroughSequence,
    }
  }

  const { data: updated, error } = await db
    .from("dashboard_chats")
    .update({
      context_summary: newSummary,
      summary_through_sequence: throughSequence,
    })
    .eq("id", input.chatId)
    .eq("user_id", input.userId)
    .or(
      `summary_through_sequence.is.null,summary_through_sequence.eq.${input.summaryThroughSequence}`,
    )
    .select("context_summary, summary_through_sequence")
    .maybeSingle()

  if (error) {
    console.warn("[context] CAS summary update failed:", error.message)
    return {
      contextSummary: input.existingSummary,
      summaryThroughSequence: input.summaryThroughSequence,
    }
  }

  if (!updated) {
    const { data: fresh } = await db
      .from("dashboard_chats")
      .select("context_summary, summary_through_sequence")
      .eq("id", input.chatId)
      .maybeSingle()
    return {
      contextSummary: fresh?.context_summary ?? input.existingSummary,
      summaryThroughSequence: Number(fresh?.summary_through_sequence) ||
        input.summaryThroughSequence,
    }
  }

  return {
    contextSummary: updated.context_summary ?? newSummary,
    summaryThroughSequence: Number(updated.summary_through_sequence) ||
      throughSequence,
  }
}

export async function buildContextSnapshot(
  db: SupabaseClient,
  options: BuildContextOptions,
): Promise<ContextSnapshot> {
  const { data: chat, error: chatError } = await db
    .from("dashboard_chats")
    .select(
      "id, session_id, rubric_id, rubric_context_locked, context_summary, summary_through_sequence, title",
    )
    .eq("id", options.chatId)
    .eq("user_id", options.userId)
    .maybeSingle()

  if (chatError || !chat) {
    throw new Error("Chat not found")
  }

  const chatRow = chat as ChatRow

  let primarySessionId: string | null = chatRow.session_id
  const { data: linkedSessions } = await db
    .from("sessions")
    .select("id, title, mode, summary, rubric_id, when_timestamp")
    .eq("user_id", options.userId)
    .eq("chat_id", options.chatId)
    .order("when_timestamp", { ascending: false })
    .limit(1)

  if (linkedSessions?.[0]?.id) {
    primarySessionId = linkedSessions[0].id
  }

  const { data: profile } = await db
    .from("profiles")
    .select("name, vertex_rag_corpus_name")
    .eq("id", options.userId)
    .maybeSingle()

  const rubricContextLocked = chatRow.rubric_context_locked === true
  const lockedNull = rubricContextLocked && !chatRow.rubric_id

  let rubricId = chatRow.rubric_id
  if (!lockedNull && !rubricId && primarySessionId) {
    const session = linkedSessions?.[0]
    if (session?.rubric_id) rubricId = session.rubric_id
  }

  const rubric = await loadRubric(db, options.userId, rubricId, {
    allowActiveFallback: !rubricContextLocked,
  })

  let historyQuery = db
    .from("dashboard_chat_messages")
    .select("id, role, text, server_sequence")
    .eq("user_id", options.userId)
    .eq("chat_id", options.chatId)
    .order("server_sequence", { ascending: false })
    .limit(60)

  if (options.excludeMessageId) {
    historyQuery = historyQuery.neq("id", options.excludeMessageId)
  }

  const { data: recentHistory, error: historyError } = await historyQuery
  if (historyError) {
    throw new Error("Unable to load chat history")
  }

  const messagesNewestFirst = (recentHistory ?? []) as MessageRow[]
  let contextSummary = chatRow.context_summary
  let summaryThrough = Number(chatRow.summary_through_sequence) || 0

  if (options.maintainSummary !== false) {
    const advanced = await maybeAdvanceContextSummary(db, {
      userId: options.userId,
      chatId: options.chatId,
      existingSummary: contextSummary,
      summaryThroughSequence: summaryThrough,
      messagesNewestFirst,
    })
    contextSummary = advanced.contextSummary
    summaryThrough = advanced.summaryThroughSequence
  }

  const canonicalForTurns = messagesNewestFirst
    .filter((m) => m.server_sequence > summaryThrough)
    .slice(0, MAX_CANONICAL_MESSAGES)
    .slice()
    .reverse()

  const canonicalIds = new Set(canonicalForTurns.map((m) => m.id))
  if (options.excludeMessageId) canonicalIds.add(options.excludeMessageId)

  let sessionTranscript: SessionMessageRow[] = []
  let sessionBlock = ""
  if (primarySessionId) {
    const session = linkedSessions?.[0] ??
      (
        await db
          .from("sessions")
          .select("id, title, mode, summary, rubric_id")
          .eq("id", primarySessionId)
          .eq("user_id", options.userId)
          .maybeSingle()
      ).data

    if (session) {
      sessionBlock =
        `SESSION: "${session.title}" (${session.mode})\nSUMMARY: ${
          session.summary || "No summary yet."
        }`
      const { data: transcript } = await db
        .from("session_messages")
        .select("id, role, message_text, time_offset_seconds, server_sequence")
        .eq("session_id", primarySessionId)
        .order("time_offset_seconds", { ascending: false })
        .order("server_sequence", { ascending: false })
        .limit(MAX_SESSION_TRANSCRIPT)
      sessionTranscript = (transcript ?? []) as SessionMessageRow[]
    }
  }

  const transcriptMessages = [...sessionTranscript]
    .reverse()
    .filter((m) => !canonicalIds.has(m.id))
    .map((m) => ({ role: m.role, text: m.message_text }))

  const turns = normalizeTurns([
    ...transcriptMessages,
    ...canonicalForTurns.map((m) => ({ role: m.role, text: m.text })),
  ])

  const throughSequence = canonicalForTurns.length > 0
    ? Math.max(...canonicalForTurns.map((m) => m.server_sequence))
    : summaryThrough

  const contextParts: string[] = []
  const rubricBlock = formatRubricBlock(rubric)
  if (rubricBlock) contextParts.push(rubricBlock)
  if (contextSummary) {
    contextParts.push(`ROLLING CHAT SUMMARY:\n${contextSummary}`)
  }
  if (sessionBlock) contextParts.push(sessionBlock)
  for (const block of options.extraContextBlocks ?? []) {
    if (block.trim()) contextParts.push(block.trim())
  }
  const studentName = options.studentName ?? profile?.name
  if (studentName) contextParts.push(`STUDENT NAME: ${studentName}`)

  const systemInstruction = contextParts.length > 0
    ? `${options.baseSystemPrompt}\n\n---\nCONTEXT:\n${contextParts.join("\n\n")}\n---`
    : options.baseSystemPrompt

  const corpusName = typeof profile?.vertex_rag_corpus_name === "string"
    ? profile.vertex_rag_corpus_name
    : null
  const usedFileSearchEligible = rubric?.fileSearchStatus === "indexed" &&
    Boolean(corpusName)

  return {
    chatId: options.chatId,
    systemInstruction,
    turns,
    throughSequence,
    rubric,
    primarySessionId,
    contextSummary,
    usedFileSearchEligible,
    fileSearchStoreName: corpusName,
  }
}

export { turnsToGeminiContents }
