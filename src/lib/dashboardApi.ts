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

export type Rubric = {
  id: string;
  title: string;
  course: string;
  uploaded: string; // human label derived from uploaded_at, e.g. "Apr 12"
  active: boolean;
  sessionsCount: number;
  criteria: RubricCriterion[];
};

export type Session = {
  id: string;
  title: string;
  source: string;
  mode: string;
  duration: string; // pre-formatted by the backend, e.g. "24m"
  when: string; // pre-formatted by the backend, e.g. "Today · 2:38 PM"
  rubricId: string | null;
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
  file_search_status: string;
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

function mapRubric(r: ApiRubric): Rubric {
  return {
    id: r.id,
    title: r.title,
    course: r.course,
    uploaded: formatUploaded(r.uploaded_at),
    active: Boolean(r.active),
    sessionsCount: r.sessions_count ?? 0,
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
  return res.json();
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
