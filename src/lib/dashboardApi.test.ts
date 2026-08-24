import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateRubric,
  fetchActionItems,
  fetchRubrics,
  fetchSessionTranscript,
  fetchSessions,
  setActionItemDone,
} from './dashboardApi';
import { apiFetch } from './api';

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
}));

describe('dashboardApi.activateRubric', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the FastAPI rubric CRUD boundary', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      text: async () => '',
    } as Response);

    await activateRubric('rubric-123');

    expect(apiFetch).toHaveBeenCalledWith('/rubrics/rubric-123/active', { method: 'PATCH' });
  });

  it('surfaces a failed activation response', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => '',
    } as Response);

    await expect(activateRubric('rubric-123')).rejects.toThrow('PATCH /rubrics/rubric-123/active failed: 409');
  });
});

function responseWithJson(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  } as Response;
}

describe('dashboardApi dashboard mapping boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps a session payload into the canonical dashboard shape', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      responseWithJson([
        {
          id: 'session-1',
          title: 'Essay rehearsal',
          source: null,
          mode: 'essay',
          duration: '24m',
          when: 'Today · 2:38 PM',
          rubric_id: 'rubric-1',
          chat_id: 'chat-1',
          screenshot_path: '/captures/session-1.jpg',
          summary: null,
        },
      ]),
    );

    await expect(fetchSessions()).resolves.toEqual([
      {
        id: 'session-1',
        title: 'Essay rehearsal',
        source: 'Chrome Extension',
        mode: 'essay',
        duration: '24m',
        when: 'Today · 2:38 PM',
        rubricId: 'rubric-1',
        chatId: 'chat-1',
        screenshotPath: '/captures/session-1.jpg',
        summary: '',
      },
    ]);
  });

  it('normalizes rubric defaults and upload status', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      responseWithJson([
        {
          id: 'rubric-1',
          title: 'Essay rubric',
          course: 'ENG 102',
          uploaded_at: '2026-08-01T00:00:00Z',
          active: null,
          sessions_count: null,
          file_search_status: 'uploading',
          file_search_error: 'still processing',
          criteria: [{ id: 'criterion-1', name: 'Thesis', score: null, max_score: null }],
        },
      ]),
    );

    const [rubric] = await fetchRubrics();
    expect(rubric).toMatchObject({
      id: 'rubric-1',
      active: false,
      sessionsCount: 0,
      fileSearchStatus: 'indexing',
      file_search_status: 'indexing',
      fileSearchError: 'still processing',
      criteria: [{ id: 'criterion-1', name: 'Thesis', score: 0, max: 4 }],
    });
  });

  it('maps transcript and action-item payloads without leaking snake_case fields', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(
        responseWithJson({
          transcript: [{ id: 'line-1', who: 'StudyPilot', text: 'Try a narrower claim.', t: '2:39' }],
        }),
      )
      .mockResolvedValueOnce(
        responseWithJson([
          { id: 'action-1', text: 'Narrow the claim', session_id: 'session-1', rubric_id: null, done: false },
        ]),
      );

    await expect(fetchSessionTranscript('session-1')).resolves.toEqual([
      { id: 'line-1', who: 'StudyPilot', text: 'Try a narrower claim.', t: '2:39' },
    ]);
    await expect(fetchActionItems()).resolves.toEqual([
      { id: 'action-1', text: 'Narrow the claim', sessionId: 'session-1', rubricId: null, done: false },
    ]);
  });

  it('writes and maps an action-item completion update', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      responseWithJson({
        id: 'action-1',
        text: 'Narrow the claim',
        session_id: null,
        rubric_id: 'rubric-1',
        done: true,
      }),
    );

    await expect(setActionItemDone('action-1', true)).resolves.toEqual({
      id: 'action-1',
      text: 'Narrow the claim',
      sessionId: null,
      rubricId: 'rubric-1',
      done: true,
    });
    expect(apiFetch).toHaveBeenCalledWith('/action-items/action-1', {
      method: 'PATCH',
      body: JSON.stringify({ done: true }),
    });
  });
});
