import type { FileSearchStatus, Rubric, Session } from './dashboard-types';
import type { DashboardChat } from './studypilot-types';

export type ChatRubricContext = {
  /** Rubric bound to this chat (or inherited active when unlocked). */
  rubric: Rubric | undefined;
  /** Locked chat whose rubric was deleted (rubric_id cleared). */
  rubricRemoved: boolean;
};

/**
 * Resolve which rubric a dashboard chat should display/use.
 *
 * Locked chats with a null rubric_id must NOT fall back to the globally active
 * rubric — that would silently switch context after a delete.
 */
export function resolveChatRubricContext(options: {
  chat: DashboardChat | undefined;
  session?: Session | undefined;
  rubricsById: ReadonlyMap<string, Rubric>;
  activeRubric: Rubric | undefined;
}): ChatRubricContext {
  const { chat, session, rubricsById, activeRubric } = options;
  const locked = chat?.rubric_context_locked === true;
  const chatRubricId = chat?.rubric_id ?? null;

  if (locked && chatRubricId === null) {
    return { rubric: undefined, rubricRemoved: true };
  }

  if (chatRubricId) {
    return {
      rubric: rubricsById.get(chatRubricId),
      rubricRemoved: false,
    };
  }

  const sessionRubricId = session?.rubricId ?? null;
  if (sessionRubricId) {
    return {
      rubric: rubricsById.get(sessionRubricId) ?? activeRubric,
      rubricRemoved: false,
    };
  }

  return { rubric: activeRubric, rubricRemoved: false };
}

/** Map File Search / knowledge-document status without treating "indexing" as failed. */
export function normalizeIndexStatus(status: string | null | undefined): FileSearchStatus {
  switch (status) {
    case 'pending':
    case 'indexing':
    case 'indexed':
    case 'failed':
    case 'deleted':
    case 'not_indexed':
      return status;
    case 'uploading':
      return 'indexing';
    default:
      return 'not_indexed';
  }
}
