/**
 * Supabase Edge contracts for StudyPilot Live.
 * Payloads match live-token / live-rubric-search / live-turn / live-finish.
 *
 * Auth: Authorization: Bearer <user JWT>, apikey: <anon key>
 */

export type LiveTokenRequest = {
  liveSessionId: string;
  chatId: string;
  saveToDashboard?: boolean;
  page?: { title?: string; url?: string };
  mode?: string;
  quotaRequestId?: string;
};

export type LiveTokenResponse = {
  authMode?: 'vertex' | 'gemini-ephemeral';
  accessToken?: string;
  /**
   * Compat: live-token sets ephemeralToken = accessToken for older clients.
   * Prefer accessToken when present.
   */
  ephemeralToken?: string;
  websocketUrl?: string;
  model?: string;
  modelId?: string;
  /** Live WebSocket / SDK revision (v1beta1 on Vertex). */
  apiVersion?: string;
  expireTime?: string;
  newSessionExpireTime?: string;
  /** @deprecated prefer expireTime from live-token */
  expiresAt?: string;
  liveSessionId?: string;
  chatId?: string;
  sessionId?: string | null;
  contextThroughSequence?: number | null;
  initialTurns?: unknown[];
  systemInstruction?: string;
  rubric?: {
    id: string;
    title: string;
    course?: string | null;
    fileSearchStatus?: string | null;
    criteriaCount?: number;
  } | null;
  ragReady?: boolean;
  saveToDashboard?: boolean;
  error?: string;
  blocker?: string;
};

/** Resolve Vertex (or legacy) Live auth fields from a live-token response. */
export function resolveLiveAuth(tokenRes: LiveTokenResponse): {
  accessToken: string;
  ephemeralToken: string;
  authMode: 'vertex' | 'gemini-ephemeral';
  websocketUrl?: string;
} {
  const accessToken = (tokenRes.accessToken || tokenRes.ephemeralToken || '').trim();
  if (!accessToken) {
    throw new Error(
      tokenRes.error ||
        tokenRes.blocker ||
        'live-token returned no accessToken',
    );
  }
  const authMode: 'vertex' | 'gemini-ephemeral' =
    tokenRes.authMode === 'gemini-ephemeral'
      ? 'gemini-ephemeral'
      : tokenRes.authMode === 'vertex' || Boolean(tokenRes.websocketUrl)
        ? 'vertex'
        : 'gemini-ephemeral';
  if (authMode === 'vertex' && !tokenRes.websocketUrl?.trim()) {
    throw new Error('live-token vertex response missing websocketUrl');
  }
  return {
    accessToken,
    ephemeralToken: (tokenRes.ephemeralToken || accessToken).trim(),
    authMode,
    websocketUrl: tokenRes.websocketUrl?.trim() || undefined,
  };
}

/** commit_live_turn requires both sides — partial transcripts must not be committed or retried. */
export function canCommitLiveTurn(
  userText: string | null | undefined,
  assistantText: string | null | undefined,
): boolean {
  const user = typeof userText === 'string' ? userText.trim() : '';
  const assistant = typeof assistantText === 'string' ? assistantText.trim() : '';
  return user.length > 0 && assistant.length > 0;
}

export type LiveRubricSearchRequest = {
  liveSessionId: string;
  requestId: string;
  query: string;
};

export type LiveRubricSearchResponse = {
  evidence?: string;
  citations?: unknown[];
  usedFileSearch?: boolean;
  storeName?: string | null;
  groundingMetadata?: Record<string, unknown> | null;
  message?: string;
  error?: string;
};

export type LiveTurnRequest = {
  liveSessionId: string;
  requestId: string;
  userMessageId: string;
  assistantMessageId: string;
  userText: string | null;
  assistantText: string | null;
  timeOffsetSeconds?: number;
  originSurface?: string;
  usedFileSearch?: boolean;
  fileSearchStoreName?: string | null;
  groundingMetadata?: Record<string, unknown> | null;
};

export type LiveTurnResponse = {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
};

export type LiveFinishRequest = {
  liveSessionId: string;
  status?: 'finished' | 'failed' | 'paused';
  /** Extension reason codes are mapped server-side onto finish statuses. */
  reason?: 'user_stop' | 'error' | 'go_away' | 'flush';
  durationSeconds?: number;
  resumeHandle?: string | null;
};

export type LiveFinishResponse = {
  ok?: boolean;
  liveSessionId?: string;
  status?: string;
  sessionId?: string | null;
  summaryStarted?: boolean;
  error?: string;
};

export type EdgeConfig = {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
};

async function postEdge<TReq, TRes>(
  config: EdgeConfig,
  path: string,
  body: TReq,
): Promise<TRes> {
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.accessToken}`,
      apikey: config.anonKey,
    },
    body: JSON.stringify(body ?? {}),
  });

  const data = (await res.json().catch(() => ({}))) as TRes & { error?: string };
  if (!res.ok) {
    const msg =
      typeof data.error === 'string' && data.error.trim()
        ? data.error
        : `Edge ${path} failed: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

/** POST functions/v1/live-token — returns ephemeral Gemini Live token (SW only). */
export function fetchLiveToken(config: EdgeConfig, body: LiveTokenRequest) {
  return postEdge<LiveTokenRequest, LiveTokenResponse>(config, 'live-token', body);
}

/** POST functions/v1/live-rubric-search — tool fulfillment for search_rubric. */
export function fetchLiveRubricSearch(config: EdgeConfig, body: LiveRubricSearchRequest) {
  return postEdge<LiveRubricSearchRequest, LiveRubricSearchResponse>(
    config,
    'live-rubric-search',
    body,
  );
}

/** POST functions/v1/live-turn — commit one finalized voice pair. Never posts empty text. */
export function commitLiveTurn(config: EdgeConfig, body: LiveTurnRequest) {
  const userText = typeof body.userText === 'string' ? body.userText.trim() : '';
  const assistantText =
    typeof body.assistantText === 'string' ? body.assistantText.trim() : '';
  if (!canCommitLiveTurn(userText, assistantText)) {
    return Promise.reject(
      new Error('live-turn requires both userText and assistantText'),
    );
  }
  return postEdge<LiveTurnRequest, LiveTurnResponse>(config, 'live-turn', {
    ...body,
    userText,
    assistantText,
  });
}

/** POST functions/v1/live-finish — end Live session bookkeeping. */
export function finishLiveSession(config: EdgeConfig, body: LiveFinishRequest) {
  return postEdge<LiveFinishRequest, LiveFinishResponse>(config, 'live-finish', body);
}
