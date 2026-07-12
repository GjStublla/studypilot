import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiUsage, DashboardChat } from '../lib/studypilot-types';
import type { SocraticCoachCallbacks } from '../lib/socraticCoach';

vi.mock('../lib/socraticCoach', () => ({
  sendCoachingMessage: vi.fn(),
}));

vi.mock('../lib/studypilot-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/studypilot-api')>('../lib/studypilot-api');
  return {
    ...actual,
    getDashboardChatMessages: vi.fn(async () => []),
    getAiUsage: vi.fn(async () => ({ used: 0, limit: 50 })),
  };
});

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

vi.mock('../lib/api', () => ({
  clearAuth: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock('../lib/useRealtime', () => ({
  useStudyPilotRealtime: vi.fn(),
}));

vi.mock('./Dashboard.css', () => ({}));

import { sendCoachingMessage } from '../lib/socraticCoach';
import { ChatView } from './Dashboard';

const sendCoachingMessageMock = vi.mocked(sendCoachingMessage);

type StreamHandle = {
  chatId: string;
  callbacks: SocraticCoachCallbacks;
  resolve: () => void;
};

function makeChat(id: string, title = `Chat ${id}`): DashboardChat {
  return {
    id,
    user_id: 'user-1',
    title,
    session_id: null,
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
  };
}

function Harness({
  initialChats,
  initialActiveChatId,
  aiUsage = { used: 0, limit: 50 },
  onAiRequestSettled = vi.fn(),
  onCreateChat,
}: {
  initialChats: DashboardChat[];
  initialActiveChatId: string | null;
  aiUsage?: AiUsage | null;
  onAiRequestSettled?: () => void;
  onCreateChat?: (title: string, sessionId?: string | null) => Promise<DashboardChat>;
}) {
  const [chats, setChats] = useState(initialChats);
  const [activeChatId, setActiveChatId] = useState(initialActiveChatId);

  return (
    <ChatView
      student={{ name: 'Ada', initials: 'A', email: 'ada@example.com' }}
      activeRubric={undefined}
      session={undefined}
      chats={chats}
      activeChatId={activeChatId}
      aiUsage={aiUsage}
      onOpenSession={() => undefined}
      onSelectChat={setActiveChatId}
      onStartNewChat={() => setActiveChatId(null)}
      onCreateChat={async (title, sessionId) => {
        if (onCreateChat) return onCreateChat(title, sessionId);
        const chat = makeChat(`created-${chats.length + 1}`, title);
        setChats((current) => [chat, ...current]);
        setActiveChatId(chat.id);
        return chat;
      }}
      onRenameChat={() => undefined}
      onDeleteChat={() => undefined}
      onChatActivity={() => undefined}
      onAiRequestSettled={onAiRequestSettled}
    />
  );
}

describe('ChatView multi-chat AI request tracking', () => {
  let streams: StreamHandle[];

  beforeEach(() => {
    streams = [];
    sendCoachingMessageMock.mockReset();
    sendCoachingMessageMock.mockImplementation((chatId, _text, callbacks) => {
      return new Promise<void>((resolve) => {
        streams.push({
          chatId,
          callbacks,
          resolve: () => {
            callbacks.onStreamComplete();
            resolve();
          },
        });
      });
    });
  });

  it('blocks rapid double submission in one chat to a single request', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Harness
        initialChats={[makeChat('chat-a')]}
        initialActiveChatId="chat-a"
      />,
    );

    const input = screen.getByPlaceholderText(/Ask about your rubric/i);
    await user.type(input, 'First question');
    await user.click(screen.getByLabelText('Send'));
    await user.click(screen.getByLabelText('Send'));

    await waitFor(() => expect(sendCoachingMessageMock).toHaveBeenCalledTimes(1));
    expect(container.querySelector('form.ds-composer')).toHaveAttribute('aria-busy', 'true');
  });

  it('creates only one chat for a draft double submission', async () => {
    const user = userEvent.setup();
    let createCalls = 0;
    const onCreateChat = vi.fn(async (title: string) => {
      createCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return makeChat('draft-1', title);
    });

    render(
      <Harness
        initialChats={[]}
        initialActiveChatId={null}
        onCreateChat={onCreateChat}
      />,
    );

    const input = screen.getByPlaceholderText(/Ask about your rubric/i);
    await user.type(input, 'Draft hello');
    const sendButton = screen.getByLabelText('Send');
    await Promise.all([user.click(sendButton), user.click(sendButton)]);

    await waitFor(() => expect(createCalls).toBe(1));
    await waitFor(() => expect(sendCoachingMessageMock).toHaveBeenCalledTimes(1));
    expect(onCreateChat).toHaveBeenCalledTimes(1);
  });

  it('keeps chat A locked when revisited while its stream is active, and allows chat B', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Harness
        initialChats={[makeChat('chat-a'), makeChat('chat-b')]}
        initialActiveChatId="chat-a"
      />,
    );

    await user.type(screen.getByPlaceholderText(/Ask about your rubric/i), 'From A');
    await user.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(sendCoachingMessageMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText('Chat chat-b'));
    await waitFor(() =>
      expect(container.querySelector('form.ds-composer')).toHaveAttribute('aria-busy', 'false'),
    );

    await user.type(screen.getByPlaceholderText(/Ask about your rubric/i), 'From B');
    await user.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(sendCoachingMessageMock).toHaveBeenCalledTimes(2));

    await user.click(screen.getByText('Chat chat-a'));
    await waitFor(() =>
      expect(container.querySelector('form.ds-composer')).toHaveAttribute('aria-busy', 'true'),
    );
    expect(screen.getByLabelText('Send')).toBeDisabled();
  });

  it('isolates thinking indicators and settles usage once per request', async () => {
    const user = userEvent.setup();
    const onAiRequestSettled = vi.fn();

    render(
      <Harness
        initialChats={[makeChat('chat-a'), makeChat('chat-b')]}
        initialActiveChatId="chat-a"
        onAiRequestSettled={onAiRequestSettled}
      />,
    );

    await user.type(screen.getByPlaceholderText(/Ask about your rubric/i), 'A asks');
    await user.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(streams).toHaveLength(1));
    expect(screen.getByLabelText('StudyPilot is thinking')).toBeInTheDocument();

    await user.click(screen.getByText('Chat chat-b'));
    await user.type(screen.getByPlaceholderText(/Ask about your rubric/i), 'B asks');
    await user.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(streams).toHaveLength(2));
    expect(screen.getByLabelText('StudyPilot is thinking')).toBeInTheDocument();

    await act(async () => {
      streams[0].callbacks.onTokenReceived('hello-a');
    });
    expect(screen.queryByText('hello-a')).not.toBeInTheDocument();

    await act(async () => {
      streams[1].callbacks.onTokenReceived('hello-b');
    });
    expect(screen.getByText('hello-b')).toBeInTheDocument();

    await act(async () => {
      streams[0].resolve();
      streams[1].resolve();
    });

    await waitFor(() => expect(onAiRequestSettled).toHaveBeenCalledTimes(2));
  });

  it('shows quota exhaustion copy and disables send', async () => {
    render(
      <Harness
        initialChats={[makeChat('chat-a')]}
        initialActiveChatId="chat-a"
        aiUsage={{ used: 50, limit: 50 }}
      />,
    );

    expect(screen.getByText(/Daily AI limit reached \(50 of 50\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Send')).toBeDisabled();
  });

  it('shows remaining-request copy when five or fewer remain', () => {
    render(
      <Harness
        initialChats={[makeChat('chat-a')]}
        initialActiveChatId="chat-a"
        aiUsage={{ used: 46, limit: 50 }}
      />,
    );

    expect(screen.getByText('4 AI requests left today.')).toBeInTheDocument();
  });

  it('renders 429 and 503 stream errors in the active chat and settles once', async () => {
    const user = userEvent.setup();
    const onAiRequestSettled = vi.fn();

    sendCoachingMessageMock.mockImplementation(async (_chatId, _text, callbacks) => {
      callbacks.onStreamError(
        new Error('Daily AI limit reached (50 of 50 used). Your limit resets at midnight UTC.'),
      );
    });

    const { unmount } = render(
      <Harness
        initialChats={[makeChat('chat-a')]}
        initialActiveChatId="chat-a"
        onAiRequestSettled={onAiRequestSettled}
      />,
    );

    await user.type(screen.getByPlaceholderText(/Ask about your rubric/i), 'Hit limit');
    await user.click(screen.getByLabelText('Send'));
    await waitFor(() =>
      expect(screen.getByText(/Error: Daily AI limit reached/i)).toBeInTheDocument(),
    );
    await waitFor(() => expect(onAiRequestSettled).toHaveBeenCalledTimes(1));
    unmount();

    sendCoachingMessageMock.mockImplementation(async (_chatId, _text, callbacks) => {
      callbacks.onStreamError(
        new Error('AI usage tracking is temporarily unavailable. Please try again in a moment.'),
      );
    });

    render(
      <Harness
        initialChats={[makeChat('chat-a')]}
        initialActiveChatId="chat-a"
        onAiRequestSettled={onAiRequestSettled}
      />,
    );

    await user.type(screen.getByPlaceholderText(/Ask about your rubric/i), 'Hit outage');
    await user.click(screen.getByLabelText('Send'));
    await waitFor(() =>
      expect(screen.getByText(/Error: AI usage tracking is temporarily unavailable/i)).toBeInTheDocument(),
    );
    await waitFor(() => expect(onAiRequestSettled).toHaveBeenCalledTimes(2));
  });
});
