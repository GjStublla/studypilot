import { describe, expect, it } from 'vitest';
import { dashboardChatReducer, selectChatMessages, type DashboardChatState } from './dashboard-chat-state';
import type { DashboardChatMessage, SocraticCoachCommit } from './studypilot-types';

function message(
  id: string,
  role: 'user' | 'ai',
  requestId: string | null,
  sequence: number,
  extras: Partial<DashboardChatMessage> = {},
): DashboardChatMessage {
  return {
    id,
    user_id: 'user-1',
    chat_id: 'chat-a',
    session_id: null,
    role,
    text: `${role}-${sequence}`,
    origin_surface: 'dashboard',
    request_id: requestId,
    server_sequence: sequence,
    created_at: '2026-08-04T10:00:00.000Z',
    ...extras,
  };
}

function startTurn(state: DashboardChatState, chatId: string, requestId: string) {
  return dashboardChatReducer(state, {
    type: 'turn-started',
    chatId,
    requestId,
    userText: `question-${chatId}`,
    createdAt: '2026-08-04T10:00:00.000Z',
    originSurface: 'dashboard',
  });
}

describe('dashboard chat state', () => {
  it('keeps streamed tokens with their originating chat while another chat is active', () => {
    let state = startTurn({}, 'chat-a', 'request-a');
    state = startTurn(state, 'chat-b', 'request-b');
    state = dashboardChatReducer(state, {
      type: 'token-received',
      chatId: 'chat-a',
      requestId: 'request-a',
      token: 'answer-a',
    });

    expect(selectChatMessages(state, 'chat-b').map((row) => row.text)).not.toContain('answer-a');
    expect(selectChatMessages(state, 'chat-a').map((row) => row.text)).toContain('answer-a');
  });

  it('overlays a pending assistant without duplicating its canonical user row', () => {
    let state = startTurn({}, 'chat-a', 'request-a');
    state = dashboardChatReducer(state, {
      type: 'load-started',
      chatId: 'chat-a',
      version: 1,
    });
    state = dashboardChatReducer(state, {
      type: 'load-succeeded',
      chatId: 'chat-a',
      version: 1,
      rows: [message('user-row', 'user', 'request-a', 1)],
    });

    const visible = selectChatMessages(state, 'chat-a');
    expect(visible.filter((row) => row.role === 'user')).toHaveLength(1);
    expect(visible.filter((row) => row.role === 'ai')).toHaveLength(1);
    expect(visible.find((row) => row.role === 'ai')?.status).toBe('thinking');
  });

  it('removes an optimistic turn after both committed rows load', () => {
    let state = startTurn({}, 'chat-a', 'request-a');
    const commit: SocraticCoachCommit = {
      type: 'commit',
      chatId: 'chat-a',
      requestId: 'request-a',
      userMessageId: 'user-row',
      assistantMessageId: 'assistant-row',
      userSequence: 1,
      assistantSequence: 2,
    };
    state = dashboardChatReducer(state, {
      type: 'turn-committed',
      chatId: 'chat-a',
      requestId: 'request-a',
      commit,
    });
    state = dashboardChatReducer(state, { type: 'load-started', chatId: 'chat-a', version: 1 });
    state = dashboardChatReducer(state, {
      type: 'load-succeeded',
      chatId: 'chat-a',
      version: 1,
      rows: [message('assistant-row', 'ai', 'request-a', 2), message('user-row', 'user', 'request-a', 1)],
    });

    expect(state['chat-a'].pending).toHaveLength(0);
    expect(selectChatMessages(state, 'chat-a').map((row) => row.id)).toEqual(['user-row', 'assistant-row']);
  });

  it('keeps an in-flight lock when Realtime loads the durable pair before SSE commit', () => {
    let state = startTurn({}, 'chat-a', 'request-a');
    state = dashboardChatReducer(state, { type: 'load-started', chatId: 'chat-a', version: 1 });
    state = dashboardChatReducer(state, {
      type: 'load-succeeded',
      chatId: 'chat-a',
      version: 1,
      rows: [message('user-row', 'user', 'request-a', 1), message('assistant-row', 'ai', 'request-a', 2)],
    });

    expect(state['chat-a'].pending).toHaveLength(1);
    expect(state['chat-a'].pending[0].status).toBe('thinking');
  });

  it('does not duplicate a legacy persisted user row after a failed request', () => {
    let state = startTurn({}, 'chat-a', 'request-a');
    state = dashboardChatReducer(state, {
      type: 'turn-failed',
      chatId: 'chat-a',
      requestId: 'request-a',
      error: 'AI unavailable',
    });
    state = dashboardChatReducer(state, { type: 'load-started', chatId: 'chat-a', version: 1 });
    state = dashboardChatReducer(state, {
      type: 'load-succeeded',
      chatId: 'chat-a',
      version: 1,
      rows: [{ ...message('legacy-user', 'user', null, 1), text: 'question-chat-a' }],
    });

    const visible = selectChatMessages(state, 'chat-a');
    expect(visible.filter((row) => row.role === 'user')).toHaveLength(1);
    expect(visible.filter((row) => row.role === 'ai').map((row) => row.text)).toEqual(['Error: AI unavailable']);
  });

  it('reconciles a completed legacy turn by timestamp and content', () => {
    let state = startTurn({}, 'chat-a', 'request-a');
    state = dashboardChatReducer(state, {
      type: 'token-received',
      chatId: 'chat-a',
      requestId: 'request-a',
      token: 'legacy-answer',
    });
    state = dashboardChatReducer(state, {
      type: 'turn-completed',
      chatId: 'chat-a',
      requestId: 'request-a',
    });
    state = dashboardChatReducer(state, { type: 'load-started', chatId: 'chat-a', version: 1 });
    state = dashboardChatReducer(state, {
      type: 'load-succeeded',
      chatId: 'chat-a',
      version: 1,
      rows: [
        { ...message('legacy-user', 'user', null, 1), text: 'question-chat-a' },
        { ...message('legacy-assistant', 'ai', null, 2), text: 'legacy-answer' },
      ],
    });

    expect(state['chat-a'].pending).toHaveLength(0);
    expect(selectChatMessages(state, 'chat-a').map((row) => row.id)).toEqual(['legacy-user', 'legacy-assistant']);
  });

  it('ignores a stale canonical load completion', () => {
    let state = dashboardChatReducer({}, { type: 'load-started', chatId: 'chat-a', version: 1 });
    state = dashboardChatReducer(state, { type: 'load-started', chatId: 'chat-a', version: 2 });
    state = dashboardChatReducer(state, {
      type: 'load-succeeded',
      chatId: 'chat-a',
      version: 1,
      rows: [message('stale', 'user', 'request-a', 1)],
    });

    expect(selectChatMessages(state, 'chat-a')).toEqual([]);
    expect(state['chat-a'].loadStatus).toBe('loading');
  });

  it('maps grounding metadata into view citations for assistant messages', () => {
    let state = dashboardChatReducer({}, { type: 'load-started', chatId: 'chat-a', version: 1 });
    state = dashboardChatReducer(state, {
      type: 'load-succeeded',
      chatId: 'chat-a',
      version: 1,
      rows: [
        message('ai-1', 'ai', 'request-a', 1, {
          used_file_search: true,
          grounding_metadata: {
            groundingChunks: [{ retrievedContext: { title: 'Evidence', text: 'Cite sources' } }],
          },
        }),
      ],
    });

    const [viewMessage] = selectChatMessages(state, 'chat-a');
    expect(viewMessage.usedFileSearch).toBe(true);
    expect(viewMessage.citations).toEqual([
      {
        title: 'Evidence',
        uri: null,
        snippet: 'Cite sources',
        sourceIndex: 0,
      },
    ]);
  });
});
