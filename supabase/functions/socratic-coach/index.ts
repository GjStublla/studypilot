/**
 * Streams Socratic coaching responses while persisting one canonical,
 * idempotent chat turn shared by the dashboard and browser extension.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  QUOTA_UNAVAILABLE_MESSAGE,
  shouldBypassAiUsageLimits,
} from "../shared/ai-usage.ts";
import {
  createGeminiInteraction,
  describeGeminiError,
  getGeminiTextModel,
  parseInteractionStreamEvent,
} from "../shared/gemini.ts";
import {
  canUseGeminiInteractions,
  getGeminiRagModel,
} from "../shared/gemini-api.ts";
import {
  buildContextSnapshot,
  turnsToGeminiContents,
} from "../shared/context.ts";
import { normalizeCitations } from "../shared/file-search-normalize.ts";
import { retrieveRagContexts } from "../shared/vertex-rag.ts";
import { buildCorsHeaders, handleOptions } from "../shared/cors.ts";

const MAX_IMAGES = 2;
const MAX_IMAGE_BASE64_CHARS = 1_500_000;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ORIGIN_SURFACES = new Set(["dashboard", "extension", "legacy"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SYSTEM_PROMPT =
  `You are StudyPilot, a Socratic academic coach. Your role is to help students improve their own work — never to do it for them.

WHAT YOU MAY DO:
- Explain rubric criteria in plain language
- Ask Socratic questions that guide the student toward their own insights
- Identify where their work is strong and where it falls short of the rubric
- Suggest specific revision strategies and structural approaches
- Reference the transcript and summary from the coaching session when available
- Help turn feedback into concrete, actionable next steps
- Use retrieved context from the student's uploaded rubric documents when available

WHAT YOU MUST NOT DO:
- Write paragraphs, essays, or complete sentences meant for submission
- Complete assignments or generate final answers
- Invent rubric criteria that don't exist in the provided context
- Claim to have read a document unless it appears in the provided context
- Ignore academic integrity

When you refuse to write something for the student, offer a guiding question or a structural suggestion instead.
Keep responses concise. Prefer questions over lectures. When the student is on the right track, say so briefly and push them one step further.`;

type OriginSurface = "dashboard" | "extension" | "legacy";

type RequestImage = {
  mimeType: string;
  data: string;
};

type ClientContext = {
  page?: { title?: string; url?: string; text?: string };
  action?: string;
  selection?: string;
  integrity?: string;
  screenshotShared?: boolean;
};

type ChatRow = {
  id: string;
  session_id: string | null;
  title: string;
  rubric_id?: string | null;
};

type TurnIdentity = {
  userMessageId: string;
  assistantMessageId: string;
};

type TurnRpcResult = Partial<TurnIdentity> & {
  action:
    | "start"
    | "replay"
    | "completed"
    | "in_progress"
    | "error"
    | "conflict"
    | "fenced";
  leaseToken?: string;
  userSequence?: number;
  assistantSequence?: number;
  assistantText?: string;
  errorStatus?: number;
  errorMessage?: string;
  retryAfterSeconds?: number;
};

type CommittedTurn = TurnRpcResult & TurnIdentity & {
  userSequence: number;
  assistantSequence: number;
  assistantText: string;
};

type MessageCommit = {
  type: "commit";
  chatId: string;
  requestId: string;
  userMessageId: string;
  assistantMessageId: string;
  userSequence: number;
  assistantSequence: number;
};

function sseData(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

function sseChunk(text: string): string {
  return sseData({ text });
}

function sseDone(): string {
  return "data: [DONE]\n\n";
}

function sseError(message: string): string {
  return sseData({ error: message });
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function optionalLimitedString(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function normalizeClientContext(value: unknown): ClientContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const rawPage = record.page && typeof record.page === "object" &&
      !Array.isArray(record.page)
    ? record.page as Record<string, unknown>
    : undefined;
  const title = optionalLimitedString(rawPage?.title, 500);
  const url = optionalLimitedString(rawPage?.url, 2_000);
  const pageText = optionalLimitedString(rawPage?.text, 6_000);
  const action = optionalLimitedString(record.action, 500);
  const selection = optionalLimitedString(record.selection, 4_000);
  const integrity = optionalLimitedString(record.integrity, 1_000);
  const screenshotShared = typeof record.screenshotShared === "boolean"
    ? record.screenshotShared
    : undefined;

  if (
    !title && !url && !pageText && !action && !selection && !integrity &&
    screenshotShared === undefined
  ) {
    return undefined;
  }

  return {
    ...(title || url || pageText
      ? {
        page: {
          ...(title ? { title } : {}),
          ...(url ? { url } : {}),
          ...(pageText ? { text: pageText } : {}),
        },
      }
      : {}),
    ...(action ? { action } : {}),
    ...(selection ? { selection } : {}),
    ...(integrity ? { integrity } : {}),
    ...(screenshotShared !== undefined ? { screenshotShared } : {}),
  };
}

function formatClientContext(context: ClientContext | undefined): string {
  if (!context) return "";
  const lines: string[] = [];
  if (context.page?.title) lines.push(`Page title: ${context.page.title}`);
  if (context.page?.url) lines.push(`Page URL: ${context.page.url}`);
  if (context.action) lines.push(`Current action: ${context.action}`);
  if (context.selection) lines.push(`Selected text: ${context.selection}`);
  if (context.integrity) lines.push(`Integrity guidance: ${context.integrity}`);
  if (context.screenshotShared !== undefined) {
    lines.push(`Screenshot shared: ${context.screenshotShared ? "yes" : "no"}`);
  }
  const header = lines.length > 0
    ? `CURRENT CLIENT CONTEXT:\n${lines.join("\n")}`
    : "";
  if (context.page?.text) {
    const textBlock = `PAGE CONTENT:\n${context.page.text}`;
    return header ? `${header}\n\n${textBlock}` : textBlock;
  }
  return header;
}

function normalizeImages(
  value: unknown,
): { images: RequestImage[]; error?: string } {
  if (value === undefined || value === null) return { images: [] };
  if (!Array.isArray(value)) {
    return { images: [], error: "images must be an array." };
  }
  if (value.length > MAX_IMAGES) {
    return {
      images: [],
      error: `images can include at most ${MAX_IMAGES} items.`,
    };
  }

  const images: RequestImage[] = [];
  for (const image of value) {
    if (!image || typeof image !== "object" || Array.isArray(image)) {
      return {
        images: [],
        error: "Each image must include mimeType and data.",
      };
    }

    const record = image as Record<string, unknown>;
    const mimeType = typeof record.mimeType === "string"
      ? record.mimeType.trim().toLowerCase()
      : "";
    const data = typeof record.data === "string" ? record.data.trim() : "";
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      return { images: [], error: "images must be JPEG, PNG, or WebP." };
    }
    if (!data || data.length > MAX_IMAGE_BASE64_CHARS) {
      return {
        images: [],
        error: "Each image must be a non-empty base64 payload under 1.5 MB.",
      };
    }
    images.push({ mimeType, data });
  }
  return { images };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function requestHash(input: {
  chatId: string;
  userMessage: string;
  originSurface: OriginSurface;
  clientContext?: ClientContext;
  images: RequestImage[];
}): Promise<string> {
  const imageDigests = await Promise.all(input.images.map(async (image) => ({
    mimeType: image.mimeType,
    digest: await sha256(image.data),
  })));
  return sha256(JSON.stringify({
    chatId: input.chatId,
    userMessage: input.userMessage,
    originSurface: input.originSurface,
    clientContext: input.clientContext ?? null,
    images: imageDigests,
  }));
}

function asChatRow(value: unknown): ChatRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.title !== "string") return null;
  if (row.session_id !== null && typeof row.session_id !== "string") {
    return null;
  }
  return {
    id: row.id,
    session_id: row.session_id as string | null,
    title: row.title,
    rubric_id: typeof row.rubric_id === "string" ? row.rubric_id : null,
  };
}

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
}

function asTurnRpcResult(value: unknown): TurnRpcResult | null {
  const row = firstRow<Record<string, unknown>>(value);
  if (!row || typeof row.action !== "string") return null;
  const actions = new Set([
    "start",
    "replay",
    "completed",
    "in_progress",
    "error",
    "conflict",
    "fenced",
  ]);
  if (!actions.has(row.action)) return null;
  return row as TurnRpcResult;
}

function isCommittedTurn(value: TurnRpcResult | null): value is CommittedTurn {
  return Boolean(
    value && (value.action === "replay" || value.action === "completed") &&
      value.userMessageId && value.assistantMessageId &&
      typeof value.userSequence === "number" &&
      typeof value.assistantSequence === "number" &&
      typeof value.assistantText === "string",
  );
}

function commitEvent(
  chatId: string,
  requestId: string,
  turn: TurnIdentity,
  userSequence: number,
  assistantSequence: number,
): MessageCommit {
  return {
    type: "commit",
    chatId,
    requestId,
    userMessageId: turn.userMessageId,
    assistantMessageId: turn.assistantMessageId,
    userSequence,
    assistantSequence,
  };
}

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const streamHeaders = {
    ...cors,
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  };

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return handleOptions(cors);
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const userDb = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const accessToken = authHeader.slice("Bearer ".length).trim();
  if (!accessToken) return jsonResponse({ error: "Unauthorized" }, 401);
  const { data: { user }, error: authError } = await userDb.auth.getUser(
    accessToken,
  );
  if (authError || !user) {
    console.error(
      "[socratic-coach] Caller authentication failed:",
      authError?.message ?? "user missing",
    );
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid body");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const userMessage = typeof body.userMessage === "string"
    ? body.userMessage.trim()
    : "";
  if (!userMessage) {
    return jsonResponse({
      error: "userMessage is required and must be a non-empty string",
    }, 400);
  }

  const requestedChatId = optionalLimitedString(body.chatId, 64);
  if (
    body.chatId !== undefined && (!requestedChatId || !isUuid(requestedChatId))
  ) {
    return jsonResponse({ error: "chatId must be a UUID when provided" }, 400);
  }
  const requestedSessionId = optionalLimitedString(body.sessionId, 64);
  if (
    body.sessionId !== undefined &&
    (!requestedSessionId || !isUuid(requestedSessionId))
  ) {
    return jsonResponse(
      { error: "sessionId must be a UUID when provided" },
      400,
    );
  }
  const suppliedRequestId = optionalLimitedString(body.requestId, 64);
  if (
    body.requestId !== undefined &&
    (!suppliedRequestId || !isUuid(suppliedRequestId))
  ) {
    return jsonResponse(
      { error: "requestId must be a UUID when provided" },
      400,
    );
  }

  const rawOrigin = body.originSurface === undefined
    ? "legacy"
    : body.originSurface;
  if (typeof rawOrigin !== "string" || !ORIGIN_SURFACES.has(rawOrigin)) {
    return jsonResponse({
      error: "originSurface must be dashboard, extension, or legacy",
    }, 400);
  }
  const originSurface = rawOrigin as OriginSurface;
  const clientContext = normalizeClientContext(body.clientContext);
  const imageResult = normalizeImages(body.images);
  if (imageResult.error) return jsonResponse({ error: imageResult.error }, 400);
  const requestId = suppliedRequestId ?? crypto.randomUUID();

  let chat: ChatRow | null = null;
  if (requestedChatId) {
    const { data, error } = await db
      .from("dashboard_chats")
      .select("id, session_id, title, rubric_id")
      .eq("id", requestedChatId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[socratic-coach] Failed to load chat:", error);
      return jsonResponse({ error: "Unable to load chat" }, 500);
    }
    chat = asChatRow(data);
    if (!chat) return jsonResponse({ error: "Chat not found" }, 404);
  } else {
    const title = clientContext?.page?.title ??
      (requestedSessionId ? "Session chat" : "StudyPilot chat");
    const { data, error } = await userDb.rpc("get_or_create_session_chat", {
      p_session_id: requestedSessionId ?? null,
      p_title: title,
      p_origin_surface: originSurface,
    });
    if (error) {
      console.error(
        "[socratic-coach] Failed to resolve canonical chat:",
        error,
      );
      const status = error.code === "P0002" ? 404 : 500;
      return jsonResponse({
        error: status === 404 ? "Session not found" : "Unable to create chat",
      }, status);
    }
    chat = asChatRow(data);
    if (!chat) return jsonResponse({ error: "Unable to create chat" }, 500);
  }

  const chatId = chat.id;
  const hash = await requestHash({
    chatId,
    userMessage,
    originSurface,
    clientContext,
    images: imageResult.images,
  });

  const skipQuota = shouldBypassAiUsageLimits({
    disabled: Deno.env.get("AI_USAGE_LIMITS_DISABLED"),
    supabaseUrl,
  });
  const { data: startData, error: startError } = await db.rpc(
    "start_ai_chat_turn",
    {
      p_user_id: user.id,
      p_request_id: requestId,
      p_chat_id: chatId,
      p_request_hash: hash,
      p_origin_surface: originSurface,
      p_user_message: userMessage,
      p_skip_quota: skipQuota,
    },
  );
  const startedTurn = asTurnRpcResult(startData);
  if (startError || !startedTurn) {
    console.error(
      "[socratic-coach] Failed to atomically start request:",
      startError ?? startData,
    );
    return jsonResponse({ error: QUOTA_UNAVAILABLE_MESSAGE }, 503);
  }

  if (startedTurn.action === "conflict") {
    return jsonResponse({
      error: startedTurn.errorMessage ??
        "requestId was already used for a different request",
    }, 409);
  }
  if (startedTurn.action === "in_progress") {
    return jsonResponse(
      {
        error: "This AI request is already in progress",
        retryAfterSeconds: startedTurn.retryAfterSeconds,
      },
      409,
    );
  }
  if (startedTurn.action === "error") {
    const status = typeof startedTurn.errorStatus === "number"
      ? startedTurn.errorStatus
      : 503;
    return jsonResponse({
      error: startedTurn.errorMessage ?? "Unable to start AI request",
    }, status);
  }
  if (startedTurn.action === "replay") {
    if (!isCommittedTurn(startedTurn)) {
      console.error(
        "[socratic-coach] Replay payload is incomplete:",
        startedTurn,
      );
      return jsonResponse(
        { error: "Completed AI request is unavailable" },
        503,
      );
    }
    const commit = commitEvent(
      chatId,
      requestId,
      startedTurn,
      startedTurn.userSequence,
      startedTurn.assistantSequence,
    );
    return new Response(
      `${sseChunk(startedTurn.assistantText)}${sseData(commit)}${sseDone()}`,
      { status: 200, headers: streamHeaders },
    );
  }
  if (
    startedTurn.action !== "start" || !startedTurn.leaseToken ||
    !startedTurn.userMessageId || !startedTurn.assistantMessageId ||
    typeof startedTurn.userSequence !== "number"
  ) {
    console.error(
      "[socratic-coach] Start payload is incomplete:",
      startedTurn,
    );
    return jsonResponse({ error: "Unable to start AI request" }, 503);
  }

  const activeTurn = startedTurn as TurnRpcResult & TurnIdentity & {
    leaseToken: string;
    userSequence: number;
  };
  const finishTurn = async (
    outcome: "completed" | "failed",
    assistantText: string | null,
    errorStatus: number | null,
    errorMessage: string | null,
    grounding?: {
      usedFileSearch?: boolean;
      fileSearchStoreName?: string | null;
      groundingMetadata?: Record<string, unknown> | null;
    },
  ): Promise<TurnRpcResult | null> => {
    const { data, error } = await db.rpc("finish_ai_chat_turn", {
      p_user_id: user.id,
      p_request_id: requestId,
      p_lease_token: activeTurn.leaseToken,
      p_outcome: outcome,
      p_assistant_text: assistantText,
      p_error_status: errorStatus,
      p_error_message: errorMessage,
      p_used_file_search: grounding?.usedFileSearch ?? false,
      p_file_search_store_name: grounding?.fileSearchStoreName ?? null,
      p_grounding_metadata: grounding?.groundingMetadata ?? null,
    });
    const result = asTurnRpcResult(data);
    if (error || !result) {
      console.error(
        `[socratic-coach] Failed to atomically finish request as ${outcome}:`,
        error ?? data,
      );
      return null;
    }
    return result;
  };

  // Lock effective rubric onto the chat when not yet locked (best-effort).
  try {
    const { error: lockError } = await db.rpc("ensure_chat_rubric_locked", {
      p_chat_id: chatId,
      p_user_id: user.id,
    });
    if (lockError) {
      console.error("[socratic-coach] ensure_chat_rubric_locked failed:", lockError);
      await finishTurn("failed", null, 503, "Unable to lock chat rubric context");
      return jsonResponse({ error: "Unable to lock chat rubric context" }, 503);
    }
  } catch (error) {
    console.error("[socratic-coach] ensure_chat_rubric_locked:", error);
    await finishTurn("failed", null, 503, "Unable to lock chat rubric context");
    return jsonResponse({ error: "Unable to lock chat rubric context" }, 503);
  }

  const formattedClientContext = formatClientContext(clientContext);
  let contextSnapshot;
  try {
    contextSnapshot = await buildContextSnapshot(db, {
      chatId,
      userId: user.id,
      excludeMessageId: activeTurn.userMessageId,
      baseSystemPrompt: SYSTEM_PROMPT,
      extraContextBlocks: formattedClientContext
        ? [formattedClientContext]
        : [],
      maintainSummary: true,
    });
  } catch (error) {
    console.error("[socratic-coach] Failed to build context:", error);
    await finishTurn("failed", null, 503, "Unable to load chat context");
    return jsonResponse({ error: "Unable to load chat context" }, 503);
  }

  if (!canUseGeminiInteractions()) {
    await finishTurn(
      "failed",
      null,
      503,
      "Vertex AI credentials are not configured",
    );
    return jsonResponse({
      error:
        "AI service is not configured. Set GOOGLE_PROJECT_ID + Vertex service-account credentials.",
    }, 503);
  }

  const useRag = contextSnapshot.usedFileSearchEligible &&
    Boolean(contextSnapshot.fileSearchStoreName);

  let ragEvidence = "";
  let ragCitations: ReturnType<typeof normalizeCitations> = [];
  let ragGrounding: Record<string, unknown> | null = null;
  if (useRag && contextSnapshot.fileSearchStoreName) {
    try {
      const retrieved = await retrieveRagContexts({
        corpusName: contextSnapshot.fileSearchStoreName,
        query: userMessage,
        rubricId: contextSnapshot.rubric?.id ?? null,
      });
      ragEvidence = retrieved.text;
      ragCitations = retrieved.citations;
      ragGrounding = retrieved.groundingMetadata;
    } catch (error) {
      console.warn("[socratic-coach] Vertex RAG retrieve failed:", error);
    }
  }

  const historyContents = turnsToGeminiContents(contextSnapshot.turns);
  const userParts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [
    {
      text: ragEvidence
        ? `${userMessage}\n\n---\nRETRIEVED RUBRIC EVIDENCE (Vertex RAG):\n${ragEvidence}`
        : userMessage,
    },
    ...imageResult.images.map((image) => ({
      inlineData: { mimeType: image.mimeType, data: image.data },
    })),
  ];
  const contents = [
    ...historyContents,
    { role: "user", parts: userParts },
  ];

  const model = useRag ? getGeminiRagModel() : getGeminiTextModel();

  let geminiResponse: Response;
  try {
    geminiResponse = await createGeminiInteraction({
      model,
      system_instruction: contextSnapshot.systemInstruction,
      contents,
      stream: true,
      generation_config: { temperature: 0.7, maxOutputTokens: 1024 },
    });
  } catch (error) {
    console.error("[socratic-coach] Gemini fetch failed:", error);
    const message = "Failed to reach AI service. Please try again.";
    await finishTurn("failed", null, 503, message);
    return jsonResponse({ error: message }, 503);
  }

  if (!geminiResponse.ok || !geminiResponse.body) {
    const errorText = await geminiResponse.text();
    console.error(
      "[socratic-coach] Gemini API error:",
      geminiResponse.status,
      errorText,
    );
    const detail = describeGeminiError(errorText);
    const message =
      `AI service returned an error (Gemini ${geminiResponse.status}${
        detail ? ` ${detail}` : ""
      }). Please try again.`;
    await finishTurn("failed", null, 502, message);
    return jsonResponse({ error: message }, 502);
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const fileSearchStoreName = useRag
    ? contextSnapshot.fileSearchStoreName
    : null;
  const useFileSearch = useRag;
  (async () => {
    const reader = geminiResponse.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";
    let lastGrounding: Record<string, unknown> | null = ragGrounding;

    const consumeLine = async (line: string) => {
      const clean = line.trim();
      if (!clean.startsWith("data: ")) return;
      const raw = clean.slice(6).trim();
      if (!raw || raw === "[DONE]") return;
      try {
        const parsed = JSON.parse(raw);
        const { text, grounding } = parseInteractionStreamEvent(parsed);
        if (text) {
          fullResponse += text;
          await writer.write(encoder.encode(sseChunk(text)));
        }
        if (grounding) {
          lastGrounding = grounding;
        }
      } catch {
        // Ignore malformed upstream SSE records; complete records are newline-delimited.
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) await consumeLine(line);
      }
      buffer += decoder.decode();
      if (buffer.trim()) await consumeLine(buffer);

      const finalText = fullResponse.trim();
      if (!finalText) throw new Error("AI service returned an empty response");

      const streamCitations = normalizeCitations(lastGrounding);
      const citations = streamCitations.length > 0
        ? streamCitations
        : ragCitations;
      const usedFileSearch = useFileSearch &&
        (citations.length > 0 || Boolean(lastGrounding) || Boolean(ragEvidence));
      const groundingMetadata: Record<string, unknown> = lastGrounding
        ? {
          ...(lastGrounding as Record<string, unknown>),
          citations,
          usedFileSearch,
          ungrounded: !usedFileSearch,
        }
        : useFileSearch
        ? { usedFileSearch: false, ungrounded: true, citations }
        : {
          usedFileSearch: false,
          ungrounded: true,
          citations: [],
          fallback: "criteria_summary",
        };
      const completed = await finishTurn(
        "completed",
        finalText,
        null,
        null,
        {
          usedFileSearch,
          fileSearchStoreName,
          groundingMetadata,
        },
      );
      if (!isCommittedTurn(completed)) {
        throw new Error(
          completed?.errorMessage ?? "Unable to atomically commit AI response",
        );
      }

      const commit = commitEvent(
        chatId,
        requestId,
        completed,
        completed.userSequence,
        completed.assistantSequence,
      );
      await writer.write(encoder.encode(sseData(commit)));
      await writer.write(encoder.encode(sseDone()));
    } catch (error) {
      console.error("[socratic-coach] Stream or persistence error:", error);
      const settled = await finishTurn(
        "failed",
        null,
        502,
        error instanceof Error ? error.message : "Stream interrupted",
      );
      try {
        if (isCommittedTurn(settled)) {
          const commit = commitEvent(
            chatId,
            requestId,
            settled,
            settled.userSequence,
            settled.assistantSequence,
          );
          await writer.write(encoder.encode(sseData(commit)));
        } else {
          await writer.write(
            encoder.encode(
              sseError("Stream interrupted before the response was saved."),
            ),
          );
        }
        await writer.write(encoder.encode(sseDone()));
      } catch {
        // The client disconnected; persistence status was still recorded above.
      }
    } finally {
      await writer.close().catch(() => undefined);
    }
  })();

  return new Response(readable, { status: 200, headers: streamHeaders });
});
