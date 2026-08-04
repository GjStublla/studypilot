import type {
  DashboardChatMessage,
  OriginSurface,
  SocraticCoachCommit,
} from './studypilot-types';

export type PendingTurnStatus = 'thinking' | 'streaming' | 'complete' | 'error';

export interface PendingChatTurn {
  requestId: string;
  userText: string;
  assistantText: string;
  createdAt: string;
  originSurface: OriginSurface;
  status: PendingTurnStatus;
  commit: SocraticCoachCommit | null;
}

export interface ChatThread {
  canonical: DashboardChatMessage[];
  pending: PendingChatTurn[];
  loadVersion: number;
  loadStatus: 'idle' | 'loading' | 'ready' | 'error';
  stale: boolean;
}

export type DashboardChatState = Record<string, ChatThread>;

export interface ChatViewMessage {
  id: string;
  requestId: string | null;
  role: 'ai' | 'user';
  text: string;
  lines: readonly string[];
  time: string;
  originSurface: OriginSurface;
  status: 'persisted' | PendingTurnStatus;
}

export type DashboardChatAction =
  | { type: 'load-started'; chatId: string; version: number }
  | { type: 'load-succeeded'; chatId: string; version: number; rows: DashboardChatMessage[] }
  | { type: 'load-failed'; chatId: string; version: number }
  | { type: 'invalidate'; chatId: string }
  | {
    type: 'turn-started';
    chatId: string;
    requestId: string;
    userText: string;
    createdAt: string;
    originSurface: OriginSurface;
  }
  | { type: 'token-received'; chatId: string; requestId: string; token: string }
  | { type: 'turn-committed'; chatId: string; requestId: string; commit: SocraticCoachCommit }
  | { type: 'turn-completed'; chatId: string; requestId: string }
  | { type: 'turn-failed'; chatId: string; requestId: string; error: string }
  | { type: 'chat-deleted'; chatId: string };

const LEGACY_RECONCILIATION_WINDOW_MS = 15 * 60 * 1000;

function emptyThread(): ChatThread {
  return {
    canonical: [],
    pending: [],
    loadVersion: 0,
    loadStatus: 'idle',
    stale: true,
  };
}

function updateThread(
  state: DashboardChatState,
  chatId: string,
  update: (thread: ChatThread) => ChatThread,
): DashboardChatState {
  return { ...state, [chatId]: update(state[chatId] ?? emptyThread()) };
}

function compareCanonical(a: DashboardChatMessage, b: DashboardChatMessage): number {
  const bySequence = (a.server_sequence ?? Number.MAX_SAFE_INTEGER)
    - (b.server_sequence ?? Number.MAX_SAFE_INTEGER);
  if (bySequence !== 0) return bySequence;
  return a.id.localeCompare(b.id);
}

function isNearTurn(row: DashboardChatMessage, turn: PendingChatTurn): boolean {
  const rowTime = Date.parse(row.created_at);
  const turnTime = Date.parse(turn.createdAt);
  return (
    Number.isFinite(rowTime)
    && Number.isFinite(turnTime)
    && Math.abs(rowTime - turnTime) <= LEGACY_RECONCILIATION_WINDOW_MS
  );
}

function findLegacyRow(
  turn: PendingChatTurn,
  canonical: DashboardChatMessage[],
  role: 'user' | 'ai',
  claimedIds?: ReadonlySet<string>,
  afterSequence?: number,
): DashboardChatMessage | undefined {
  const expectedText = role === 'user' ? turn.userText : turn.assistantText;
  if (!expectedText) return undefined;

  return canonical.find((row) => (
    row.request_id == null
    && row.role === role
    && row.text === expectedText
    && !claimedIds?.has(row.id)
    && isNearTurn(row, turn)
    && (
      afterSequence === undefined
      || row.server_sequence === undefined
      || row.server_sequence > afterSequence
    )
  ));
}

function hasLegacyCompletePair(
  turn: PendingChatTurn,
  canonical: DashboardChatMessage[],
): boolean {
  const userRow = findLegacyRow(turn, canonical, 'user');
  return Boolean(
    userRow
    && findLegacyRow(turn, canonical, 'ai', undefined, userRow.server_sequence),
  );
}

function reconcilePending(
  pending: PendingChatTurn[],
  canonical: DashboardChatMessage[],
): PendingChatTurn[] {
  return pending.filter((turn) => {
    const rows = canonical.filter((row) => row.request_id === turn.requestId);
    const hasCompletePair = (
      rows.some((row) => row.role === 'user')
      && rows.some((row) => row.role === 'ai')
    ) || hasLegacyCompletePair(turn, canonical);
    return !hasCompletePair || turn.status === 'thinking' || turn.status === 'streaming';
  });
}

export function dashboardChatReducer(
  state: DashboardChatState,
  action: DashboardChatAction,
): DashboardChatState {
  switch (action.type) {
    case 'load-started':
      return updateThread(state, action.chatId, (thread) => ({
        ...thread,
        loadVersion: action.version,
        loadStatus: 'loading',
      }));
    case 'load-succeeded':
      return updateThread(state, action.chatId, (thread) => {
        if (action.version !== thread.loadVersion) return thread;
        const canonical = [...action.rows].sort(compareCanonical);
        return {
          ...thread,
          canonical,
          pending: reconcilePending(thread.pending, canonical),
          loadStatus: 'ready',
          stale: false,
        };
      });
    case 'load-failed':
      return updateThread(state, action.chatId, (thread) => (
        action.version === thread.loadVersion
          ? { ...thread, loadStatus: 'error', stale: true }
          : thread
      ));
    case 'invalidate':
      return updateThread(state, action.chatId, (thread) => ({ ...thread, stale: true }));
    case 'turn-started':
      return updateThread(state, action.chatId, (thread) => ({
        ...thread,
        pending: [
          ...thread.pending.filter((turn) => turn.requestId !== action.requestId),
          {
            requestId: action.requestId,
            userText: action.userText,
            assistantText: '',
            createdAt: action.createdAt,
            originSurface: action.originSurface,
            status: 'thinking',
            commit: null,
          },
        ],
      }));
    case 'token-received':
      return updateThread(state, action.chatId, (thread) => ({
        ...thread,
        pending: thread.pending.map((turn) => (
          turn.requestId === action.requestId
            ? {
              ...turn,
              assistantText: turn.assistantText + action.token,
              status: 'streaming',
            }
            : turn
        )),
      }));
    case 'turn-committed':
      return updateThread(state, action.chatId, (thread) => ({
        ...thread,
        stale: true,
        pending: thread.pending.map((turn) => (
          turn.requestId === action.requestId
            ? { ...turn, status: 'complete', commit: action.commit }
            : turn
        )),
      }));
    case 'turn-completed':
      return updateThread(state, action.chatId, (thread) => ({
        ...thread,
        stale: true,
        pending: thread.pending.map((turn) => (
          turn.requestId === action.requestId
            ? { ...turn, status: 'complete' }
            : turn
        )),
      }));
    case 'turn-failed':
      return updateThread(state, action.chatId, (thread) => ({
        ...thread,
        stale: true,
        pending: thread.pending.map((turn) => (
          turn.requestId === action.requestId
            ? { ...turn, assistantText: `Error: ${action.error}`, status: 'error' }
            : turn
        )),
      }));
    case 'chat-deleted': {
      const next = { ...state };
      delete next[action.chatId];
      return next;
    }
  }
}

function displayTime(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function selectChatMessages(
  state: DashboardChatState,
  chatId: string | null,
): ChatViewMessage[] {
  if (!chatId) return [];
  const thread = state[chatId];
  if (!thread) return [];

  const messages: ChatViewMessage[] = thread.canonical
    .filter((row) => row.role !== 'system')
    .map((row) => ({
      id: row.id,
      requestId: row.request_id ?? null,
      role: row.role === 'user' ? 'user' : 'ai',
      text: row.text,
      lines: row.text.split('\n'),
      time: displayTime(row.created_at),
      originSurface: row.origin_surface,
      status: 'persisted',
    }));

  const claimedLegacyRowIds = new Set<string>();

  for (const turn of thread.pending) {
    const persistedRoles = new Set(
      thread.canonical
        .filter((row) => row.request_id === turn.requestId)
        .map((row) => row.role),
    );
    const legacyUser = persistedRoles.has('user')
      ? undefined
      : findLegacyRow(turn, thread.canonical, 'user', claimedLegacyRowIds);
    if (legacyUser) {
      persistedRoles.add('user');
      claimedLegacyRowIds.add(legacyUser.id);
    }
    const legacyAssistant = persistedRoles.has('ai')
      ? undefined
      : findLegacyRow(
        turn,
        thread.canonical,
        'ai',
        claimedLegacyRowIds,
        legacyUser?.server_sequence,
      );
    if (legacyAssistant) {
      persistedRoles.add('ai');
      claimedLegacyRowIds.add(legacyAssistant.id);
    }
    const time = displayTime(turn.createdAt);
    if (!persistedRoles.has('user')) {
      messages.push({
        id: `optimistic-${turn.requestId}-user`,
        requestId: turn.requestId,
        role: 'user',
        text: turn.userText,
        lines: turn.userText.split('\n'),
        time,
        originSurface: turn.originSurface,
        status: turn.status,
      });
    }
    if (!persistedRoles.has('ai')) {
      messages.push({
        id: `optimistic-${turn.requestId}-ai`,
        requestId: turn.requestId,
        role: 'ai',
        text: turn.assistantText,
        lines: turn.assistantText.split('\n'),
        time,
        originSurface: turn.originSurface,
        status: turn.status,
      });
    }
  }

  return messages;
}

export function isChatBusy(state: DashboardChatState, chatId: string | null): boolean {
  if (!chatId) return false;
  return (state[chatId]?.pending ?? []).some(
    (turn) => turn.status === 'thinking' || turn.status === 'streaming',
  );
}

export function isChatHistoryLoading(state: DashboardChatState, chatId: string | null): boolean {
  return chatId !== null && state[chatId]?.loadStatus === 'loading';
}

export function shouldLoadChat(state: DashboardChatState, chatId: string): boolean {
  const thread = state[chatId];
  return !thread || thread.stale || thread.loadStatus === 'idle' || thread.loadStatus === 'error';
}
