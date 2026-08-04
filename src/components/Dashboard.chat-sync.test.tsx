import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocraticCoachCallbacks, SocraticCoachOptions } from '../lib/socraticCoach';
import type { DashboardChat, SocraticCoachCommit } from '../lib/studypilot-types';

const mocks = vi.hoisted(() => ({
  fetchSessions: vi.fn(async () => []),
  fetchRubrics: vi.fn(async () => []),
  fetchActionItems: vi.fn(async () => []),
  getDashboardChats: vi.fn(),
  getDashboardChatMessages: vi.fn(async () => []),
  getAiUsage: vi.fn(async () => ({ used: 0, limit: 50 })),
  sendCoachingMessage: vi.fn(),
}));

vi.mock('../lib/studypilot-api', () => ({
  ...mocks,
  fetchSessionTranscript: vi.fn(async () => []),
  createSessionCaptureSignedUrl: vi.fn(),
  setActionItemDone: vi.fn(),
  createDashboardChat: vi.fn(),
  getOrCreateSessionChat: vi.fn(),
  updateDashboardChat: vi.fn(),
  deleteDashboardChat: vi.fn(),
}));
vi.mock('../lib/socraticCoach', () => ({ sendCoachingMessage: mocks.sendCoachingMessage }));
vi.mock('../lib/supabaseClient', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { user: { id: 'user-1' } } } })) } },
}));
vi.mock('../lib/api', () => ({
  clearAuth: vi.fn(),
  apiFetch: vi.fn(async () => ({ ok: false })),
}));
vi.mock('../lib/useRealtime', () => ({ useStudyPilotRealtime: vi.fn() }));
vi.mock('./Dashboard.css', () => ({}));

import Dashboard from './Dashboard';

type StreamHandle = {
  chatId: string;
  options: SocraticCoachOptions;
  callbacks: SocraticCoachCallbacks;
  commit: () => void;
  fail: (error: Error) => void;
};

const CHAT_A = '123e4567-e89b-42d3-a456-426614174010';
const CHAT_B = '123e4567-e89b-42d3-a456-426614174011';

function chat(id: string, title: string): DashboardChat {
  return {
    id,
    user_id: 'user-1',
    session_id: null,
    title,
    origin_surface: 'dashboard',
    client_key: null,
    created_at: '2026-08-04T10:00:00.000Z',
    updated_at: '2026-08-04T10:00:00.000Z',
  };
}

describe('Dashboard cross-surface chat state', () => {
  let streams: StreamHandle[];

  beforeEach(() => {
    streams = [];
    vi.clearAllMocks();
    localStorage.setItem('sp_user_id', 'user-1');
    mocks.getDashboardChats.mockResolvedValue([chat(CHAT_B, 'Beta'), chat(CHAT_A, 'Alpha')]);
    mocks.getDashboardChatMessages.mockResolvedValue([]);
    mocks.getAiUsage.mockResolvedValue({ used: 0, limit: 50 });
    mocks.sendCoachingMessage.mockImplementation(
      (chatId: string, _text: string, options: SocraticCoachOptions, callbacks: SocraticCoachCallbacks) => (
        new Promise<{ commit: SocraticCoachCommit }>((resolve, reject) => {
          const commit: SocraticCoachCommit = {
            type: 'commit',
            chatId,
            requestId: options.requestId,
            userMessageId: `user-${chatId}`,
            assistantMessageId: `assistant-${chatId}`,
            userSequence: 1,
            assistantSequence: 2,
          };
          streams.push({
            chatId,
            options,
            callbacks,
            commit: () => resolve({ commit }),
            fail: reject,
          });
        })
      ),
    );
  });

  it('preserves chat A tokens while chat B is active and shows them when A is reopened', async () => {
    const user = userEvent.setup();
    render(<Dashboard routeHash={`#dashboard?chat=${CHAT_A}`} />);
    const input = await screen.findByPlaceholderText(/Ask about your rubric/i);

    await user.type(input, 'Question A');
    await user.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(streams).toHaveLength(1));
    expect(streams[0].chatId).toBe(CHAT_A);

    await user.click(screen.getByText('Beta'));
    act(() => streams[0].callbacks.onTokenReceived('Answer A'));
    expect(screen.queryByText('Answer A')).not.toBeInTheDocument();

    await user.click(screen.getByText('Alpha'));
    expect(await screen.findByText('Answer A')).toBeInTheDocument();
    expect(screen.getByLabelText('Send')).toBeDisabled();
  });

  it('preserves an active stream while the chat view is unmounted', async () => {
    const user = userEvent.setup();
    render(<Dashboard routeHash={`#dashboard?chat=${CHAT_A}`} />);
    const input = await screen.findByPlaceholderText(/Ask about your rubric/i);
    await user.type(input, 'Question A');
    await user.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(streams).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Home' }));
    act(() => streams[0].callbacks.onTokenReceived('Background answer'));
    await user.click(screen.getByRole('button', { name: 'Chat' }));

    expect(await screen.findByText('Background answer')).toBeInTheDocument();
    expect(screen.getByLabelText('Send')).toBeDisabled();
  });

  it('refreshes AI usage exactly once after a failed request', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<Dashboard routeHash={`#dashboard?chat=${CHAT_A}`} />);
    const input = await screen.findByPlaceholderText(/Ask about your rubric/i);
    await waitFor(() => expect(mocks.getAiUsage).toHaveBeenCalledTimes(1));

    await user.type(input, 'Question A');
    await user.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => streams[0].fail(new Error('request failed')));

    expect(await screen.findByText('Error: request failed')).toBeInTheDocument();
    await waitFor(() => expect(mocks.getAiUsage).toHaveBeenCalledTimes(2));
    expect(consoleError).toHaveBeenCalledWith('Chat stream error:', expect.any(Error));
    consoleError.mockRestore();
  });

  it('refreshes AI usage exactly once after a successful commit', async () => {
    const user = userEvent.setup();
    render(<Dashboard routeHash={`#dashboard?chat=${CHAT_A}`} />);
    const input = await screen.findByPlaceholderText(/Ask about your rubric/i);
    await waitFor(() => expect(mocks.getAiUsage).toHaveBeenCalledTimes(1));

    await user.type(input, 'Question A');
    await user.click(screen.getByLabelText('Send'));
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => streams[0].commit());

    await waitFor(() => expect(mocks.getAiUsage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'false'));
    expect(mocks.getAiUsage).toHaveBeenCalledTimes(2);
  });
});
