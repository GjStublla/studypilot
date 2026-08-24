// Typed data layer for the dashboard.
//
// Wraps the FastAPI endpoints (via apiFetch, which handles auth + token refresh)
// and maps the backend's snake_case JSON into the camelCase shapes the
// dashboard components consume. Keeping the mapping here means Dashboard.tsx
// never touches raw API payloads.

import { apiFetch } from './api';

// ─── Domain types (camelCase — what the UI uses) ──────────────────────────────

export type RubricCriterion = {
  id: string;
  name: string;
  score: number;
  max: number;
};

export type FileSearchStatus =
  | 'not_indexed'
  | 'pending'
  | 'indexing'
  | 'indexed'
  | 'failed'
  | 'deleted';

export type Rubric = {
  id: string;
  title: string;
  course: string;
  uploaded: string; // human label derived from uploaded_at, e.g. "Apr 12"
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
  duration: string; // pre-formatted by the backend, e.g. "24m"
  when: string; // pre-formatted by the backend, e.g. "Today · 2:38 PM"
  rubricId: string | null;
  /** Canonical dashboard chat id when the session continues an existing chat. */
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
  t: string; // formatted offset, e.g. "2:39"
};

export type ActionItem = {
  id: string;
  text: string;
  sessionId: string | null;
  rubricId: string | null;
  done: boolean;
};

// ─── Raw API payload shapes (snake_case — what the backend returns) ────────────

type ApiRubricCriterion = { id: string; name: string; score: number | null; max_score: number | null };
type ApiRubric = {
  id: string;
  title: string;
  course: string;
  uploaded_at: string;
  active: boolean | null;
  sessions_count: number | null;
  knowledge_document_id?: string | null;
  file_search_status?: string | null;
  file_search_error?: string | null;
  criteria: ApiRubricCriterion[] | null;
};
type ApiSession = {
  id: string;
  title: string;
  source: string | null;
  mode: string;
  duration: string;
  when: string;
  rubric_id: string | null;
  chat_id?: string | null;
  screenshot_path?: string | null;
  summary: string | null;
};
type ApiTranscriptMessage = { id: string; who: 'You' | 'StudyPilot'; text: string; t: string };
type ApiSessionDetail = ApiSession & { transcript: ApiTranscriptMessage[] | null };
type ApiActionItem = {
  id: string;
  text: string;
  session_id: string | null;
  rubric_id: string | null;
  done: boolean;
};

// ─── Mappers ──────────────────────────────────────────────────────────────────

const uploadedFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function formatUploaded(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : uploadedFormatter.format(d);
}

function mapFileSearchStatus(status: string | null | undefined): FileSearchStatus {
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

function mapRubric(r: ApiRubric): Rubric {
  const fileSearchStatus = mapFileSearchStatus(r.file_search_status);
  return {
    id: r.id,
    title: r.title,
    course: r.course,
    uploaded: formatUploaded(r.uploaded_at),
    active: Boolean(r.active),
    sessionsCount: r.sessions_count ?? 0,
    knowledgeDocumentId: r.knowledge_document_id ?? null,
    fileSearchStatus,
    // Keep snake_case alias for Dashboard realtime / upload payloads.
    file_search_status: fileSearchStatus,
    fileSearchError: r.file_search_error ?? null,
    criteria: (r.criteria ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      score: c.score ?? 0,
      max: c.max_score ?? 4,
    })),
  };
}

function mapSession(s: ApiSession): Session {
  return {
    id: s.id,
    title: s.title,
    source: s.source ?? 'Chrome Extension',
    mode: s.mode,
    duration: s.duration,
    when: s.when,
    rubricId: s.rubric_id ?? null,
    chatId: s.chat_id ?? null,
    screenshotPath: s.screenshot_path ?? null,
    summary: s.summary ?? '',
  };
}

function mapActionItem(a: ApiActionItem): ActionItem {
  return {
    id: a.id,
    text: a.text,
    sessionId: a.session_id ?? null,
    rubricId: a.rubric_id ?? null,
    done: Boolean(a.done),
  };
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function getJson(path: string, options?: RequestInit): Promise<unknown> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    throw new Error(`${options?.method ?? 'GET'} ${path} failed: ${res.status}`);
  }

  const maybeText = (res as Response & { text?: () => Promise<string> }).text;
  if (typeof maybeText !== 'function') {
    return {};
  }

  const text = await maybeText.call(res);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function fetchSessions(): Promise<Session[]> {
  const data = (await getJson('/sessions')) as ApiSession[];
  return data.map(mapSession);
}

/** Full session detail — used for the transcript (session_messages). */
export async function fetchSessionTranscript(sessionId: string): Promise<TranscriptLine[]> {
  const data = (await getJson(`/sessions/${sessionId}`)) as ApiSessionDetail;
  return (data.transcript ?? []).map((m) => ({ id: m.id, who: m.who, text: m.text, t: m.t }));
}

export async function fetchRubrics(): Promise<Rubric[]> {
  const data = (await getJson('/rubrics')) as ApiRubric[];
  return data.map(mapRubric);
}

export async function fetchActionItems(): Promise<ActionItem[]> {
  const data = (await getJson('/action-items')) as ApiActionItem[];
  return data.map(mapActionItem);
}

export async function setActionItemDone(id: string, done: boolean): Promise<ActionItem> {
  const data = (await getJson(`/action-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ done }),
  })) as ApiActionItem;
  return mapActionItem(data);
}

export async function activateRubric(id: string): Promise<void> {
  // Rubric activation is CRUD owned by FastAPI; keep Supabase RPC calls in
  // the Supabase/Edge adapter instead of crossing the dashboard boundary.
  await getJson(`/rubrics/${id}/active`, { method: 'PATCH' });
}
