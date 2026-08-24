import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Registration = {
  config: { table: string; event: string };
  callback: (payload: unknown) => void;
};

type MockChannel = {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => {
  const registrations: Registration[] = [];
  let statusCallback: ((status: string) => void) | null = null;
  const channel = {} as MockChannel;
  channel.on = vi.fn((_kind: string, config: Registration['config'], callback: Registration['callback']) => {
    registrations.push({ config, callback });
    return channel;
  });
  channel.subscribe = vi.fn((callback: (status: string) => void) => {
    statusCallback = callback;
    return channel;
  });
  return {
    registrations,
    channel,
    getStatusCallback: () => statusCallback,
    resetStatusCallback: () => {
      statusCallback = null;
    },
    setAuth: vi.fn(async () => undefined),
    removeChannel: vi.fn(async () => undefined),
    getSession: vi.fn(async () => ({
      data: { session: { access_token: 'realtime-token' } },
    })),
    injectStoredToken: vi.fn(async () => true),
  };
});

vi.mock('./supabaseClient', () => ({
  injectStoredToken: mocks.injectStoredToken,
  supabase: {
    auth: { getSession: mocks.getSession },
    realtime: { setAuth: mocks.setAuth },
    channel: vi.fn(() => mocks.channel),
    removeChannel: mocks.removeChannel,
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: null, error: null })),
    })),
  },
}));

import { useStudyPilotRealtime } from './useRealtime';

describe('useStudyPilotRealtime', () => {
  beforeEach(() => {
    mocks.registrations.length = 0;
    mocks.resetStatusCallback();
    vi.clearAllMocks();
  });

  it('sets Realtime auth before subscribing', async () => {
    renderHook(() => useStudyPilotRealtime('user-1', {}));
    await waitFor(() => expect(mocks.channel.subscribe).toHaveBeenCalledOnce());

    expect(mocks.injectStoredToken).toHaveBeenCalledOnce();
    expect(mocks.setAuth).toHaveBeenCalledWith('realtime-token');
    expect(mocks.setAuth.mock.invocationCallOrder[0]).toBeLessThan(mocks.channel.subscribe.mock.invocationCallOrder[0]);
  });

  it('registers chat, message, session, and transcript invalidations', async () => {
    renderHook(() => useStudyPilotRealtime('user-1', {}));
    await waitFor(() => expect(mocks.channel.subscribe).toHaveBeenCalledOnce());

    expect(mocks.registrations.map(({ config }) => `${config.table}:${config.event}`)).toEqual(
      expect.arrayContaining([
        'sessions:INSERT',
        'sessions:UPDATE',
        'session_messages:INSERT',
        'dashboard_chats:INSERT',
        'dashboard_chats:UPDATE',
        'dashboard_chat_messages:INSERT',
      ]),
    );
  });

  it('uses the latest callbacks and cleans up the channel', async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const subscribed = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ onChanged }) =>
        useStudyPilotRealtime('user-1', {
          onDashboardChatMessageChanged: onChanged,
          onSubscribed: subscribed,
        }),
      { initialProps: { onChanged: first } },
    );
    await waitFor(() => expect(mocks.channel.subscribe).toHaveBeenCalledOnce());
    rerender({ onChanged: latest });

    const messageRegistration = mocks.registrations.find(({ config }) => config.table === 'dashboard_chat_messages');
    act(() => {
      messageRegistration?.callback({ new: { chat_id: 'chat-a' } });
      mocks.getStatusCallback()?.('SUBSCRIBED');
    });

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith({ new: { chat_id: 'chat-a' } });
    expect(subscribed).toHaveBeenCalledOnce();
    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks.channel);
  });
});
