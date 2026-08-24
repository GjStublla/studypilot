import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionItem, Rubric } from './studypilot-types';

vi.mock('./supabaseClient', () => ({
  supabase: {},
  injectStoredToken: vi.fn(),
}));

import { adaptActionItem, adaptRubric, adaptSession, type SessionListRow } from './studypilot-api';

describe('StudyPilot dashboard adapters', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T12:00:00Z'));
  });

  it('normalizes optional session fields for the dashboard', () => {
    const session = {
      id: 'session-1',
      title: 'Essay rehearsal',
      source: 'Chrome Extension',
      mode: 'Essay Coach',
      duration_seconds: 125,
      summary: null,
      when_timestamp: '',
      rubric_id: undefined,
      chat_id: undefined,
      screenshot_path: undefined,
    } as SessionListRow;

    expect(adaptSession(session)).toMatchObject({
      id: 'session-1',
      duration: '2m 5s',
      when: '',
      rubricId: null,
      chatId: null,
      screenshotPath: null,
      summary: '',
    });
  });

  it('creates stable criterion IDs and score defaults', () => {
    const rubric = {
      id: 'rubric-1',
      title: 'Essay rubric',
      course: 'ENG 102',
      uploaded_at: '2026-08-01T00:00:00Z',
      sessions_count: 0,
      active: false,
      criteria: [{ name: 'Thesis', max_score: 5 }],
    } as Rubric;

    expect(adaptRubric(rubric).criteria).toEqual([{ id: 'rubric-1-criterion-0', name: 'Thesis', score: 0, max: 5 }]);
  });

  it('converts nullable relation IDs to dashboard nulls', () => {
    const item = {
      id: 'action-1',
      text: 'Clarify the claim',
      session_id: undefined,
      rubric_id: undefined,
      done: false,
    } as ActionItem;

    expect(adaptActionItem(item)).toMatchObject({
      id: 'action-1',
      sessionId: null,
      rubricId: null,
      done: false,
    });
  });
});
