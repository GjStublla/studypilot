/**
 * Canonical dashboard-facing models.
 *
 * API adapters may use different raw payload shapes, but components and
 * dashboard orchestration code should exchange these stable camelCase types.
 */

export type RubricCriterion = {
  id: string;
  name: string;
  score: number;
  max: number;
};

export type FileSearchStatus = 'not_indexed' | 'pending' | 'indexing' | 'indexed' | 'failed' | 'deleted';

export type Rubric = {
  id: string;
  title: string;
  course: string;
  uploaded: string;
  active: boolean;
  sessionsCount: number;
  criteria: RubricCriterion[];
  knowledgeDocumentId?: string | null;
  knowledge_document_id?: string | null;
  fileSearchStatus?: FileSearchStatus;
  file_search_status?: FileSearchStatus;
  fileSearchError?: string | null;
  file_search_error?: string | null;
};

export type Session = {
  id: string;
  title: string;
  source: string;
  mode: string;
  duration: string;
  when: string;
  rubricId: string | null;
  /** Canonical dashboard chat id when a session continues an existing chat. */
  chatId: string | null;
  /** Compatibility fields for realtime rows not yet passed through the mapper. */
  chat_id?: string | null;
  screenshotPath?: string | null;
  screenshot_path?: string | null;
  summary: string;
};

export type TranscriptLine = {
  id: string;
  who: 'You' | 'StudyPilot';
  text: string;
  t: string;
};

export type ActionItem = {
  id: string;
  text: string;
  sessionId: string | null;
  rubricId: string | null;
  done: boolean;
};
