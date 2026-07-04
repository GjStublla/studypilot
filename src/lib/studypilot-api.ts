// Frontend data operators for StudyPilot Supabase integration.
//
// These functions provide a typed interface to the Supabase database
// and Edge Functions, following the patterns established in the existing
// dashboardApi.ts but adapted for the new Supabase-first architecture.

import { supabase, injectStoredToken } from './supabaseClient';
import type {
  Profile,
  Rubric,
  KnowledgeDocument,
  Session,
  ActionItem,
  DashboardChatMessage,
  ActivityLog,
  IndexKnowledgeDocumentResponse,
  SummarizeSessionResponse,
  ExtractRubricResponse,
} from './studypilot-types';

// Re-export types for convenience
export type {
  Profile,
  Rubric,
  KnowledgeDocument,
  Session,
  ActionItem,
  DashboardChatMessage,
  ActivityLog,
};

// ─── Type Adapters for Dashboard Compatibility ─────────────────────────────────────

// Dashboard expects camelCase, Supabase uses snake_case
export function adaptSession(session: Session): any {
  return {
    ...session,
    rubricId: session.rubric_id,
    when: formatWhen(session.when_timestamp),
    duration: formatDuration(session.duration_seconds),
  };
}

export function adaptRubric(rubric: Rubric): any {
  return {
    ...rubric,
    sessionsCount: rubric.sessions_count,
    uploaded: new Date(rubric.uploaded_at).toLocaleDateString(),
    criteria: rubric.criteria?.map((c: any) => ({
      ...c,
      max: c.max_score,
    })) || [],
  };
}

export function adaptActionItem(item: ActionItem): any {
  return {
    ...item,
    sessionId: item.session_id,
    rubricId: item.rubric_id,
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
    .select('id, role, message_text, time_offset_seconds')
    .eq('session_id', sessionId)
    .order('time_offset_seconds', { ascending: true });

  if (error) throw error;

  return (data || []).map((m: any) => ({
    id: m.id,
    who: m.role === 'user' ? 'Student' : 'StudyPilot',
    text: m.message_text,
    t: m.time_offset_seconds,
  }));
}

// ─── Dashboard-compatible wrappers ─────────────────────────────────────────────────

export async function fetchSessions(): Promise<any[]> {
  const sessions = await getSessions();
  return sessions.map(adaptSession);
}

export async function fetchRubrics(): Promise<any[]> {
  const rubrics = await getRubrics();
  return rubrics.map(adaptRubric);
}

export async function fetchActionItems(): Promise<any[]> {
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateProfile(updates: Partial<Profile>): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Clear all active flags first
  const { error: clearActive } = await supabase
    .from('rubrics')
    .update({ active: false })
    .eq('user_id', user.id);

  if (clearActive) throw clearActive;

  // Set the new active rubric
  const { error: setActive } = await supabase
    .from('rubrics')
    .update({ active: true })
    .eq('id', activeId);

  if (setActive) throw setActive;
}

export async function createRubric(rubric: Omit<Rubric, 'id' | 'created_at' | 'updated_at'>): Promise<Rubric> {
  const { data, error } = await supabase
    .from('rubrics')
    .insert(rubric)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteRubric(rubricId: string): Promise<void> {
  const { error } = await supabase
    .from('rubrics')
    .delete()
    .eq('id', rubricId);

  if (error) throw error;
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
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

export async function createKnowledgeDocument(
  document: Omit<KnowledgeDocument, 'id' | 'created_at' | 'updated_at'>
): Promise<KnowledgeDocument> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .insert(document)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateKnowledgeDocument(
  documentId: string,
  updates: Partial<KnowledgeDocument>
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
  const { error } = await supabase
    .from('knowledge_documents')
    .delete()
    .eq('id', documentId);

  if (error) throw error;
}

// ─── Edge Function: Index Knowledge Document ─────────────────────────────────────

export async function indexKnowledgeDocument(
  knowledgeDocumentId: string
): Promise<IndexKnowledgeDocumentResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/index-knowledge-document`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ knowledgeDocumentId }),
    }
  );

  if (!response.ok) {
    throw new Error(`Indexing failed: ${response.statusText}`);
  }

  return response.json();
}

// ─── Session Operations ───────────────────────────────────────────────────────────

export async function getSessions(): Promise<Session[]> {
  await injectStoredToken();
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id, title, source, mode, duration_seconds, summary, when_timestamp, rubric_id,
      action_items(id, done)
    `)
    .order('when_timestamp', { ascending: false });

  if (error) throw error;

  return (data || []).map((s: any) => {
    const actions = s.action_items || [];
    const openCount = actions.filter((a: any) => !a.done).length;
    return { ...s, openCount };
  });
}

export async function getSessionById(sessionId: string): Promise<Session | null> {
  const { data: session, error: sesError } = await supabase
    .from('sessions')
    .select('*, messages:session_messages(*), action_items(*)')
    .eq('id', sessionId)
    .single();

  if (sesError) {
    if (sesError.code === 'PGRST116') return null;
    throw sesError;
  }

  return session;
}

export async function getSessionDetails(sessionId: string) {
  const { data: session, error: sesError } = await supabase
    .from('sessions')
    .select('*, messages:session_messages(*), action_items(*)')
    .eq('id', sessionId)
    .single();

  if (sesError) throw sesError;

  let rubric = null;

  if (session.rubric_id) {
    const { data, error: rubError } = await supabase
      .from('rubrics')
      .select('*, criteria:rubric_criteria(*)')
      .eq('id', session.rubric_id)
      .single();

    if (!rubError) rubric = data;
  }

  return {
    session,
    actionItems: session.action_items || [],
    rubric,
  };
}

export async function createSession(
  session: Omit<Session, 'id' | 'created_at' | 'session_messages'>
): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .insert(session)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Action Item Operations ─────────────────────────────────────────────────────

export async function getActionItems(): Promise<ActionItem[]> {
  await injectStoredToken();
  const { data, error } = await supabase
    .from('action_items')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createActionItem(
  item: Omit<ActionItem, 'id' | 'created_at' | 'updated_at'>
): Promise<ActionItem> {
  const { data, error } = await supabase
    .from('action_items')
    .insert(item)
    .select()
    .single();

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

  const { data: { user } } = await supabase.auth.getUser();

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
  const { error } = await supabase
    .from('action_items')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ─── Dashboard Chat Operations ────────────────────────────────────────────────────

export async function getDashboardChatMessages(sessionId?: string): Promise<DashboardChatMessage[]> {
  let query = supabase
    .from('dashboard_chat_messages')
    .select('*')
    .order('created_at', { ascending: true });

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createDashboardChatMessage(
  message: Omit<DashboardChatMessage, 'id' | 'created_at'>
): Promise<DashboardChatMessage> {
  const { data, error } = await supabase
    .from('dashboard_chat_messages')
    .insert(message)
    .select()
    .single();

  if (error) throw error;
  return data;
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

export async function createActivityLog(
  log: Omit<ActivityLog, 'id' | 'created_at'>
): Promise<ActivityLog> {
  const { data, error } = await supabase
    .from('activity_logs')
    .insert(log)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Edge Function: Summarize Session ─────────────────────────────────────────────

export async function summarizeSession(sessionId: string): Promise<SummarizeSessionResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-session`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ sessionId }),
    }
  );

  if (!response.ok) {
    throw new Error(`Summarization failed: ${response.statusText}`);
  }

  return response.json();
}

// ─── Edge Function: Extract Rubric ────────────────────────────────────────────────

export async function extractRubric(rubricId: string, filePath?: string): Promise<ExtractRubricResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-rubric`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ rubricId, filePath }),
    }
  );

  if (!response.ok) {
    throw new Error(`Rubric extraction failed: ${response.statusText}`);
  }

  return response.json();
}

// ─── Edge Function: Ensure File Search Store ─────────────────────────────────────

export async function ensureFileSearchStore() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ensure-file-search-store`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to ensure file search store: ${response.statusText}`);
  }

  return response.json();
}

// ─── Edge Function: Live Token ───────────────────────────────────────────────────

export async function getLiveToken(sessionId?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/live-token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ sessionId }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get live token: ${response.statusText}`);
  }

  return response.json();
}
