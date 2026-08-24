// Frontend data operators for StudyPilot Supabase integration.
//
// These functions provide a typed interface to the Supabase database
// and Edge Functions, following the patterns established in the existing
// dashboardApi.ts but adapted for the new Supabase-first architecture.

import { supabase, injectStoredToken } from './supabaseClient';
import type {
  Profile,
  AiUsage,
  Rubric,
  KnowledgeDocument,
  Session,
  ActionItem,
  DashboardChat,
  DashboardChatMessage,
  ActivityLog,
  IndexKnowledgeDocumentResponse,
  SummarizeSessionResponse,
  ExtractRubricResponse,
  TranscriptMessage,
} from './studypilot-types';
import type {
  ActionItem as DashboardActionItem,
  Rubric as DashboardRubric,
  Session as DashboardSession,
} from './dashboard-types';

// Re-export types for convenience
export type {
  Profile,
  AiUsage,
  Rubric,
  KnowledgeDocument,
  Session,
  ActionItem,
  DashboardChat,
  DashboardChatMessage,
  ActivityLog,
};

// ─── Type Adapters for Dashboard Compatibility ─────────────────────────────────────

type SessionMessageRow = {
  id: string;
  role: TranscriptMessage['role'];
  message_text: string;
  time_offset_seconds: number;
};

export type SessionListRow = Pick<
  Session,
  | 'id'
  | 'title'
  | 'source'
  | 'mode'
  | 'duration_seconds'
  | 'summary'
  | 'when_timestamp'
  | 'rubric_id'
  | 'chat_id'
  | 'screenshot_path'
> & {
  action_items?: Array<Pick<ActionItem, 'done'>> | null;
};

export type SessionWithRelations = Session & {
  messages?: TranscriptMessage[] | null;
  action_items?: ActionItem[] | null;
};

export type SessionDetails = {
  session: SessionWithRelations;
  actionItems: ActionItem[];
  rubric: Rubric | null;
};

// Dashboard expects camelCase, Supabase uses snake_case
export function adaptSession(session: SessionListRow): DashboardSession {
  return {
    ...session,
    rubricId: session.rubric_id ?? null,
    chatId: session.chat_id ?? null,
    screenshotPath: session.screenshot_path ?? null,
    when: formatWhen(session.when_timestamp),
    duration: formatDuration(session.duration_seconds),
    summary: session.summary ?? '',
  };
}

export function adaptRubric(rubric: Rubric): DashboardRubric {
  return {
    ...rubric,
    sessionsCount: rubric.sessions_count ?? 0,
    knowledgeDocumentId: rubric.knowledge_document_id ?? null,
    fileSearchStatus: rubric.file_search_status ?? 'not_indexed',
    fileSearchError: rubric.file_search_error ?? null,
    uploaded: new Date(rubric.uploaded_at).toLocaleDateString(),
    criteria: (rubric.criteria ?? []).map((criterion, index) => ({
      id: criterion.id ?? `${rubric.id}-criterion-${index}`,
      name: criterion.name,
      score: criterion.score ?? 0,
      max: criterion.max_score,
    })),
  };
}

export function adaptActionItem(item: ActionItem): DashboardActionItem {
  return {
    ...item,
    sessionId: item.session_id ?? null,
    rubricId: item.rubric_id ?? null,
  };
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return '0m';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/**
 * Format an ISO timestamp into a relative display label:
 *   "Today · 2:38 PM", "Yesterday · 8:12 PM", "Apr 21 · 10:02 AM"
 * Matches the formatting in backend/routers/sessions.py _when_str().
 */
function formatWhen(isoTimestamp?: string | null): string {
  if (!isoTimestamp) return '';
  try {
    const dt = new Date(isoTimestamp);
    const now = new Date();
    const dtDate = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((nowDate.getTime() - dtDate.getTime()) / 86_400_000);

    const timeStr = dt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    if (diffDays === 0) return `Today · ${timeStr}`;
    if (diffDays === 1) return `Yesterday · ${timeStr}`;
    const month = dt.toLocaleString('en-US', { month: 'short' });
    return `${month} ${dt.getDate()} · ${timeStr}`;
  } catch {
    return isoTimestamp;
  }
}

export type TranscriptLine = {
  id: string;
  who: string;
  text: string;
  t: number;
};

export async function fetchSessionTranscript(sessionId: string): Promise<TranscriptLine[]> {
  const { data, error } = await supabase
    .from('session_messages')
    .select('id, role, message_text, time_offset_seconds, server_sequence')
    .eq('session_id', sessionId)
    .order('time_offset_seconds', { ascending: true })
    .order('server_sequence', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;

  return (data || []).map((m: SessionMessageRow) => ({
    id: m.id,
    who: m.role === 'user' ? 'Student' : 'StudyPilot',
    text: m.message_text,
    t: m.time_offset_seconds,
  }));
}

export async function createSessionCaptureSignedUrl(path: string): Promise<string> {
  await injectStoredToken();
  const { data, error } = await supabase.storage.from('session-captures').createSignedUrl(path, 60 * 60);

  if (error) throw error;
  return data.signedUrl.startsWith('/') ? `${import.meta.env.VITE_SUPABASE_URL}${data.signedUrl}` : data.signedUrl;
}

// ─── Dashboard-compatible wrappers ─────────────────────────────────────────────────

export async function fetchSessions(): Promise<DashboardSession[]> {
  const sessions = await getSessions();
  return sessions.map(adaptSession);
}

export async function fetchRubrics(): Promise<DashboardRubric[]> {
  const rubrics = await getRubrics();
  return rubrics.map(adaptRubric);
}

export async function fetchActionItems(): Promise<DashboardActionItem[]> {
  const items = await getActionItems();
  return items.map(adaptActionItem);
}

export async function setActionItemDone(id: string, done: boolean): Promise<void> {
  // toggleActionItem(id, currentDone) writes { done: !currentDone }.
  // To land on the desired `done` value we pass !done as currentDone.
  await toggleActionItem(id, !done);
}

// ─── Profile Operations ───────────────────────────────────────────────────────────

export async function getProfile(): Promise<Profile | null> {
  await injectStoredToken();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  if (error) throw error;
  return data;
}

export async function updateProfile(updates: Partial<Profile>): Promise<Profile> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase.from('profiles').update(updates).eq('id', user.id).select().single();

  if (error) throw error;
  return data;
}

// ─── AI Usage Operations ─────────────────────────────────────────────────────────

export async function getAiUsage(): Promise<AiUsage> {
  await injectStoredToken();

  const { data, error } = await supabase.rpc('get_ai_usage');
  if (error) throw error;

  return data as AiUsage;
}

// ─── Rubric Operations ────────────────────────────────────────────────────────────

export async function getRubrics(): Promise<Rubric[]> {
  await injectStoredToken();
  const { data, error } = await supabase
    .from('rubrics')
    .select('*, criteria:rubric_criteria(*)')
    .order('uploaded_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getRubricById(rubricId: string): Promise<Rubric | null> {
  const { data, error } = await supabase
    .from('rubrics')
    .select('*, criteria:rubric_criteria(*)')
    .eq('id', rubricId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

export async function setActiveRubric(activeId: string): Promise<void> {
  await injectStoredToken();

  // Prefer the atomic ownership-checked RPC when available.
  const { error: rpcError } = await supabase.rpc('set_active_rubric', {
    p_rubric_id: activeId,
  });

  if (!rpcError) return;

  // Fallback for environments where the migration is not applied yet.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error(rpcError.message || 'Not authenticated');

  const { error: clearActive } = await supabase.from('rubrics').update({ active: false }).eq('user_id', user.id);

  if (clearActive) throw clearActive;

  const { error: setActive } = await supabase.from('rubrics').update({ active: true }).eq('id', activeId);

  if (setActive) throw setActive;
}

export async function createRubric(rubric: Omit<Rubric, 'id' | 'created_at' | 'updated_at'>): Promise<Rubric> {
  const { data, error } = await supabase.from('rubrics').insert(rubric).select().single();

  if (error) throw error;
  return data;
}

export async function deleteRubric(rubricId: string): Promise<void> {
  const { error } = await supabase.from('rubrics').delete().eq('id', rubricId);

  if (error) throw error;
}

export type RubricUploadResult = {
  rubricId: string;
  title: string;
  course: string;
  extractedText: string;
  criteria: Array<{ name: string; max_score: number }>;
  knowledgeDocumentId: string | null;
  fileSearchStatus: Rubric['file_search_status'];
  active: boolean;
};

/**
 * Upload any file as a rubric:
 *   1. Create the rubric DB row
 *   2. Upload the file to Supabase Storage (bucket: rubrics)
 *   3. Call the extract-rubric Edge Function so Gemini parses criteria
 *      (extract starts File Search indexing server-side — do not call index here)
 *   4. Link the knowledge document + reflect pending/indexing status for realtime polling
 *   5. First rubric for the user becomes the server-side active default
 *
 * Accepts any file type — the extract-rubric function reads text content
 * from plain text files and PDFs directly.
 */
export async function uploadRubricFile(file: File, title: string, course: string): Promise<RubricUploadResult> {
  await injectStoredToken();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { count: existingCount } = await supabase
    .from('rubrics')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const isFirstRubric = (existingCount ?? 0) === 0;

  // 1. Create the rubric row to get an ID for the storage path.
  const { data: rubric, error: rubricError } = await supabase
    .from('rubrics')
    .insert({
      user_id: user.id,
      title,
      course,
      active: false,
      file_search_status: 'not_indexed',
    })
    .select('id, title, course')
    .single();

  if (rubricError || !rubric) {
    throw new Error(rubricError?.message ?? 'Could not create rubric.');
  }

  // 2. Upload to Storage. Path: {userId}/{rubricId}/{filename}
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${user.id}/${rubric.id}/${safeName}`;

  const { error: uploadError } = await supabase.storage.from('rubrics').upload(storagePath, file, { upsert: true });

  if (uploadError) {
    await supabase.from('rubrics').delete().eq('id', rubric.id);
    throw new Error(`File upload failed: ${uploadError.message}`);
  }

  await supabase.from('rubrics').update({ file_path: storagePath }).eq('id', rubric.id);

  // 3. Extract criteria via the Edge Function (also kicks off indexing).
  const extracted = await extractRubric(rubric.id, storagePath);

  // 4. Ensure store exists (best-effort). Do NOT call indexKnowledgeDocument —
  // extract-rubric already starts indexing; a second call double-charges quota.
  try {
    await ensureFileSearchStore();
  } catch (error) {
    console.warn('ensureFileSearchStore failed after rubric upload:', error);
  }

  let knowledgeDocumentId: string | null = extracted.knowledgeDocumentId ?? null;
  if (!knowledgeDocumentId) {
    const { data: doc } = await supabase
      .from('knowledge_documents')
      .select('id')
      .eq('rubric_id', rubric.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    knowledgeDocumentId = doc?.id ?? null;
  }

  const fileSearchStatus: Rubric['file_search_status'] = knowledgeDocumentId
    ? extracted.indexingStarted
      ? 'indexing'
      : 'pending'
    : 'not_indexed';

  if (knowledgeDocumentId) {
    await supabase
      .from('rubrics')
      .update({
        knowledge_document_id: knowledgeDocumentId,
        file_search_status: fileSearchStatus,
      })
      .eq('id', rubric.id);
  }

  // 5. First rubric becomes the global default via RPC.
  let active = false;
  if (isFirstRubric) {
    try {
      await setActiveRubric(rubric.id);
      active = true;
    } catch (error) {
      console.warn('set_active_rubric failed for first rubric:', error);
    }
  }

  return {
    rubricId: rubric.id,
    title: rubric.title,
    course: rubric.course,
    extractedText: extracted.extractedText,
    criteria: extracted.criteria,
    knowledgeDocumentId,
    fileSearchStatus,
    active,
  };
}

/** Re-run File Search indexing for a knowledge document linked to a rubric. */
export async function retryRubricIndexing(knowledgeDocumentId: string): Promise<IndexKnowledgeDocumentResponse> {
  await injectStoredToken();
  try {
    await ensureFileSearchStore();
  } catch (error) {
    console.warn('ensureFileSearchStore failed before retry index:', error);
  }
  return indexKnowledgeDocument(knowledgeDocumentId);
}

// ─── Knowledge Document Operations ────────────────────────────────────────────────

export async function getKnowledgeDocuments(): Promise<KnowledgeDocument[]> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getKnowledgeDocumentById(documentId: string): Promise<KnowledgeDocument | null> {
  const { data, error } = await supabase.from('knowledge_documents').select('*').eq('id', documentId).single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function createKnowledgeDocument(
  document: Omit<KnowledgeDocument, 'id' | 'created_at' | 'updated_at'>,
): Promise<KnowledgeDocument> {
  const { data, error } = await supabase.from('knowledge_documents').insert(document).select().single();

  if (error) throw error;
  return data;
}

export async function updateKnowledgeDocument(
  documentId: string,
  updates: Partial<KnowledgeDocument>,
): Promise<KnowledgeDocument> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .update(updates)
    .eq('id', documentId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteKnowledgeDocument(documentId: string): Promise<void> {
  const { error } = await supabase.from('knowledge_documents').delete().eq('id', documentId);

  if (error) throw error;
}

// ─── Edge Function auth helper ────────────────────────────────────────────────

/**
 * Returns the best available JWT for calling Supabase Edge Functions.
 * Works for both OAuth users (Supabase session) and email/password users
 * (FastAPI-managed JWT in localStorage). Both are valid Supabase JWTs.
 */
async function getEdgeFunctionToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  const raw = localStorage.getItem('sp_access_token');
  if (raw) return raw;
  throw new Error('Not authenticated. Please sign in again.');
}

// ─── Edge Function: Index Knowledge Document ─────────────────────────────────────

export async function indexKnowledgeDocument(knowledgeDocumentId: string): Promise<IndexKnowledgeDocumentResponse> {
  const token = await getEdgeFunctionToken();

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/index-knowledge-document`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ knowledgeDocumentId }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = (errorBody as { error?: unknown }).error;
    throw new Error(
      typeof message === 'string' && message.trim() ? message : `Indexing failed: ${response.statusText}`,
    );
  }

  return response.json();
}

// ─── Session Operations ───────────────────────────────────────────────────────────

export async function getSessions(): Promise<SessionListRow[]> {
  await injectStoredToken();
  const { data, error } = await supabase
    .from('sessions')
    .select(
      `
      id, title, source, mode, duration_seconds, summary, when_timestamp, rubric_id, chat_id, screenshot_path,
      action_items(id, done)
    `,
    )
    .order('when_timestamp', { ascending: false });

  if (error) throw error;

  return (data || []).map((s: SessionListRow) => {
    const actions = s.action_items ?? [];
    const openCount = actions.filter((action) => !action.done).length;
    return { ...s, openCount };
  });
}

export async function getSessionById(sessionId: string): Promise<SessionWithRelations | null> {
  const { data: session, error: sesError } = await supabase
    .from('sessions')
    .select('*, messages:session_messages(*), action_items(*)')
    .eq('id', sessionId)
    .single();

  if (sesError) {
    if (sesError.code === 'PGRST116') return null;
    throw sesError;
  }

  return session as SessionWithRelations;
}

export async function getSessionDetails(sessionId: string): Promise<SessionDetails> {
  const { data: session, error: sesError } = await supabase
    .from('sessions')
    .select('*, messages:session_messages(*), action_items(*)')
    .eq('id', sessionId)
    .single();

  if (sesError) throw sesError;

  const sessionWithRelations = session as SessionWithRelations;
  let rubric: Rubric | null = null;

  if (sessionWithRelations.rubric_id) {
    const { data, error: rubError } = await supabase
      .from('rubrics')
      .select('*, criteria:rubric_criteria(*)')
      .eq('id', session.rubric_id)
      .single();

    if (!rubError) rubric = data;
  }

  return {
    session: sessionWithRelations,
    actionItems: sessionWithRelations.action_items || [],
    rubric,
  };
}

export async function createSession(
  session: Omit<Session, 'id' | 'created_at' | 'session_messages'>,
): Promise<Session> {
  const { data, error } = await supabase.from('sessions').insert(session).select().single();

  if (error) throw error;
  return data;
}

// ─── Action Item Operations ─────────────────────────────────────────────────────

export async function getActionItems(): Promise<ActionItem[]> {
  await injectStoredToken();
  const { data, error } = await supabase.from('action_items').select('*').order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createActionItem(
  item: Omit<ActionItem, 'id' | 'created_at' | 'updated_at'>,
): Promise<ActionItem> {
  const { data, error } = await supabase.from('action_items').insert(item).select().single();

  if (error) throw error;
  return data;
}

export async function toggleActionItem(id: string, currentDone: boolean): Promise<ActionItem> {
  await injectStoredToken();
  const { data, error } = await supabase
    .from('action_items')
    .update({ done: !currentDone })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      event_type: data.done ? 'action_item_completed' : 'action_item_reopened',
      details: { action_text: data.text },
    });
  }

  return data;
}

export async function deleteActionItem(id: string): Promise<void> {
  const { error } = await supabase.from('action_items').delete().eq('id', id);

  if (error) throw error;
}

// ─── Dashboard Chat Operations ────────────────────────────────────────────────────

async function getDashboardChatUserId(): Promise<string> {
  const storedUserId = localStorage.getItem('sp_user_id');
  if (storedUserId) return storedUserId;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user.id) return session.user.id;

  throw new Error('Not authenticated');
}

export async function getDashboardChats(): Promise<DashboardChat[]> {
  await injectStoredToken();
  const { data, error } = await supabase
    .from('dashboard_chats')
    .select(
      `
      id, user_id, session_id, rubric_id, rubric_context_locked, context_summary,
      summary_through_sequence, title, origin_surface, client_key, created_at, updated_at
    `,
    )
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) {
    // Fallback when rubric columns are not migrated yet.
    const { data: legacy, error: legacyError } = await supabase
      .from('dashboard_chats')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false });
    if (legacyError) throw error;
    return legacy || [];
  }
  return data || [];
}

export async function createDashboardChat(title: string, sessionId?: string | null): Promise<DashboardChat> {
  await injectStoredToken();
  const userId = await getDashboardChatUserId();
  const { data, error } = await supabase
    .from('dashboard_chats')
    .insert({
      user_id: userId,
      title,
      session_id: sessionId ?? null,
      origin_surface: 'dashboard',
      client_key: null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Return the canonical chat linked to a captured session, creating it when
 * necessary. The RPC derives ownership from auth.uid() and serializes
 * concurrent dashboard/extension callers in Postgres.
 */
export async function getOrCreateSessionChat(sessionId: string, title = 'New chat'): Promise<DashboardChat> {
  await injectStoredToken();
  const { data, error } = await supabase.rpc('get_or_create_session_chat', {
    p_session_id: sessionId,
    p_title: title,
    p_origin_surface: 'dashboard',
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Session chat RPC returned an invalid response');
  }
  return data as DashboardChat;
}

/**
 * Return (or create) the durable rubric-scoped chat without changing the
 * user's global active rubric. Response shape matches dashboard_chats row.
 */
export async function getOrCreateRubricChat(rubricId: string): Promise<DashboardChat> {
  await injectStoredToken();
  const { data, error } = await supabase.rpc('get_or_create_rubric_chat', {
    p_rubric_id: rubricId,
  });

  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Rubric chat RPC returned an invalid response');
  }
  return data as DashboardChat;
}

export async function updateDashboardChat(
  chatId: string,
  updates: Pick<DashboardChat, 'title'>,
): Promise<DashboardChat> {
  await injectStoredToken();
  const { data, error } = await supabase.from('dashboard_chats').update(updates).eq('id', chatId).select().single();

  if (error) throw error;
  return data;
}

export async function deleteDashboardChat(chatId: string): Promise<void> {
  await injectStoredToken();
  const { error } = await supabase.from('dashboard_chats').delete().eq('id', chatId);

  if (error) throw error;
}

export async function getDashboardChatMessages(chatId: string): Promise<DashboardChatMessage[]> {
  await injectStoredToken();
  const { data, error } = await supabase
    .from('dashboard_chat_messages')
    .select(
      `
      id, user_id, chat_id, session_id, role, text, origin_surface, request_id,
      server_sequence, used_file_search, file_search_store_name, grounding_metadata,
      citations, created_at
    `,
    )
    .eq('chat_id', chatId)
    .order('server_sequence', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    // Fallback when citations column is not present yet.
    const { data: legacy, error: legacyError } = await supabase
      .from('dashboard_chat_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('server_sequence', { ascending: true })
      .order('id', { ascending: true });
    if (legacyError) throw error;
    return legacy || [];
  }
  return data || [];
}

// ─── Activity Log Operations ─────────────────────────────────────────────────────

export async function getActivityLogs(limit: number = 50): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function createActivityLog(log: Omit<ActivityLog, 'id' | 'created_at'>): Promise<ActivityLog> {
  const { data, error } = await supabase.from('activity_logs').insert(log).select().single();

  if (error) throw error;
  return data;
}

// ─── Edge Function: Summarize Session ─────────────────────────────────────────────

export async function summarizeSession(sessionId: string): Promise<SummarizeSessionResponse> {
  const token = await getEdgeFunctionToken();

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = (errorBody as { error?: unknown }).error;
    throw new Error(
      typeof message === 'string' && message.trim() ? message : `Summarization failed: ${response.statusText}`,
    );
  }

  return response.json();
}

// ─── Edge Function: Extract Rubric ────────────────────────────────────────────────

export async function extractRubric(rubricId: string, filePath?: string): Promise<ExtractRubricResponse> {
  const token = await getEdgeFunctionToken();

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-rubric`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ rubricId, filePath }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = (errorBody as { error?: unknown }).error;
    throw new Error(
      typeof message === 'string' && message.trim() ? message : `Rubric extraction failed: ${response.statusText}`,
    );
  }

  return response.json();
}

// ─── Edge Function: Ensure File Search Store ─────────────────────────────────────

export async function ensureFileSearchStore() {
  const token = await getEdgeFunctionToken();

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ensure-file-search-store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Failed to ensure file search store: ${response.statusText}`);
  }

  return response.json();
}

// ─── Edge Function: Live Token ───────────────────────────────────────────────────

export async function getLiveToken(sessionId?: string) {
  const token = await getEdgeFunctionToken();

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/live-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get live token: ${response.statusText}`);
  }

  return response.json();
}
