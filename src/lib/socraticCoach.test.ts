import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'opaque-test-token' } },
      })),
    },
  },
}));

import { sendCoachingMessage } from './socraticCoach';

const CHAT_ID = '123e4567-e89b-42d3-a456-426614174000';
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174001';

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    },
  );
}

describe('sendCoachingMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('parses fragmented legacy tokens and a canonical commit before DONE', async () => {
    const commit = {
      type: 'commit',
      chatId: CHAT_ID,
      requestId: REQUEST_ID,
      userMessageId: 'user-message',
      assistantMessageId: 'assistant-message',
      userSequence: 10,
      assistantSequence: 11,
    } as const;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamResponse(['data: {"te', 'xt":"Hello"}\n\n', `data: ${JSON.stringify(commit)}\n\n`, 'data: [DONE]\n\n']),
      ),
    );
    const tokens: string[] = [];

    const result = await sendCoachingMessage(
      CHAT_ID,
      'Question',
      { requestId: REQUEST_ID, originSurface: 'dashboard' },
      { onTokenReceived: (token) => tokens.push(token) },
    );

    expect(tokens).toEqual(['Hello']);
    expect(result.commit).toEqual(commit);
    const request = vi.mocked(fetch).mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      chatId: CHAT_ID,
      requestId: REQUEST_ID,
      originSurface: 'dashboard',
      userMessage: 'Question',
    });
  });

  it('surfaces an SSE error instead of reporting completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamResponse(['data: {"type":"error","error":"request is already in progress"}\n\n', 'data: [DONE]\n\n']),
      ),
    );

    await expect(
      sendCoachingMessage(
        CHAT_ID,
        'Question',
        { requestId: REQUEST_ID, originSurface: 'dashboard' },
        { onTokenReceived: () => undefined },
      ),
    ).rejects.toThrow('request is already in progress');
  });

  it('rejects a stream that closes without DONE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamResponse(['data: {"text":"partial"}\n\n'])),
    );

    await expect(
      sendCoachingMessage(
        CHAT_ID,
        'Question',
        { requestId: REQUEST_ID, originSurface: 'dashboard' },
        { onTokenReceived: () => undefined },
      ),
    ).rejects.toThrow('ended before completion');
  });
});
