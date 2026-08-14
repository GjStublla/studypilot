import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatViewMessage } from '../lib/dashboard-chat-state';
import type { AiUsage, DashboardChat } from '../lib/studypilot-types';

vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
  injectStoredToken: vi.fn(async () => true),
}));
vi.mock('../lib/api', () => ({ clearAuth: vi.fn(), apiFetch: vi.fn() }));
vi.mock('../lib/useRealtime', () => ({ useStudyPilotRealtime: vi.fn() }));
vi.mock('./Dashboard.css', () => ({}));

import { ChatView } from './Dashboard';

function makeChat(id: string, origin: DashboardChat['origin_surface'] = 'dashboard'): DashboardChat {
  return {
    id,
    user_id: 'user-1',
    title: `Chat ${id}`,
    session_id: null,
    origin_surface: origin,
    client_key: null,
    created_at: '2026-08-04T10:00:00.000Z',
    updated_at: '2026-08-04T10:00:00.000Z',
  };
}

function makeMessage(status: ChatViewMessage['status'] = 'persisted'): ChatViewMessage {
  return {
    id: 'message-1',
    requestId: 'request-1',
    role: 'ai',
    text: status === 'thinking' ? '' : 'A useful answer',
    lines: status === 'thinking' ? [''] : ['A useful answer'],
    time: '10:00 AM',
    originSurface: 'dashboard',
    status,
  };
}

function Harness({
  aiUsage = { used: 0, limit: 50 },
  message = makeMessage(),
  busy = false,
  onSendMessage = vi.fn(() => true),
}: {
  aiUsage?: AiUsage | null;
  message?: ChatViewMessage;
  busy?: boolean;
  onSendMessage?: (text: string) => boolean;
}) {
  const chats = [makeChat('chat-a', 'extension'), makeChat('chat-b')];
  const [activeChatId, setActiveChatId] = useState<string | null>('chat-a');
  return (
    <ChatView
      student={{ name: 'Ada', initials: 'A', email: 'ada@example.com' }}
      activeRubric={undefined}
      session={undefined}
      chats={chats}
      rubricsById={new Map()}
      activeChatId={activeChatId}
      messages={[message]}
      historyLoading={false}
      activeChatBusy={busy}
      draftCreating={false}
      aiUsage={aiUsage}
      onOpenSession={() => undefined}
      onSelectChat={setActiveChatId}
      onStartNewChat={() => setActiveChatId(null)}
      onRenameChat={() => undefined}
      onDeleteChat={() => undefined}
      onSendMessage={onSendMessage}
    />
  );
}

describe('ChatView', () => {
  it('submits accepted text once and clears the composer', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn(() => true);
    render(<Harness onSendMessage={onSendMessage} />);

    const input = screen.getByPlaceholderText(/Ask about your rubric/i);
    await user.type(input, 'How should I revise?');
    await user.click(screen.getByLabelText('Send'));

    expect(onSendMessage).toHaveBeenCalledWith('How should I revise?', null);
    expect(input).toHaveValue('');
  });

  it('keeps unsent drafts isolated when switching between existing chats', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText(/Ask about your rubric/i);
    await user.type(input, 'Draft for Alpha');
    await user.click(screen.getByText('Chat chat-b').closest('[role="button"]')!);

    expect(input).toHaveValue('');

    await user.type(input, 'Draft for Beta');
    await user.click(screen.getByText('Chat chat-a').closest('[role="button"]')!);
    expect(input).toHaveValue('Draft for Alpha');

    await user.click(screen.getByText('Chat chat-b').closest('[role="button"]')!);
    expect(input).toHaveValue('Draft for Beta');
  });

  it('keeps the new-chat draft separate from existing chat drafts', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByPlaceholderText(/Ask about your rubric/i);
    await user.type(input, 'Existing chat draft');
    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(input).toHaveValue('');

    await user.type(input, 'Fresh chat draft');
    await user.click(screen.getByText('Chat chat-a').closest('[role="button"]')!);
    expect(input).toHaveValue('Existing chat draft');

    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(input).toHaveValue('Fresh chat draft');
  });

  it('clears only the active chat draft after an accepted send', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn(() => true);
    render(<Harness onSendMessage={onSendMessage} />);

    const input = screen.getByPlaceholderText(/Ask about your rubric/i);
    await user.type(input, 'Draft for Alpha');
    await user.click(screen.getByText('Chat chat-b').closest('[role="button"]')!);
    await user.type(input, 'Question for Beta');
    await user.click(screen.getByLabelText('Send'));

    expect(onSendMessage).toHaveBeenCalledWith('Question for Beta', null);
    expect(input).toHaveValue('');

    await user.click(screen.getByText('Chat chat-a').closest('[role="button"]')!);
    expect(input).toHaveValue('Draft for Alpha');
  });

  it('shows the thinking indicator supplied by per-chat root state', () => {
    render(<Harness message={makeMessage('thinking')} busy />);
    expect(screen.getByLabelText('StudyPilot is thinking')).toBeInTheDocument();
    expect(screen.getByLabelText('Send')).toBeDisabled();
  });

  it('shows quota exhaustion and disables send', () => {
    render(<Harness aiUsage={{ used: 50, limit: 50 }} />);
    expect(screen.getByText(/Daily AI limit reached \(50 of 50\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Send')).toBeDisabled();
  });

  it('labels an extension-originated chat accurately', () => {
    render(<Harness />);
    expect(screen.getByText('Started in Chrome extension')).toBeInTheDocument();
  });
});
