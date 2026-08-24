import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionItem, Rubric, Session, TranscriptLine } from '../lib/dashboard-types';
import type { DashboardChat, DashboardChatMessage } from '../lib/studypilot-types';

const mocks = vi.hoisted(() => ({
  fetchSessions: vi.fn(async (): Promise<Session[]> => []),
  fetchRubrics: vi.fn(async (): Promise<Rubric[]> => []),
  fetchActionItems: vi.fn(async (): Promise<ActionItem[]> => []),
  fetchSessionTranscript: vi.fn(async (): Promise<TranscriptLine[]> => []),
  setActionItemDone: vi.fn(),
  activateRubric: vi.fn(async () => undefined),
  getDashboardChats: vi.fn(async (): Promise<DashboardChat[]> => []),
  getDashboardChatMessages: vi.fn(async (): Promise<DashboardChatMessage[]> => []),
  getAiUsage: vi.fn(async () => ({ used: 0, limit: 50 })),
  getOrCreateRubricChat: vi.fn(),
  getOrCreateSessionChat: vi.fn(),
  retryRubricIndexing: vi.fn(),
  sendCoachingMessage: vi.fn(),
}));

vi.mock('../lib/dashboardApi', () => ({
  fetchSessions: mocks.fetchSessions,
  fetchRubrics: mocks.fetchRubrics,
  fetchActionItems: mocks.fetchActionItems,
  fetchSessionTranscript: mocks.fetchSessionTranscript,
  setActionItemDone: mocks.setActionItemDone,
  activateRubric: mocks.activateRubric,
}));
vi.mock('../lib/studypilot-api', () => ({
  getDashboardChats: mocks.getDashboardChats,
  getDashboardChatMessages: mocks.getDashboardChatMessages,
  getAiUsage: mocks.getAiUsage,
  createSessionCaptureSignedUrl: vi.fn(),
  createDashboardChat: vi.fn(),
  getOrCreateSessionChat: mocks.getOrCreateSessionChat,
  getOrCreateRubricChat: mocks.getOrCreateRubricChat,
  retryRubricIndexing: mocks.retryRubricIndexing,
  updateDashboardChat: vi.fn(),
  deleteDashboardChat: vi.fn(),
  uploadRubricFile: vi.fn(),
}));
vi.mock('../lib/socraticCoach', () => ({ sendCoachingMessage: mocks.sendCoachingMessage }));
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn().mockReturnThis(),
    })),
  },
}));
vi.mock('../lib/api', () => ({
  clearAuth: vi.fn(),
  apiFetch: vi.fn(async () => ({ ok: false })),
}));
vi.mock('../lib/useRealtime', () => ({ useStudyPilotRealtime: vi.fn() }));
vi.mock('./Dashboard.css', () => ({}));

import Dashboard from './Dashboard';

const RUBRIC_ID = 'rubric-aaaa-bbbb-cccc-ddddeeee0001';
const CHAT_ID = '123e4567-e89b-42d3-a456-426614174099';

function makeRubric(overrides: Partial<Rubric> = {}): Rubric {
  return {
    id: RUBRIC_ID,
    title: 'Argument Rubric',
    course: 'ENG 101',
    uploaded: 'Aug 6',
    active: true,
    sessionsCount: 1,
    knowledgeDocumentId: 'kd-1',
    fileSearchStatus: 'indexed',
    file_search_status: 'indexed',
    criteria: [{ id: 'c1', name: 'Thesis', score: 0, max: 4 }],
    ...overrides,
  };
}

function makeChat(overrides: Partial<DashboardChat> = {}): DashboardChat {
  return {
    id: CHAT_ID,
    user_id: 'user-1',
    session_id: null,
    rubric_id: RUBRIC_ID,
    rubric_context_locked: true,
    title: 'Argument chat',
    origin_surface: 'dashboard',
    client_key: null,
    created_at: '2026-08-04T10:00:00.000Z',
    updated_at: '2026-08-04T10:00:00.000Z',
    ...overrides,
  };
}

function makeAssistantMessage(): DashboardChatMessage {
  return {
    id: 'msg-ai-1',
    user_id: 'user-1',
    chat_id: CHAT_ID,
    session_id: null,
    role: 'ai',
    text: 'Strengthen the thesis with a clearer claim.',
    origin_surface: 'dashboard',
    request_id: 'req-1',
    server_sequence: 2,
    used_file_search: true,
    grounding_metadata: {
      groundingChunks: [
        {
          retrievedContext: {
            title: 'Thesis clarity',
            text: 'A strong thesis states a debatable claim.',
          },
        },
      ],
    },
    created_at: '2026-08-04T10:01:00.000Z',
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    title: 'Thesis rehearsal',
    source: 'Chrome Extension',
    mode: 'Essay Coach',
    duration: '3m',
    when: 'Today · 10:00 AM',
    rubricId: null,
    chatId: null,
    screenshotPath: null,
    summary: 'Practice session',
    ...overrides,
  };
}

describe('Dashboard rubric RAG behaviors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('sp_user_id', 'user-1');
    mocks.fetchSessions.mockResolvedValue([]);
    mocks.fetchActionItems.mockResolvedValue([]);
    mocks.getAiUsage.mockResolvedValue({ used: 0, limit: 50 });
    mocks.fetchRubrics.mockResolvedValue([makeRubric()]);
    mocks.getDashboardChats.mockResolvedValue([makeChat()]);
    mocks.getDashboardChatMessages.mockResolvedValue([makeAssistantMessage()]);
    mocks.getOrCreateRubricChat.mockResolvedValue(makeChat({ id: CHAT_ID, title: 'Rubric chat' }));
    mocks.activateRubric.mockResolvedValue(undefined);
    mocks.retryRubricIndexing.mockResolvedValue({
      knowledgeDocumentId: 'kd-1',
      status: 'indexed',
      fileSearchStoreName: 'stores/1',
      fileSearchDocumentName: 'docs/1',
    });
  });

  it('calls activateRubric when Set active is clicked', async () => {
    const user = userEvent.setup();
    mocks.fetchRubrics.mockResolvedValue([
      makeRubric({ active: false }),
      makeRubric({
        id: 'rubric-other',
        title: 'Other Rubric',
        active: true,
        file_search_status: 'indexed',
        fileSearchStatus: 'indexed',
      }),
    ]);

    render(<Dashboard />);
    await user.click(await screen.findByRole('button', { name: /Rubrics/i }));

    const setActive = await screen.findByRole('button', { name: 'Set active' });
    await user.click(setActive);

    await waitFor(() => {
      expect(mocks.activateRubric).toHaveBeenCalledWith(RUBRIC_ID);
    });
  });

  it('opens getOrCreateRubricChat without activating when Ask about rubric is clicked', async () => {
    const user = userEvent.setup();
    render(<Dashboard />);
    await user.click(await screen.findByRole('button', { name: /Rubrics/i }));

    const ask = await screen.findByRole('button', { name: 'Ask about rubric' });
    await user.click(ask);

    await waitFor(() => {
      expect(mocks.getOrCreateRubricChat).toHaveBeenCalledWith(RUBRIC_ID);
    });
    expect(mocks.activateRubric).not.toHaveBeenCalled();
    expect(await screen.findByPlaceholderText(/Ask about your rubric/i)).toBeInTheDocument();
    expect(screen.getByTestId('chat-rubric-chip')).toHaveTextContent('Argument');
  });

  it('renders citations from assistant grounding metadata', async () => {
    render(<Dashboard routeHash={`#dashboard?chat=${CHAT_ID}`} />);

    expect(await screen.findByText('Strengthen the thesis with a clearer claim.')).toBeInTheDocument();
    expect(screen.getByLabelText('Sources')).toBeInTheDocument();
    expect(screen.getByText('Thesis clarity')).toBeInTheDocument();
    expect(screen.getByText(/A strong thesis states a debatable claim/i)).toBeInTheDocument();
    expect(screen.getByText('Grounded')).toBeInTheDocument();
  });

  it('shows indexing state and retries a failed index', async () => {
    const user = userEvent.setup();
    mocks.fetchRubrics.mockResolvedValue([
      makeRubric({
        file_search_status: 'failed',
        fileSearchStatus: 'failed',
        fileSearchError: 'timeout',
      }),
    ]);
    mocks.getDashboardChats.mockResolvedValue([makeChat()]);
    mocks.retryRubricIndexing.mockResolvedValue({
      knowledgeDocumentId: 'kd-1',
      status: 'indexed',
      fileSearchStoreName: 'stores/1',
      fileSearchDocumentName: 'docs/1',
    });

    render(<Dashboard routeHash={`#dashboard?chat=${CHAT_ID}`} />);

    const status = await screen.findByTestId('file-search-status');
    expect(status).toHaveTextContent(/Index failed/i);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(mocks.retryRubricIndexing).toHaveBeenCalledWith('kd-1');
    });
  });

  it('hides duplicate retry controls while indexing is in flight', async () => {
    const user = userEvent.setup();
    let resolveRetry!: (value: {
      knowledgeDocumentId: string;
      status: string;
      fileSearchStoreName: string;
      fileSearchDocumentName: string;
    }) => void;
    mocks.fetchRubrics.mockResolvedValue([
      makeRubric({
        file_search_status: 'failed',
        fileSearchStatus: 'failed',
        fileSearchError: 'timeout',
      }),
    ]);
    mocks.retryRubricIndexing.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRetry = resolve;
        }),
    );

    render(<Dashboard routeHash={`#dashboard?chat=${CHAT_ID}`} />);
    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Indexing…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

    resolveRetry({
      knowledgeDocumentId: 'kd-1',
      status: 'indexed',
      fileSearchStoreName: 'stores/1',
      fileSearchDocumentName: 'docs/1',
    });
    await waitFor(() => expect(screen.getByText('Indexed')).toBeInTheDocument());
  });

  it('shows Indexing… for in-progress status instead of treating it as failed', async () => {
    mocks.fetchRubrics.mockResolvedValue([
      makeRubric({
        file_search_status: 'indexing',
        fileSearchStatus: 'indexing',
      }),
    ]);
    mocks.getDashboardChats.mockResolvedValue([makeChat()]);

    render(<Dashboard routeHash={`#dashboard?chat=${CHAT_ID}`} />);

    const status = await screen.findByTestId('file-search-status');
    expect(status).toHaveTextContent(/Indexing/i);
    expect(status).not.toHaveTextContent(/failed/i);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows rubric removed for locked-null chats and does not claim the active rubric', async () => {
    mocks.fetchRubrics.mockResolvedValue([
      makeRubric({
        id: 'rubric-other-active',
        title: 'Other Active Rubric',
        active: true,
      }),
    ]);
    mocks.getDashboardChats.mockResolvedValue([
      makeChat({
        rubric_id: null,
        rubric_context_locked: true,
        title: 'Orphan locked chat',
      }),
    ]);
    mocks.getDashboardChatMessages.mockResolvedValue([]);

    render(<Dashboard routeHash={`#dashboard?chat=${CHAT_ID}`} />);

    const chip = await screen.findByTestId('chat-rubric-chip');
    expect(chip).toHaveTextContent(/Rubric removed/i);
    expect(chip).toHaveTextContent(/locked/i);
    expect(chip).not.toHaveTextContent(/Other Active/i);
  });

  it('keeps criteria names out of quick prompts', async () => {
    mocks.fetchRubrics.mockResolvedValue([
      makeRubric({
        criteria: [
          { id: 'c1', name: 'Thesis Clarity', score: 0, max: 4 },
          { id: 'c2', name: 'Evidence Quality', score: 0, max: 4 },
        ],
      }),
    ]);

    render(<Dashboard routeHash={`#dashboard?chat=${CHAT_ID}`} />);

    const prompts = await screen.findByRole('group', { name: 'Quick prompts' });
    expect(prompts).toHaveTextContent(/What should I revise first/i);
    expect(prompts).not.toHaveTextContent(/Thesis Clarity/i);
    expect(prompts).not.toHaveTextContent(/Evidence Quality/i);
  });

  it('shows a transcript error and retries only the selected session request', async () => {
    const user = userEvent.setup();
    mocks.fetchSessions.mockResolvedValue([makeSession()]);
    mocks.fetchSessionTranscript
      .mockRejectedValueOnce(new Error('Transcript service unavailable'))
      .mockResolvedValueOnce([{ id: 'line-1', who: 'You', text: 'Clarify the thesis', t: '0:01' }]);

    render(<Dashboard />);
    await user.click(await screen.findByRole('button', { name: /Sessions/i }));
    await user.click(await screen.findByRole('button', { name: 'View transcript' }));

    expect(await screen.findByText('Transcript unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Transcript service unavailable')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Clarify the thesis')).toBeInTheDocument();
    expect(mocks.fetchSessionTranscript).toHaveBeenCalledTimes(2);
  });

  it('continues a session via sessions.chatId when present', async () => {
    const user = userEvent.setup();
    const sessionChat = makeChat({ id: CHAT_ID, session_id: 'session-1', title: 'Session chat' });
    mocks.fetchSessions.mockResolvedValue([
      {
        id: 'session-1',
        title: 'Midterm draft',
        source: 'Chrome Extension',
        mode: 'Essay Coach',
        duration: '12m',
        when: 'Today · 1:00 PM',
        rubricId: RUBRIC_ID,
        chatId: CHAT_ID,
        summary: 'Worked on thesis',
      },
    ]);
    mocks.getDashboardChats.mockResolvedValue([sessionChat]);
    mocks.getDashboardChatMessages.mockResolvedValue([]);

    render(<Dashboard />);
    await user.click(await screen.findByRole('button', { name: /Sessions/i }));

    const continueBtn = await screen.findByRole('button', { name: /Continue in chat/i });
    await user.click(continueBtn);

    expect(mocks.getOrCreateSessionChat).not.toHaveBeenCalled();
    expect(await screen.findByPlaceholderText(/Ask about your rubric/i)).toBeInTheDocument();
    expect(screen.getByText('Session chat')).toBeInTheDocument();
  });
});
