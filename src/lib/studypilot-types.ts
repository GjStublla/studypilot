// TypeScript type definitions for StudyPilot Supabase schema.
//
// These types match the database schema defined in context/supabase/supabase.md
// and are used throughout the frontend for type safety.

export interface Profile {
  id: string;
  name: string;
  initials: string;
  email: string;
  theme: 'dark' | 'light';
  default_coach_mode: 'essay' | 'lecture' | 'reader';
  gemini_file_search_store_name?: string | null;
  gemini_file_search_store_display_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Criterion {
  id?: string;
  name: string;
  score?: number;
  max_score: number;
}

export interface Rubric {
  id: string;
  user_id: string;
  title: string;
  course: string;
  file_path?: string | null;
  extracted_text?: string | null;
  knowledge_document_id?: string | null;
  file_search_status?: 'not_indexed' | 'pending' | 'indexing' | 'indexed' | 'failed' | 'deleted';
  file_search_error?: string | null;
  uploaded_at: string;
  active: boolean;
  sessions_count: number;
  criteria?: Criterion[];
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  user_id: string;
  rubric_id?: string | null;
  session_id?: string | null;
  title: string;
  document_type: 'rubric' | 'course_notes' | 'essay_draft' | 'slides' | 'pdf' | 'other';
  storage_bucket?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  extracted_text?: string | null;
  gemini_file_name?: string | null;
  gemini_file_search_store_name?: string | null;
  gemini_file_search_document_name?: string | null;
  gemini_file_search_display_name?: string | null;
  embedding_model?: string | null;
  index_status: 'pending' | 'uploading' | 'indexing' | 'indexed' | 'failed' | 'deleted';
  index_error?: string | null;
  indexed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptMessage {
  id?: string;
  role: 'user' | 'ai' | 'system';
  message_text: string;
  time_offset_seconds: number;
}

export interface Session {
  id: string;
  user_id: string;
  rubric_id?: string | null;
  title: string;
  source: string;
  mode: 'Essay Coach' | 'Presentation Coach' | 'Study Coach' | 'Lecture' | 'Research Reader';
  duration_seconds: number;
  page_title?: string | null;
  page_url?: string | null;
  screenshot_path?: string | null;
  summary?: string | null;
  when_timestamp: string;
  session_messages?: TranscriptMessage[];
  created_at: string;
}

export interface ActionItem {
  id: string;
  user_id: string;
  session_id?: string | null;
  rubric_id?: string | null;
  text: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}

export interface DashboardChatMessage {
  id: string;
  user_id: string;
  session_id?: string | null;
  role: 'user' | 'ai' | 'system';
  text: string;
  used_file_search?: boolean;
  file_search_store_name?: string | null;
  grounding_metadata?: unknown;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  event_type: string;
  details: {
    session_title?: string;
    action_text?: string;
    rubric_name?: string;
    document_title?: string;
    message?: string;
  };
  created_at: string;
}

// Edge Function request/response types

export interface LiveTokenRequest {
  sessionId?: string;
}

export interface LiveTokenResponse {
  ephemeralToken: string;
  expiresAt: string;
}

export interface EnsureFileSearchStoreResponse {
  fileSearchStoreName: string;
  displayName: string;
}

export interface IndexKnowledgeDocumentRequest {
  knowledgeDocumentId: string;
}

export interface IndexKnowledgeDocumentResponse {
  knowledgeDocumentId: string;
  status: 'indexed' | 'failed';
  fileSearchStoreName: string;
  fileSearchDocumentName: string;
  error?: string;
}

export interface SocraticCoachRequest {
  sessionId?: string;
  userMessage: string;
  history?: Array<{ role: 'user' | 'ai' | 'system'; text: string }>;
  images?: Array<{ mimeType: string; data: string }>;
}

export interface SocraticCoachStreamChunk {
  text: string;
}

export interface SummarizeSessionRequest {
  sessionId: string;
  transcript?: string;
  mode?: string;
}

export interface SummarizeSessionResponse {
  summary: string;
  actionItems: string[];
  followUpPrompts: string[];
}

export interface ExtractRubricRequest {
  rubricId: string;
  filePath?: string;
}

export interface ExtractRubricResponse {
  rubricId: string;
  extractedText: string;
  criteria: Array<{ name: string; max_score: number }>;
}

export interface DeleteKnowledgeDocumentRequest {
  knowledgeDocumentId: string;
}
