// Typed data layer for the dashboard.
//
// Wraps the FastAPI endpoints (via apiFetch, which handles auth + token refresh)
// and maps the backend's snake_case JSON into the camelCase shapes the
// dashboard components consume. Keeping the mapping here means Dashboard.tsx
// never touches raw API payloads.

import { apiFetch } from './api';
import { injectStoredToken, supabase } from './supabaseClient';
import type { ActionItem, FileSearchStatus, Rubric, Session, TranscriptLine } from './dashboard-types';

export type { ActionItem, FileSearchStatus, Rubric, RubricCriterion, Session, TranscriptLine } from './dashboard-types';

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

export async function deleteActionItem(id: string): Promise<void> {
  const res = await apiFetch(`/action-items/${id}`, { method: 'DELETE' });
  if (res.status === 404) throw new Error('Action item not found.');
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export async function deleteSession(id: string): Promise<void> {
  const res = await apiFetch(`/sessions/${id}`, { method: 'DELETE' });
  if (res.status === 404) throw new Error('Session not found.');
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export async function deleteRubric(id: string): Promise<void> {
  const res = await apiFetch(`/rubrics/${id}`, { method: 'DELETE' });
  if (res.status === 409) {
    throw new Error('Cannot delete the active rubric. Set another rubric as active first.');
  }
  if (res.status === 404) {
    throw new Error('Rubric not found.');
  }
  if (!res.ok) {
    throw new Error(`Delete failed: ${res.status}`);
  }
}

async function deleteUserResource(mode: 'data' | 'account'): Promise<void> {
  if (!(await injectStoredToken())) throw new Error('Session expired. Please log in again.');
  const { error } = await supabase.functions.invoke('delete-user-data', { body: { mode } });
  if (error) throw new Error('Deletion could not be completed. Please try again.');
}

export const deleteAllUserData = (): Promise<void> => deleteUserResource('data');
export const deleteUserAccount = (): Promise<void> => deleteUserResource('account');
