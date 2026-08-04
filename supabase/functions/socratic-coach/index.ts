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
} from "../shared/gemini.ts";

const MAX_HISTORY_TURNS = 20;
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const streamHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
};

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
  page?: { title?: string; url?: string };
  action?: string;
  selection?: string;
  integrity?: string;
  screenshotShared?: boolean;
};

type ChatRow = {
  id: string;
  session_id: string | null;
  title: string;
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
  const action = optionalLimitedString(record.action, 500);
  const selection = optionalLimitedString(record.selection, 4_000);
  const integrity = optionalLimitedString(record.integrity, 1_000);
  const screenshotShared = typeof record.screenshotShared === "boolean"
    ? record.screenshotShared
    : undefined;

  if (
    !title && !url && !action && !selection && !integrity &&
    screenshotShared === undefined
  ) {
    return undefined;
  }

  return {
    ...(title || url
      ? { page: { ...(title ? { title } : {}), ...(url ? { url } : {}) } }
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
  return lines.length > 0 ? `CURRENT CLIENT CONTEXT:\n${lines.join("\n")}` : "";
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
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
      .select("id, session_id, title")
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
  const sessionId = chat.session_id ?? undefined;
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
  ): Promise<TurnRpcResult | null> => {
    const { data, error } = await db.rpc("finish_ai_chat_turn", {
      p_user_id: user.id,
      p_request_id: requestId,
      p_lease_token: activeTurn.leaseToken,
      p_outcome: outcome,
      p_assistant_text: assistantText,
      p_error_status: errorStatus,
      p_error_message: errorMessage,
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

  const { data: profile } = await db
    .from("profiles")
    .select("name, default_coach_mode, gemini_file_search_store_name")
    .eq("id", user.id)
    .maybeSingle();

  let sessionContext = "";
  let sessionTranscript: Array<{
    id: string;
    role: string;
    message_text: string;
    time_offset_seconds: number;
    server_sequence: number | null;
  }> = [];
  let rubricContext = "";
  if (sessionId) {
    const { data: session } = await db
      .from("sessions")
      .select("title, mode, summary, rubric_id, when_timestamp")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (session) {
      sessionContext =
        `SESSION: "${session.title}" (${session.mode})\nSUMMARY: ${
          session.summary || "No summary yet."
        }`;
      const { data: transcript } = await db
        .from("session_messages")
        .select("id, role, message_text, time_offset_seconds, server_sequence")
        .eq("session_id", sessionId)
        .order("time_offset_seconds", { ascending: false })
        .order("server_sequence", { ascending: false })
        .limit(20);
      sessionTranscript = transcript ?? [];

      if (session.rubric_id) {
        const { data: rubric } = await db
          .from("rubrics")
          .select(
            "title, course, extracted_text, rubric_criteria(name, score, max_score)",
          )
          .eq("id", session.rubric_id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (rubric) {
          const criteriaText = ((rubric.rubric_criteria as
            | Array<Record<string, unknown>>
            | null) ?? [])
            .map((criterion) =>
              `  - ${criterion.name}: ${criterion.score ?? 0}/${
                criterion.max_score ?? 4
              }`
            )
            .join("\n");
          rubricContext =
            `RUBRIC: "${rubric.title}" (${rubric.course})\nCRITERIA:\n${criteriaText}`;
          if (rubric.extracted_text) {
            const extractedText = String(rubric.extracted_text);
            rubricContext += `\n\nRUBRIC TEXT:\n${
              extractedText.slice(0, 2_000)
            }${extractedText.length > 2_000 ? "... [truncated]" : ""}`;
          }
        }
      }
    }
  } else {
    const { data: activeRubric } = await db
      .from("rubrics")
      .select(
        "title, course, extracted_text, rubric_criteria(name, score, max_score)",
      )
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();
    if (activeRubric) {
      const criteriaText = ((activeRubric.rubric_criteria as
        | Array<Record<string, unknown>>
        | null) ?? [])
        .map((criterion) =>
          `  - ${criterion.name}: ${criterion.score ?? 0}/${
            criterion.max_score ?? 4
          }`
        )
        .join("\n");
      rubricContext =
        `ACTIVE RUBRIC: "${activeRubric.title}" (${activeRubric.course})\nCRITERIA:\n${criteriaText}`;
    }
  }

  const { data: recentHistory, error: historyError } = await db
    .from("dashboard_chat_messages")
    .select("id, role, text, server_sequence")
    .eq("user_id", user.id)
    .eq("chat_id", chatId)
    .neq("id", activeTurn.userMessageId)
    .order("server_sequence", { ascending: false })
    .limit(MAX_HISTORY_TURNS);
  if (historyError) {
    console.error(
      "[socratic-coach] Failed to load canonical chat history:",
      historyError,
    );
    await finishTurn(
      "failed",
      null,
      503,
      "Unable to load chat history",
    );
    return jsonResponse({ error: "Unable to load chat history" }, 503);
  }
  if (sessionTranscript.length) {
    const canonicalMessageIds = new Set(
      (recentHistory ?? []).map((message) => message.id),
    );
    canonicalMessageIds.add(activeTurn.userMessageId);
    const transcriptText = [...sessionTranscript]
      .reverse()
      .filter((message) => !canonicalMessageIds.has(message.id))
      .map((message) =>
        `${
          message.role === "user" ? "Student" : "StudyPilot"
        }: ${message.message_text}`
      )
      .join("\n");
    if (transcriptText) {
      sessionContext += `\n\nRECENT TRANSCRIPT:\n${transcriptText}`;
    }
  }
  const chatHistory = (recentHistory ?? []).reverse().map((message) => ({
    role: message.role === "user"
      ? "Student"
      : message.role === "ai"
      ? "StudyPilot"
      : "System",
    text: message.text,
  }));

  const contextParts: string[] = [];
  if (rubricContext) contextParts.push(rubricContext);
  if (sessionContext) contextParts.push(sessionContext);
  const formattedClientContext = formatClientContext(clientContext);
  if (formattedClientContext) contextParts.push(formattedClientContext);
  if (profile?.name) contextParts.push(`STUDENT NAME: ${profile.name}`);
  const systemWithContext = contextParts.length > 0
    ? `${SYSTEM_PROMPT}\n\n---\nCONTEXT:\n${contextParts.join("\n\n")}\n---`
    : SYSTEM_PROMPT;
  const historyText = chatHistory.map((message) =>
    `${message.role}: ${message.text}`
  ).join("\n");
  const interactionInput = historyText
    ? `Recent chat history:\n${historyText}\n\nStudent: ${userMessage}`
    : userMessage;
  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [
    { text: interactionInput },
    ...imageResult.images.map((image) => ({
      inlineData: { mimeType: image.mimeType, data: image.data },
    })),
  ];

  let geminiResponse: Response;
  try {
    geminiResponse = await createGeminiInteraction({
      model: getGeminiTextModel(),
      system_instruction: systemWithContext,
      input: interactionInput,
      parts,
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
  (async () => {
    const reader = geminiResponse.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";

    const consumeLine = async (line: string) => {
      const clean = line.trim();
      if (!clean.startsWith("data: ")) return;
      const raw = clean.slice(6).trim();
      if (!raw || raw === "[DONE]") return;
      try {
        const parsed = JSON.parse(raw);
        const text = parsed?.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text ?? "")
          .join("") ?? "";
        if (text) {
          fullResponse += text;
          await writer.write(encoder.encode(sseChunk(text)));
        }
        const finishReason = parsed?.candidates?.[0]?.finishReason;
        if (
          finishReason && finishReason !== "STOP" &&
          finishReason !== "MAX_TOKENS"
        ) {
          console.error("[socratic-coach] Gemini finish reason:", finishReason);
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

      const completed = await finishTurn(
        "completed",
        finalText,
        null,
        null,
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
