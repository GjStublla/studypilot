/**
 * Service worker: auth, Edge bootstrap, offscreen lifecycle, panel fan-out.
 *
 * SECURITY: Vertex Live accessToken from live-token is passed ONLY to the
 * offscreen document. Content panel receives status / transcripts — never
 * bootstrap or tokens.
 */

import { loadAuth, loadConfig, saveAuth, STORAGE_KEYS } from './lib/config';
import {
  canCommitLiveTurn,
  commitLiveTurn,
  fetchLiveRubricSearch,
  fetchLiveToken,
  finishLiveSession,
  resolveLiveAuth,
  type LiveTurnRequest,
} from './lib/edge';
import type {
  LiveBootstrap,
  LiveSelection,
  LiveUiState,
  OffscreenToSwMessage,
  PanelToSwMessage,
  SwToOffscreenMessage,
  SwToPanelMessage,
  GeminiContentTurn,
} from './lib/messages';
import { sanitizeForPanel } from './lib/messages';

const OFFSCREEN_URL = 'offscreen.html';
const OFFSCREEN_REASONS: chrome.offscreen.Reason[] = [
  'USER_MEDIA' as chrome.offscreen.Reason,
  'AUDIO_PLAYBACK' as chrome.offscreen.Reason,
];

const OFFSCREEN_INBOUND = new Set<OffscreenToSwMessage['type']>([
  'OFFSCREEN_READY',
  'OFFSCREEN_PONG',
  'LIVE_MACHINE_STATE',
  'LIVE_TRANSCRIPT_PARTIAL',
  'LIVE_TURN_FINAL',
  'LIVE_TOOL_CALL',
  'LIVE_RESUMPTION_UPDATE',
  'LIVE_GO_AWAY',
  'LIVE_INTERRUPTED',
  'LIVE_CONNECT_FAILED',
]);

const PANEL_INBOUND = new Set<PanelToSwMessage['type']>([
  'PANEL_HELLO',
  'GET_LIVE_STATUS',
  'LIVE_START',
  'LIVE_STOP',
  'LIVE_PAUSE',
  'LIVE_RESUME',
  'SET_SELECTION',
  'AUTH_SET_SESSION',
  'AUTH_CLEAR',
]);

type PendingTurn = LiveTurnRequest & { queuedAt: number };

const MAX_RESUMPTION_RECONNECTS = 3;

type RuntimeLive = {
  state: LiveUiState;
  selection: LiveSelection;
  selectionFrozen: boolean;
  error: string | null;
  warning: string | null;
  fallback: 'text-coaching' | null;
  /** Redacted after handoff — never broadcast. */
  bootstrap: LiveBootstrap | null;
  hasSeededSession: boolean;
  resumptionHandle: string | null;
  /** Client-generated live_chat_sessions.id for Edge RPCs. */
  liveSessionId: string | null;
  /** Wall-clock when the current live session started (for durationSeconds). */
  startedAtMs: number | null;
  pendingTurns: PendingTurn[];
  reconnecting: boolean;
  reconnectAttempts: number;
};

const live: RuntimeLive = {
  state: 'idle',
  selection: { chatId: null, rubricId: null, sessionId: null },
  selectionFrozen: false,
  error: null,
  warning: null,
  fallback: null,
  bootstrap: null,
  hasSeededSession: false,
  resumptionHandle: null,
  liveSessionId: null,
  startedAtMs: null,
  pendingTurns: [],
  reconnecting: false,
  reconnectAttempts: 0,
};

async function persistPendingTurns(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.pendingTurns]: live.pendingTurns });
}

async function restorePersisted(): Promise<void> {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.selection,
    STORAGE_KEYS.resumption,
    STORAGE_KEYS.pendingTurns,
  ]);
  const sel = data[STORAGE_KEYS.selection] as LiveSelection | undefined;
  if (sel) live.selection = sel;
  const handle = data[STORAGE_KEYS.resumption] as string | undefined;
  if (handle) live.resumptionHandle = handle;
  const pending = data[STORAGE_KEYS.pendingTurns] as PendingTurn[] | undefined;
  if (pending?.length) live.pendingTurns = pending;
}

function statusMessage(): SwToPanelMessage {
  return {
    type: 'LIVE_STATUS',
    state: live.state,
    selection: { ...live.selection },
    selectionFrozen: live.selectionFrozen,
    error: live.error,
    warning: live.warning,
    fallback: live.fallback,
  };
}

async function broadcastToPanels(msg: SwToPanelMessage): Promise<void> {
  const safe = sanitizeForPanel(msg as unknown as Record<string, unknown>);
  try {
    await chrome.runtime.sendMessage(safe);
  } catch {
    // no extension-page receivers
  }
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null) return;
      try {
        await chrome.tabs.sendMessage(tab.id, safe);
      } catch {
        // tab without content script
      }
    }),
  );
}

async function setState(partial: Partial<RuntimeLive>): Promise<void> {
  Object.assign(live, partial);
  await broadcastToPanels(statusMessage());
}

async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
  });
  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: OFFSCREEN_REASONS,
    justification:
      'Gemini Live mic capture, PCM playback, and WebSocket session must outlive tab navigation.',
  });

  // Wait briefly for the offscreen module to register its listener.
  await new Promise<void>((resolve) => {
    const started = Date.now();
    const tick = () => {
      void chrome.runtime
        .sendMessage({ type: 'OFFSCREEN_PING' } satisfies SwToOffscreenMessage)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - started > 5000) resolve();
          else setTimeout(tick, 50);
        });
    };
    tick();
  });
}

async function sendToOffscreen(msg: SwToOffscreenMessage): Promise<void> {
  await ensureOffscreen();
  await chrome.runtime.sendMessage(msg);
}

async function edgeConfig() {
  const config = await loadConfig();
  const auth = await loadAuth();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Missing Supabase URL / anon key. Set via build env or chrome.storage.');
  }
  if (!auth?.accessToken) {
    throw new Error('Not signed in. Set AUTH_SET_SESSION from the panel or dashboard.');
  }
  return {
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    accessToken: auth.accessToken,
  };
}

async function resolveCanonicalChat(opts: {
  chatId?: string | null;
  sessionId?: string | null;
  rubricId?: string | null;
}): Promise<{ chatId: string; sessionId: string | null; rubricId: string | null }> {
  const chatId = opts.chatId || live.selection.chatId;
  if (!chatId) {
    throw new Error(
      'chatId is required. Open a dashboard chat (or paste its UUID) before starting Live.',
    );
  }
  const sessionId = opts.sessionId || live.selection.sessionId || null;
  const rubricId = opts.rubricId ?? live.selection.rubricId;
  return { chatId, sessionId, rubricId };
}

async function captureActiveTabJpeg(): Promise<string | null> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 55 });
    return dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
  } catch {
    return null;
  }
}

function normalizeInitialTurns(raw: unknown): GeminiContentTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: GeminiContentTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = typeof (item as { role?: unknown }).role === 'string'
      ? (item as { role: string }).role
      : null;
    const parts = (item as { parts?: unknown }).parts;
    if (!role || !Array.isArray(parts)) continue;
    turns.push({
      role,
      parts: parts.filter((p) => p && typeof p === 'object') as GeminiContentTurn['parts'],
    });
  }
  return turns;
}

async function flushPendingTurns(): Promise<void> {
  if (!live.pendingTurns.length) return;
  const cfg = await edgeConfig();
  const remaining: PendingTurn[] = [];
  let droppedPartial = 0;
  for (const turn of live.pendingTurns) {
    if (!canCommitLiveTurn(turn.userText, turn.assistantText)) {
      droppedPartial += 1;
      continue;
    }
    try {
      await commitLiveTurn(cfg, turn);
    } catch {
      remaining.push(turn);
    }
  }
  live.pendingTurns = remaining;
  await persistPendingTurns();
  if (droppedPartial) {
    live.warning =
      `Dropped ${droppedPartial} unsaved turn(s) with partial transcripts (both sides required).`;
    await broadcastToPanels(statusMessage());
  }
  if (remaining.length) {
    live.warning = `Failed to flush ${remaining.length} turn(s). Will retry on next stop.`;
    await broadcastToPanels(statusMessage());
  }
}

/**
 * Reconnect Gemini Live with the stored resumption handle.
 * Does NOT reseed history/screenshot. Same liveSessionId; fresh ephemeral token.
 */
async function reconnectWithResumption(trigger: 'go_away' | 'closed'): Promise<void> {
  if (live.reconnecting) return;
  if (
    live.state === 'idle' ||
    live.state === 'stopping' ||
    live.state === 'starting' ||
    live.state === 'error'
  ) {
    return;
  }

  const handle = live.resumptionHandle;
  const liveSessionId = live.liveSessionId;
  const chatId = live.selection.chatId;
  if (!handle || !liveSessionId || !chatId) {
    live.warning =
      trigger === 'go_away'
        ? 'GoAway received without a resumption handle — cannot reconnect this Live session.'
        : 'Live connection closed without a resumption handle.';
    await broadcastToPanels({ type: 'LIVE_WARNING', message: live.warning });
    return;
  }

  if (live.reconnectAttempts >= MAX_RESUMPTION_RECONNECTS) {
    await setState({
      state: 'error',
      error: 'Live reconnect failed too many times',
      fallback: 'text-coaching',
      selectionFrozen: false,
      warning: 'Live could not resume after GoAway. Use text coaching as a fallback.',
    });
    live.reconnecting = false;
    return;
  }

  live.reconnecting = true;
  live.reconnectAttempts += 1;
  await setState({
    state: 'connecting',
    warning: `Reconnecting Live session (${live.reconnectAttempts}/${MAX_RESUMPTION_RECONNECTS})…`,
    error: null,
  });

  try {
    try {
      await sendToOffscreen({ type: 'OFFSCREEN_DISCONNECT', reason: 'resumption_reconnect' });
    } catch {
      // offscreen may already be closed
    }

    const cfg = await edgeConfig();
    const tokenRes = await fetchLiveToken(cfg, {
      liveSessionId,
      chatId,
      saveToDashboard: true,
      mode: 'Study Coach',
      quotaRequestId: liveSessionId,
    });

    const auth = resolveLiveAuth(tokenRes);

    if (tokenRes.sessionId) {
      live.selection.sessionId = tokenRes.sessionId;
      await chrome.storage.local.set({ [STORAGE_KEYS.selection]: live.selection });
    }

    const expiresAt =
      tokenRes.expireTime ||
      tokenRes.expiresAt ||
      new Date(Date.now() + 30 * 60_000).toISOString();

    const bootstrap: LiveBootstrap = {
      ephemeralToken: auth.ephemeralToken,
      accessToken: auth.accessToken,
      authMode: auth.authMode,
      websocketUrl: auth.websocketUrl,
      expiresAt,
      apiVersion: tokenRes.apiVersion,
      model: tokenRes.model,
      systemInstruction: tokenRes.systemInstruction,
      sessionId: tokenRes.sessionId ?? live.selection.sessionId,
      chatId: tokenRes.chatId || chatId,
      rubricId: live.selection.rubricId,
      resumptionHandle: handle,
      initialTurns: [],
    };

    await sendToOffscreen({
      type: 'OFFSCREEN_CONNECT',
      bootstrap,
      screenshotJpegBase64: null,
      seedHistoryAndScreenshot: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    live.reconnecting = false;
    if (live.reconnectAttempts < MAX_RESUMPTION_RECONNECTS) {
      live.warning = `Live resume failed (${message}). Retrying…`;
      await broadcastToPanels({ type: 'LIVE_WARNING', message: live.warning });
      await new Promise((r) => setTimeout(r, 750));
      await reconnectWithResumption(trigger);
      return;
    }
    await setState({
      state: 'error',
      error: message,
      fallback: 'text-coaching',
      selectionFrozen: false,
      warning: 'Live could not resume after reconnect. Use text coaching as a fallback.',
    });
  }
}

async function startLive(msg: Extract<PanelToSwMessage, { type: 'LIVE_START' }>): Promise<void> {
  if (live.state === 'live' || live.state === 'connecting' || live.state === 'starting' || live.state === 'paused') {
    throw new Error('Live already active. Stop the current session before starting another.');
  }

  await setState({
    state: 'starting',
    error: null,
    warning: null,
    fallback: null,
    selectionFrozen: true,
  });

  try {
    const resolved = await resolveCanonicalChat(msg);
    live.selection = {
      chatId: resolved.chatId,
      sessionId: resolved.sessionId,
      rubricId: resolved.rubricId,
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.selection]: live.selection });

    const liveSessionId = crypto.randomUUID();
    live.liveSessionId = liveSessionId;
    live.startedAtMs = Date.now();

    const cfg = await edgeConfig();
    await setState({ state: 'connecting' });

    let page: { title?: string; url?: string } | undefined;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.title || tab?.url) {
        page = { title: tab.title, url: tab.url };
      }
    } catch {
      // page context is optional
    }

    // Startup order: resolve chat → screenshot → bootstrap → connect → history → video → mic
    const seed = !live.hasSeededSession;
    const screenshot =
      seed && msg.captureScreenshot !== false ? await captureActiveTabJpeg() : null;

    const tokenRes = await fetchLiveToken(cfg, {
      liveSessionId,
      chatId: resolved.chatId,
      saveToDashboard: true,
      page,
      mode: 'Study Coach',
      quotaRequestId: liveSessionId,
    });

    const auth = resolveLiveAuth(tokenRes);

    if (tokenRes.sessionId) {
      live.selection.sessionId = tokenRes.sessionId;
      await chrome.storage.local.set({ [STORAGE_KEYS.selection]: live.selection });
    }

    const expiresAt =
      tokenRes.expireTime ||
      tokenRes.expiresAt ||
      new Date(Date.now() + 30 * 60_000).toISOString();

    const initialTurns = normalizeInitialTurns(tokenRes.initialTurns);

    const bootstrap: LiveBootstrap = {
      ephemeralToken: auth.ephemeralToken,
      accessToken: auth.accessToken,
      authMode: auth.authMode,
      websocketUrl: auth.websocketUrl,
      expiresAt,
      apiVersion: tokenRes.apiVersion,
      model: tokenRes.model,
      systemInstruction: tokenRes.systemInstruction,
      sessionId: tokenRes.sessionId ?? resolved.sessionId,
      chatId: tokenRes.chatId || resolved.chatId,
      rubricId: resolved.rubricId,
      // Fresh seed uses server initialTurns; resumption must not reseed.
      resumptionHandle: seed ? null : live.resumptionHandle,
      initialTurns: seed ? initialTurns : [],
    };

    live.reconnectAttempts = 0;
    live.reconnecting = false;

    // Token stays on SW → offscreen only. Never include in broadcastToPanels.
    await sendToOffscreen({
      type: 'OFFSCREEN_CONNECT',
      bootstrap,
      screenshotJpegBase64: screenshot,
      seedHistoryAndScreenshot: seed,
    });

    live.hasSeededSession = true;
    live.bootstrap = null; // drop token from SW after handoff
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    live.bootstrap = null;
    live.liveSessionId = null;
    live.startedAtMs = null;
    await setState({
      state: 'error',
      error: message,
      fallback: 'text-coaching',
      selectionFrozen: false,
      warning:
        'Live coaching could not be provisioned. Use dashboard text coaching as a fallback.',
    });
    throw err;
  }
}

async function stopLive(reason: 'user_stop' | 'error' | 'go_away' = 'user_stop'): Promise<void> {
  await setState({ state: 'stopping' });
  try {
    await sendToOffscreen({ type: 'OFFSCREEN_DISCONNECT', reason });
  } catch {
    // offscreen may already be gone
  }

  await flushPendingTurns();

  try {
    if (live.liveSessionId) {
      const cfg = await edgeConfig();
      const durationSeconds =
        live.startedAtMs != null
          ? Math.max(0, Math.floor((Date.now() - live.startedAtMs) / 1000))
          : undefined;
      await finishLiveSession(cfg, {
        liveSessionId: live.liveSessionId,
        reason,
        status: reason === 'error' ? 'failed' : 'finished',
        durationSeconds,
        resumeHandle: live.resumptionHandle,
      });
    }
  } catch (err) {
    live.warning =
      err instanceof Error ? `live-finish failed: ${err.message}` : 'live-finish failed';
  }

  live.bootstrap = null;
  live.hasSeededSession = false;
  live.liveSessionId = null;
  live.startedAtMs = null;
  live.reconnecting = false;
  live.reconnectAttempts = 0;
  await setState({
    state: 'idle',
    selectionFrozen: false,
    error: null,
    fallback: null,
  });
}

async function handleToolCall(msg: Extract<OffscreenToSwMessage, { type: 'LIVE_TOOL_CALL' }>) {
  if (msg.name !== 'search_rubric') {
    await sendToOffscreen({
      type: 'OFFSCREEN_TOOL_RESPONSE',
      functionResponses: [
        {
          id: msg.callId,
          name: msg.name,
          response: { error: `Unknown tool: ${msg.name}` },
        },
      ],
    });
    return;
  }

  try {
    if (!live.liveSessionId) {
      throw new Error('No active live session for rubric search');
    }
    const cfg = await edgeConfig();
    const result = await fetchLiveRubricSearch(cfg, {
      liveSessionId: live.liveSessionId,
      requestId: crypto.randomUUID(),
      query: String(msg.args.query ?? ''),
    });
    await sendToOffscreen({
      type: 'OFFSCREEN_TOOL_RESPONSE',
      functionResponses: [
        {
          id: msg.callId,
          name: msg.name,
          response: {
            evidence: result.evidence ?? '',
            citations: result.citations ?? [],
            usedFileSearch: result.usedFileSearch ?? false,
            message: result.message,
          },
        },
      ],
    });
  } catch (err) {
    await sendToOffscreen({
      type: 'OFFSCREEN_TOOL_RESPONSE',
      functionResponses: [
        {
          id: msg.callId,
          name: msg.name,
          response: { error: err instanceof Error ? err.message : String(err) },
        },
      ],
    });
  }
}

async function handleOffscreenMessage(msg: OffscreenToSwMessage): Promise<void> {
  switch (msg.type) {
    case 'OFFSCREEN_READY':
    case 'OFFSCREEN_PONG':
    case 'LIVE_INTERRUPTED':
      break;
    case 'LIVE_MACHINE_STATE':
      if (msg.state === 'live') {
        live.reconnecting = false;
        live.reconnectAttempts = 0;
        await setState({ state: 'live', error: null });
      } else if (msg.state === 'paused') await setState({ state: 'paused' });
      else if (msg.state === 'error') {
        live.reconnecting = false;
        await setState({
          state: 'error',
          error: msg.error ?? 'Live error',
          fallback: 'text-coaching',
          selectionFrozen: false,
        });
      } else if (
        msg.state === 'closed' &&
        !live.reconnecting &&
        live.state !== 'idle' &&
        live.state !== 'stopping'
      ) {
        if (live.resumptionHandle && live.liveSessionId && live.selection.chatId) {
          void reconnectWithResumption('closed');
        } else {
          await setState({ state: 'idle', selectionFrozen: false });
        }
      }
      break;
    case 'LIVE_TRANSCRIPT_PARTIAL':
      await broadcastToPanels({
        type: 'LIVE_TRANSCRIPT',
        role: msg.role,
        text: msg.text,
        finalized: false,
      });
      break;
    case 'LIVE_TURN_FINAL': {
      const savable = canCommitLiveTurn(msg.userText, msg.assistantText);
      const warning =
        msg.warning ||
        (!savable
          ? 'Unsaved turn: both user and assistant transcripts are required.'
          : undefined);
      if (warning) {
        live.warning = warning;
        await broadcastToPanels({ type: 'LIVE_WARNING', message: warning });
      }
      await broadcastToPanels({
        type: 'LIVE_TRANSCRIPT',
        role: 'user',
        text: msg.userText ?? '',
        finalized: true,
      });
      await broadcastToPanels({
        type: 'LIVE_TRANSCRIPT',
        role: 'assistant',
        text: msg.assistantText ?? '',
        finalized: true,
      });

      if (!savable || !live.liveSessionId) {
        break;
      }

      const elapsedSeconds =
        live.startedAtMs != null
          ? Math.max(0, Math.floor((Date.now() - live.startedAtMs) / 1000))
          : 0;
      const turn: PendingTurn = {
        liveSessionId: live.liveSessionId,
        requestId: crypto.randomUUID(),
        userMessageId: crypto.randomUUID(),
        assistantMessageId: crypto.randomUUID(),
        userText: msg.userText,
        assistantText: msg.assistantText,
        timeOffsetSeconds: elapsedSeconds,
        originSurface: 'extension',
        queuedAt: Date.now(),
      };
      try {
        const cfg = await edgeConfig();
        await commitLiveTurn(cfg, turn);
      } catch {
        live.pendingTurns.push(turn);
        await persistPendingTurns();
      }
      break;
    }
    case 'LIVE_TOOL_CALL':
      await handleToolCall(msg);
      break;
    case 'LIVE_RESUMPTION_UPDATE':
      live.resumptionHandle = msg.handle;
      await chrome.storage.local.set({ [STORAGE_KEYS.resumption]: msg.handle });
      break;
    case 'LIVE_GO_AWAY': {
      const tip =
        msg.timeLeftMs != null
          ? `Gemini GoAway in ${msg.timeLeftMs}ms — reconnecting with resumption handle.`
          : 'Gemini GoAway — reconnecting with resumption handle.';
      live.warning = tip;
      await broadcastToPanels({ type: 'LIVE_WARNING', message: tip });
      void reconnectWithResumption('go_away');
      break;
    }
    case 'LIVE_CONNECT_FAILED':
      live.bootstrap = null;
      live.reconnecting = false;
      if (
        live.resumptionHandle &&
        live.liveSessionId &&
        live.reconnectAttempts < MAX_RESUMPTION_RECONNECTS &&
        live.state !== 'idle' &&
        live.state !== 'stopping'
      ) {
        live.warning = `Live connect failed (${msg.message}). Retrying resume…`;
        await broadcastToPanels({ type: 'LIVE_WARNING', message: live.warning });
        void reconnectWithResumption('go_away');
        break;
      }
      await setState({
        state: 'error',
        error: msg.message,
        fallback: 'text-coaching',
        selectionFrozen: false,
        warning:
          'Live coaching could not start. Open the StudyPilot dashboard for text coaching instead.',
      });
      break;
  }
}

async function handlePanelMessage(msg: PanelToSwMessage): Promise<unknown> {
  switch (msg.type) {
    case 'PANEL_HELLO':
    case 'GET_LIVE_STATUS':
      return statusMessage();
    case 'AUTH_SET_SESSION':
      await saveAuth({ accessToken: msg.accessToken, refreshToken: msg.refreshToken });
      return { ok: true };
    case 'AUTH_CLEAR':
      await saveAuth(null);
      return { ok: true };
    case 'SET_SELECTION':
      if (live.selectionFrozen) {
        return { ok: false, error: 'Chat/rubric selection is frozen while Live is active.' };
      }
      live.selection = {
        chatId: msg.chatId ?? live.selection.chatId,
        rubricId: msg.rubricId ?? live.selection.rubricId,
        sessionId: msg.sessionId ?? live.selection.sessionId,
      };
      await chrome.storage.local.set({ [STORAGE_KEYS.selection]: live.selection });
      await broadcastToPanels(statusMessage());
      return { ok: true, selection: live.selection };
    case 'LIVE_START':
      await startLive(msg);
      return statusMessage();
    case 'LIVE_STOP':
      await stopLive('user_stop');
      return statusMessage();
    case 'LIVE_PAUSE':
      await sendToOffscreen({ type: 'OFFSCREEN_PAUSE' });
      await setState({ state: 'paused' });
      return statusMessage();
    case 'LIVE_RESUME':
      await sendToOffscreen({ type: 'OFFSCREEN_RESUME' });
      await setState({ state: 'live' });
      return statusMessage();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void restorePersisted();
});
chrome.runtime.onStartup.addListener(() => {
  void restorePersisted();
});
void restorePersisted();

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  void (async () => {
    try {
      if (!raw || typeof raw !== 'object' || !('type' in raw)) {
        sendResponse({ ok: false, error: 'Invalid message' });
        return;
      }
      const type = String((raw as { type: string }).type);

      if (OFFSCREEN_INBOUND.has(type as OffscreenToSwMessage['type'])) {
        await handleOffscreenMessage(raw as OffscreenToSwMessage);
        sendResponse({ ok: true });
        return;
      }

      if (PANEL_INBOUND.has(type as PanelToSwMessage['type'])) {
        const result = await handlePanelMessage(raw as PanelToSwMessage);
        sendResponse(result);
        return;
      }

      // Ignore SW→offscreen echoes / unknown types quietly.
      sendResponse({ ok: false, error: `Unhandled message type: ${type}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({ ok: false, error: message, status: statusMessage() });
    }
  })();
  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'PANEL_TOGGLE' });
  } catch {
    // content script may not be injected on this URL
  }
});
