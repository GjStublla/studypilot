/**
 * Typed messaging protocol for StudyPilot Live.
 *
 * Security invariant:
 * - Ephemeral Gemini tokens exist ONLY on the SW ↔ offscreen channel.
 * - Content panel messages must NEVER carry ephemeralToken / bootstrap.token.
 */

/** Safe live UI state shared with the content panel (no secrets). */
export type LiveUiState =
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'live'
  | 'paused'
  | 'stopping'
  | 'error';

export type LiveSelection = {
  chatId: string | null;
  rubricId: string | null;
  sessionId: string | null;
};

/** Bootstrap returned by live-token — SW → offscreen only. */
export type LiveBootstrap = {
  ephemeralToken: string;
  accessToken?: string;
  authMode?: 'vertex' | 'gemini-ephemeral';
  websocketUrl?: string;
  expiresAt: string;
  /** Live WebSocket apiVersion from live-token (v1beta1 on Vertex). */
  apiVersion?: string;
  model?: string;
  systemInstruction?: string;
  sessionId: string | null;
  chatId: string;
  rubricId?: string | null;
  /** Optional Gemini Live session resumption handle from a prior connection. */
  resumptionHandle?: string | null;
  /** Server-built history from live-token.initialTurns — pass through to sendClientContent. */
  initialTurns: GeminiContentTurn[];
};

/** Gemini Live content turn (matches live-token initialTurns). */
export type GeminiContentTurn = {
  role: string;
  parts: Array<{ text?: string; [key: string]: unknown }>;
};

export type HistoryTurn = {
  role: 'user' | 'model';
  text: string;
};

export type TranscriptRole = 'user' | 'assistant';

// ─── Panel ↔ Service Worker (PUBLIC channel — no tokens) ───────────────────

export type PanelToSwMessage =
  | { type: 'PANEL_HELLO'; tabId?: number }
  | { type: 'GET_LIVE_STATUS' }
  | {
      type: 'LIVE_START';
      chatId?: string | null;
      rubricId?: string | null;
      sessionId?: string | null;
      /** Include one compressed JPEG of the active tab (default true). */
      captureScreenshot?: boolean;
    }
  | { type: 'LIVE_STOP' }
  | { type: 'LIVE_PAUSE' }
  | { type: 'LIVE_RESUME' }
  | {
      type: 'SET_SELECTION';
      chatId?: string | null;
      rubricId?: string | null;
      sessionId?: string | null;
    }
  | {
      type: 'AUTH_SET_SESSION';
      accessToken: string;
      refreshToken?: string;
    }
  | { type: 'AUTH_CLEAR' };

export type SwToPanelMessage =
  | {
      type: 'LIVE_STATUS';
      state: LiveUiState;
      selection: LiveSelection;
      selectionFrozen: boolean;
      error?: string | null;
      warning?: string | null;
      /** Suggest dashboard text coaching when Live provisioning fails. */
      fallback?: 'text-coaching' | null;
    }
  | {
      type: 'LIVE_TRANSCRIPT';
      role: TranscriptRole;
      text: string;
      finalized: boolean;
    }
  | {
      type: 'LIVE_WARNING';
      message: string;
    };

// ─── Service Worker ↔ Offscreen (PRIVATE channel — may carry token) ────────

export type SwToOffscreenMessage =
  | {
      type: 'OFFSCREEN_CONNECT';
      bootstrap: LiveBootstrap;
      /** base64 JPEG (no data: prefix), optional first-frame screenshot */
      screenshotJpegBase64?: string | null;
      /** true only for a brand-new Live; false on session resumption reconnect */
      seedHistoryAndScreenshot: boolean;
    }
  | { type: 'OFFSCREEN_DISCONNECT'; reason?: string }
  | { type: 'OFFSCREEN_PAUSE' }
  | { type: 'OFFSCREEN_RESUME' }
  | {
      type: 'OFFSCREEN_TOOL_RESPONSE';
      functionResponses: Array<{
        id: string;
        name: string;
        response: Record<string, unknown>;
      }>;
    }
  | { type: 'OFFSCREEN_PING' };

export type OffscreenToSwMessage =
  | { type: 'OFFSCREEN_READY' }
  | { type: 'OFFSCREEN_PONG' }
  | {
      type: 'LIVE_MACHINE_STATE';
      state: 'connecting' | 'live' | 'paused' | 'closing' | 'closed' | 'error';
      error?: string;
    }
  | {
      type: 'LIVE_TRANSCRIPT_PARTIAL';
      role: TranscriptRole;
      text: string;
    }
  | {
      type: 'LIVE_TURN_FINAL';
      userText: string | null;
      assistantText: string | null;
      warning?: string;
    }
  | {
      type: 'LIVE_TOOL_CALL';
      callId: string;
      name: string;
      args: Record<string, unknown>;
    }
  | {
      type: 'LIVE_RESUMPTION_UPDATE';
      handle: string;
    }
  | {
      type: 'LIVE_GO_AWAY';
      timeLeftMs?: number;
    }
  | {
      type: 'LIVE_INTERRUPTED';
    }
  | {
      type: 'LIVE_CONNECT_FAILED';
      message: string;
    };

export type ExtensionMessage =
  | PanelToSwMessage
  | SwToPanelMessage
  | SwToOffscreenMessage
  | OffscreenToSwMessage;

/** Strip any accidental token fields before forwarding to the panel. */
export function sanitizeForPanel(msg: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...msg };
  delete clone.ephemeralToken;
  delete clone.accessToken;
  delete clone.websocketUrl;
  delete clone.bootstrap;
  delete clone.token;
  delete clone.apiKey;
  if (clone.selection && typeof clone.selection === 'object') {
    // selection is already public ids only
  }
  return clone;
}

export function isOffscreenTarget(sender?: chrome.runtime.MessageSender): boolean {
  const url = sender?.url ?? '';
  return url.includes('offscreen.html');
}
