import { describe, expect, it } from 'vitest';
import type { Rubric } from './dashboard-types';
import { normalizeIndexStatus, resolveChatRubricContext } from './chat-rubric-context';
import type { DashboardChat } from './studypilot-types';

const ACTIVE: Rubric = {
  id: 'rubric-active',
  title: 'Active Rubric',
  course: 'ENG 101',
  uploaded: 'Aug 6',
  active: true,
  sessionsCount: 1,
  criteria: [],
};

const LOCKED: Rubric = {
  id: 'rubric-locked',
  title: 'Locked Rubric',
  course: 'ENG 202',
  uploaded: 'Aug 5',
  active: false,
  sessionsCount: 0,
  criteria: [],
};

const rubricsById = new Map<string, Rubric>([
  [ACTIVE.id, ACTIVE],
  [LOCKED.id, LOCKED],
]);

function chat(overrides: Partial<DashboardChat> = {}): DashboardChat {
  return {
    id: 'chat-1',
    user_id: 'user-1',
    session_id: null,
    rubric_id: LOCKED.id,
    rubric_context_locked: true,
    title: 'Locked chat',
    origin_surface: 'dashboard',
    client_key: null,
    created_at: '2026-08-04T10:00:00.000Z',
    updated_at: '2026-08-04T10:00:00.000Z',
    ...overrides,
  };
}

describe('resolveChatRubricContext', () => {
  it('does not fall back to the active rubric for locked-null chats', () => {
    const result = resolveChatRubricContext({
      chat: chat({ rubric_id: null, rubric_context_locked: true }),
      rubricsById,
      activeRubric: ACTIVE,
    });

    expect(result.rubricRemoved).toBe(true);
    expect(result.rubric).toBeUndefined();
  });

  it('uses the chat rubric when locked with a surviving rubric_id', () => {
    const result = resolveChatRubricContext({
      chat: chat({ rubric_id: LOCKED.id, rubric_context_locked: true }),
      rubricsById,
      activeRubric: ACTIVE,
    });

    expect(result.rubricRemoved).toBe(false);
    expect(result.rubric).toEqual(LOCKED);
  });

  it('does not substitute the active rubric when a chat rubric id is missing locally', () => {
    const result = resolveChatRubricContext({
      chat: chat({ rubric_id: 'rubric-gone', rubric_context_locked: true }),
      rubricsById,
      activeRubric: ACTIVE,
    });

    expect(result.rubricRemoved).toBe(false);
    expect(result.rubric).toBeUndefined();
  });

  it('falls back to the active rubric for unlocked chats without a rubric_id', () => {
    const result = resolveChatRubricContext({
      chat: chat({ rubric_id: null, rubric_context_locked: false }),
      rubricsById,
      activeRubric: ACTIVE,
    });

    expect(result.rubricRemoved).toBe(false);
    expect(result.rubric).toEqual(ACTIVE);
  });
});

describe('normalizeIndexStatus', () => {
  it('preserves indexing instead of treating it as failed', () => {
    expect(normalizeIndexStatus('indexing')).toBe('indexing');
    expect(normalizeIndexStatus('uploading')).toBe('indexing');
    expect(normalizeIndexStatus('failed')).toBe('failed');
    expect(normalizeIndexStatus('indexed')).toBe('indexed');
  });
});
