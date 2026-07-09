# StudyPilot Supabase + Gemini RAG Architecture Manual

This document gives AI agents and developers clear instructions for implementing the Supabase backend for **StudyPilot**, including **Gemini Live**, **Gemini Flash chat**, and **Gemini File Search managed RAG**.

StudyPilot is a Chrome/Edge extension and web dashboard for students. The extension provides live screen-aware academic coaching through Gemini Live. Supabase provides the backend layer: authentication, database, storage, Edge Functions, session memory, rubric management, dashboard synchronization, and metadata for Gemini File Search. Gemini File Search provides the managed RAG layer for uploaded rubrics, course notes, and academic documents.

---

## 1. Product Summary

StudyPilot helps students improve their academic work while they work, without doing the assignment for them.

Core user flow:

1. Student installs the Chrome/Edge extension.
2. Student uploads an assignment rubric or course document.
3. Supabase stores the original file and metadata.
4. A Supabase Edge Function indexes the document into Gemini File Search.
5. Student opens an essay, slide deck, PDF, LMS page, or study material.
6. Student starts a live coaching session.
7. Extension captures microphone audio and screen/tab frames.
8. Gemini Live gives real-time spoken coaching.
9. The extension saves transcript, session metadata, summary, and action items to Supabase.
10. The dashboard imports the session and lets the student continue in text chat.
11. Chat Coach uses Gemini Flash + Gemini File Search to answer with rubric/course-document grounding.

StudyPilot has two assistant modes:

```text
Live Coach
- Screen/tab sharing
- Microphone input
- Gemini Live WebSocket
- Voice output
- Live transcript capture

Chat Coach
- Text chat
- Uses rubric context
- Uses imported session context
- Uses previous chat history
- Uses Gemini File Search managed RAG for uploaded documents
- Streams Gemini Flash response
```

---

## 2. High-Level Architecture

```text
Chrome/Edge Extension
│
├── Side Panel UI
│   ├── Live Coach tab
│   ├── Chat tab
│   ├── Rubric tab
│   └── Session History tab
│
├── Offscreen Live Engine
│   ├── screen/tab capture
│   ├── microphone capture
│   ├── canvas JPEG frame capture
│   ├── Gemini Live WebSocket
│   ├── voice output playback
│   └── transcript collection
│
└── Supabase Backend
    │
    ├── Supabase Auth
    │   └── student accounts and JWT sessions
    │
    ├── Supabase Postgres
    │   ├── profiles
    │   ├── rubrics
    │   ├── rubric_criteria
    │   ├── knowledge_documents
    │   ├── sessions
    │   ├── session_messages
    │   ├── action_items
    │   ├── dashboard_chats
    │   ├── dashboard_chat_messages
    │   └── activity_logs
    │
    ├── Supabase Storage
    │   └── uploaded rubric PDFs / course documents
    │
    ├── Supabase Edge Functions
    │   ├── live-token
    │   ├── ensure-file-search-store
    │   ├── index-knowledge-document
    │   ├── socratic-coach
    │   ├── summarize-session
    │   ├── extract-rubric
    │   └── delete-knowledge-document
    │
    ├── Supabase Realtime
    │   └── updates dashboard when the extension imports a new session
    │
    └── Gemini Managed RAG
        ├── Gemini File Search stores
        ├── Gemini File Search documents
        ├── gemini-embedding-2
        └── Gemini Flash generation with File Search tool
```

---

## 3. Important Architectural Rules

### 3.1 Do not proxy live audio/screen frames through Supabase

Correct Live Coach flow:

```text
Extension asks Supabase Edge Function for Gemini ephemeral token
↓
Supabase Edge Function creates token using server-side Gemini API key
↓
Extension connects directly to Gemini Live WebSocket
↓
Extension streams microphone audio + screen frames directly to Gemini
↓
Extension saves transcript/session metadata to Supabase
```

Supabase should handle:

```text
auth
token brokering
database writes
rubric storage
document metadata
Gemini File Search indexing metadata
session summaries
dashboard chat
realtime sync
```

Gemini Live should handle:

```text
real-time screen-aware voice coaching
```

### 3.2 Do not build custom RAG for the MVP

For MVP, use **Gemini File Search** as the managed RAG layer.

Gemini File Search handles:

```text
file import
chunking
embedding
indexing
semantic retrieval
grounding chunks in model calls
```

Supabase handles:

```text
user ownership
file metadata
which Gemini file search store belongs to which user
which Gemini document belongs to which rubric/course doc
chat history
session memory
RLS and permissions
```

### 3.3 Keep app data and RAG data separate

Use Supabase as the source of truth for the app.

Use Gemini File Search as the retrieval index.

```text
Supabase = product database
Gemini File Search = searchable document index
Gemini Flash = answer generation
Gemini Live = real-time screen/voice interaction
```

---

## 4. Recommended Supabase Services

Use these Supabase products:

```text
Supabase Auth
- email login
- Google login optional
- JWT authentication for extension and dashboard

Supabase Postgres
- relational data model for profiles, rubrics, documents, sessions, messages, and action items

Supabase Storage
- original rubric PDFs/documents

Supabase Edge Functions
- secure Gemini API calls
- Gemini File Search store creation
- Gemini File Search document indexing
- streaming text chat via SSE
- summary/action item generation
- rubric extraction

Supabase Realtime
- dashboard auto-updates when extension imports a new session
```

---

## 5. Gemini Services Used

Use these Gemini services:

```text
Gemini Live API
- live screen-aware voice coaching
- extension connects directly with ephemeral token

Gemini Flash text model
- dashboard Chat Coach
- session summaries
- action item generation
- rubric extraction / cleanup

Gemini File Search
- managed RAG over rubrics and course documents
- stores document chunks and embeddings
- retrieved chunks are used as grounding context

Gemini embedding model
- models/gemini-embedding-2 for new File Search stores
```

Do not manually call embeddings for MVP unless Gemini File Search is not enough.

---

## 6. Environment Variables

Use these environment variables.

Frontend / extension:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Supabase Edge Functions secrets:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
GEMINI_TEXT_MODEL=gemini-3.5-flash
GEMINI_EMBEDDING_MODEL=models/gemini-embedding-2
```

Never expose these in the extension or browser:

```text
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
```

The extension/frontend may only use:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

---

## 7. Database Schema

Run this SQL in the Supabase SQL Editor.

> **Note on table order:** `sessions` must be created before `knowledge_documents` because `knowledge_documents` has a foreign key to `sessions`. The `rubrics ↔ knowledge_documents` circular FK is handled at the end with `ALTER TABLE`.

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Profiles
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    initials VARCHAR(10) NOT NULL,
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
    default_coach_mode TEXT DEFAULT 'essay' CHECK (default_coach_mode IN ('essay', 'lecture', 'reader')),
    ai_daily_limit INTEGER NOT NULL DEFAULT 50,
    gemini_file_search_store_name TEXT,
    gemini_file_search_store_display_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_profiles
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Shared daily AI request usage. One row per user per UTC day.
CREATE TABLE public.ai_usage (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    request_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, usage_date)
);

-- Rubrics
-- Note: knowledge_document_id FK is added later via ALTER TABLE
-- because knowledge_documents does not exist yet at this point.
CREATE TABLE public.rubrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    course TEXT NOT NULL,
    file_path TEXT,
    extracted_text TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    active BOOLEAN DEFAULT false,
    sessions_count INT DEFAULT 0,

    -- Optional direct pointers to the main RAG document for this rubric.
    -- Canonical document metadata lives in public.knowledge_documents.
    knowledge_document_id UUID,
    file_search_status TEXT DEFAULT 'not_indexed'
      CHECK (file_search_status IN ('not_indexed', 'pending', 'indexing', 'indexed', 'failed', 'deleted')),
    file_search_error TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_rubrics
BEFORE UPDATE ON public.rubrics
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE public.rubric_criteria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rubric_id UUID NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    score INT DEFAULT 0,
    max_score INT DEFAULT 4,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions imported from extension
-- Must be created before knowledge_documents because knowledge_documents references sessions.
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rubric_id UUID REFERENCES public.rubrics(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    source TEXT DEFAULT 'Chrome Extension',
    mode TEXT NOT NULL CHECK (mode IN ('Essay Coach', 'Presentation Coach', 'Study Coach', 'Lecture', 'Research Reader')),
    duration_seconds INT NOT NULL DEFAULT 0,
    page_title TEXT,
    page_url TEXT,
    summary TEXT,
    when_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Knowledge documents indexed into Gemini File Search.
-- This table is the Supabase-side metadata source for managed RAG documents.
-- Depends on sessions existing above.
CREATE TABLE public.knowledge_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Optional parent relationships
    rubric_id UUID REFERENCES public.rubrics(id) ON DELETE SET NULL,
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,

    title TEXT NOT NULL,
    document_type TEXT NOT NULL DEFAULT 'rubric'
      CHECK (document_type IN ('rubric', 'course_notes', 'essay_draft', 'slides', 'pdf', 'other')),

    -- Supabase Storage source
    storage_bucket TEXT DEFAULT 'rubrics',
    storage_path TEXT,
    mime_type TEXT,
    file_size_bytes BIGINT,

    -- Extracted text, useful for fallback and UI preview.
    extracted_text TEXT,

    -- Gemini File Search metadata
    gemini_file_name TEXT,
    gemini_file_search_store_name TEXT,
    gemini_file_search_document_name TEXT,
    gemini_file_search_display_name TEXT,
    embedding_model TEXT DEFAULT 'models/gemini-embedding-2',
    index_status TEXT DEFAULT 'pending'
      CHECK (index_status IN ('pending', 'uploading', 'indexing', 'indexed', 'failed', 'deleted')),
    index_error TEXT,
    indexed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_knowledge_documents
BEFORE UPDATE ON public.knowledge_documents
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TABLE public.session_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'ai', 'system')),
    message_text TEXT NOT NULL,
    time_offset_seconds INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Action items generated from sessions
CREATE TABLE public.action_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    rubric_id UUID REFERENCES public.rubrics(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    done BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_action_items
BEFORE UPDATE ON public.action_items
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Dashboard chat conversations
CREATE TABLE public.dashboard_chats (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'New chat',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER set_timestamp_dashboard_chats
BEFORE UPDATE ON public.dashboard_chats
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Dashboard chat messages. `chat_id` is nullable only for legacy rows.
CREATE TABLE public.dashboard_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    chat_id UUID REFERENCES public.dashboard_chats(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'ai', 'system')),
    text TEXT NOT NULL,

    -- Optional RAG metadata for UI/debugging
    used_file_search BOOLEAN DEFAULT false,
    file_search_store_name TEXT,
    grounding_metadata JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Recent activity log
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    details JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add FK after both tables exist
ALTER TABLE public.rubrics
ADD CONSTRAINT fk_rubrics_knowledge_document
FOREIGN KEY (knowledge_document_id)
REFERENCES public.knowledge_documents(id)
ON DELETE SET NULL;

-- Performance indexes
CREATE INDEX idx_rubrics_user ON public.rubrics(user_id);
CREATE INDEX idx_sessions_user ON public.sessions(user_id);
CREATE INDEX idx_action_items_user ON public.action_items(user_id);
CREATE INDEX idx_session_messages_session ON public.session_messages(session_id);
CREATE INDEX idx_activity_logs_user ON public.activity_logs(user_id);
CREATE INDEX idx_dashboard_chats_user_updated ON public.dashboard_chats(user_id, updated_at DESC);
CREATE INDEX idx_chat_messages_session ON public.dashboard_chat_messages(session_id);
CREATE INDEX idx_chat_messages_chat ON public.dashboard_chat_messages(chat_id);
CREATE INDEX idx_rubric_criteria_rubric ON public.rubric_criteria(rubric_id);
CREATE INDEX idx_knowledge_documents_user ON public.knowledge_documents(user_id);
CREATE INDEX idx_knowledge_documents_rubric ON public.knowledge_documents(rubric_id);
CREATE INDEX idx_knowledge_documents_status ON public.knowledge_documents(index_status);
CREATE INDEX idx_knowledge_documents_store ON public.knowledge_documents(gemini_file_search_store_name);

-- Keep conversations ordered by message activity.
CREATE OR REPLACE FUNCTION public.touch_dashboard_chat()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.dashboard_chats SET updated_at = NOW() WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog;

REVOKE EXECUTE ON FUNCTION public.touch_dashboard_chat() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER touch_dashboard_chat_on_message
AFTER INSERT ON public.dashboard_chat_messages
FOR EACH ROW WHEN (NEW.chat_id IS NOT NULL)
EXECUTE FUNCTION public.touch_dashboard_chat();

-- AI usage RPCs
-- consume_ai_request atomically reserves one request from a user's shared
-- daily AI pool. The conditional conflict update prevents concurrent callers
-- from exceeding profiles.ai_daily_limit.
CREATE OR REPLACE FUNCTION public.consume_ai_request(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
  v_count INTEGER;
BEGIN
  SELECT COALESCE(
    (
      SELECT profiles.ai_daily_limit
      FROM public.profiles
      WHERE profiles.id = p_user_id
    ),
    50
  ) INTO v_limit;

  SELECT COALESCE(
    (
      SELECT ai_usage.request_count
      FROM public.ai_usage
      WHERE ai_usage.user_id = p_user_id
        AND ai_usage.usage_date = CURRENT_DATE
    ),
    0
  ) INTO v_used;

  IF v_limit <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
  END IF;

  INSERT INTO public.ai_usage (user_id, usage_date, request_count)
  VALUES (p_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, usage_date) DO UPDATE
    SET request_count = ai_usage.request_count + 1,
        updated_at = NOW()
    WHERE ai_usage.request_count < v_limit
  RETURNING request_count INTO v_count;

  IF v_count IS NULL THEN
    SELECT COALESCE(
      (
        SELECT ai_usage.request_count
        FROM public.ai_usage
        WHERE ai_usage.user_id = p_user_id
          AND ai_usage.usage_date = CURRENT_DATE
      ),
      0
    ) INTO v_used;

    RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'used', v_count, 'limit', v_limit);
END;
$$;

-- get_ai_usage is callable by the signed-in browser and uses auth.uid() to
-- return only the current user's count and configured limit.
CREATE OR REPLACE FUNCTION public.get_ai_usage()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  SELECT COALESCE(
    (
      SELECT profiles.ai_daily_limit
      FROM public.profiles
      WHERE profiles.id = v_user_id
    ),
    50
  ) INTO v_limit;

  SELECT COALESCE(
    (
      SELECT ai_usage.request_count
      FROM public.ai_usage
      WHERE ai_usage.user_id = v_user_id
        AND ai_usage.usage_date = CURRENT_DATE
    ),
    0
  ) INTO v_used;

  RETURN jsonb_build_object('used', v_used, 'limit', v_limit);
END;
$$;
```

---

## 8. Auth Profile Trigger

Create a profile automatically when a user signs up.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, initials, theme, default_coach_mode)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    UPPER(SUBSTRING(COALESCE(NEW.raw_user_meta_data->>'name', NEW.email) FROM 1 FOR 1)),
    'dark',
    'essay'
  );

  INSERT INTO public.activity_logs (user_id, event_type, details)
  VALUES (NEW.id, 'account_created', '{"message": "Welcome to StudyPilot!"}');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 9. Rubric Session Count Trigger

Keep `rubrics.sessions_count` updated automatically.

```sql
CREATE OR REPLACE FUNCTION public.sync_rubric_sessions_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.rubrics
    SET sessions_count = sessions_count + 1
    WHERE id = NEW.rubric_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.rubrics
    SET sessions_count = GREATEST(0, sessions_count - 1)
    WHERE id = OLD.rubric_id;
  ELSIF (TG_OP = 'UPDATE' AND OLD.rubric_id IS DISTINCT FROM NEW.rubric_id) THEN
    UPDATE public.rubrics
    SET sessions_count = GREATEST(0, sessions_count - 1)
    WHERE id = OLD.rubric_id;

    UPDATE public.rubrics
    SET sessions_count = sessions_count + 1
    WHERE id = NEW.rubric_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_session_changed
AFTER INSERT OR DELETE OR UPDATE OF rubric_id ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.sync_rubric_sessions_count();
```

---

## 10. Row Level Security

Enable RLS on all tables.

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubric_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
```

Create policies.

```sql
-- Profiles
CREATE POLICY "Students can view their own profile details"
ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Students can modify their own profile preferences"
ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- AI usage
CREATE POLICY "Users read own ai usage"
ON public.ai_usage FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

GRANT SELECT ON TABLE public.ai_usage TO authenticated;

-- Rubrics
CREATE POLICY "Students can read their own rubrics"
ON public.rubrics FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Students can upload custom rubrics"
ON public.rubrics FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update their own rubrics"
ON public.rubrics FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Students can delete their own rubrics"
ON public.rubrics FOR DELETE USING (auth.uid() = user_id);

-- Rubric criteria
CREATE POLICY "Students can view criteria for their rubrics"
ON public.rubric_criteria FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.rubrics
    WHERE rubrics.id = rubric_criteria.rubric_id
    AND rubrics.user_id = auth.uid()
  )
);

CREATE POLICY "Students can add criteria to their rubrics"
ON public.rubric_criteria FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.rubrics
    WHERE rubrics.id = rubric_criteria.rubric_id
    AND rubrics.user_id = auth.uid()
  )
);

-- Knowledge documents
CREATE POLICY "Students can read their own knowledge documents"
ON public.knowledge_documents FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Students can insert their own knowledge documents"
ON public.knowledge_documents FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update their own knowledge documents"
ON public.knowledge_documents FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Students can delete their own knowledge documents"
ON public.knowledge_documents FOR DELETE USING (auth.uid() = user_id);

-- Sessions
CREATE POLICY "Students can read their own imported sessions"
ON public.sessions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Students can import new coaching sessions"
ON public.sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update their own sessions"
ON public.sessions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Students can delete their own sessions"
ON public.sessions FOR DELETE USING (auth.uid() = user_id);

-- Session messages
CREATE POLICY "Students can read transcripts from their sessions"
ON public.session_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.sessions
    WHERE sessions.id = session_messages.session_id
    AND sessions.user_id = auth.uid()
  )
);

CREATE POLICY "Students can save messages into transcripts"
ON public.session_messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sessions
    WHERE sessions.id = session_messages.session_id
    AND sessions.user_id = auth.uid()
  )
);

-- Action items
CREATE POLICY "Students can view their checklist tasks"
ON public.action_items FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Students can insert checklist tasks"
ON public.action_items FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update their checklist tasks"
ON public.action_items FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Students can delete their checklist tasks"
ON public.action_items FOR DELETE USING (auth.uid() = user_id);

-- Dashboard chats
CREATE POLICY "Students can view their own dashboard chats"
ON public.dashboard_chats FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Students can create their own dashboard chats"
ON public.dashboard_chats FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update their own dashboard chats"
ON public.dashboard_chats FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can delete their own dashboard chats"
ON public.dashboard_chats FOR DELETE USING (auth.uid() = user_id);

-- Dashboard chat messages
CREATE POLICY "Students can view dashboard follow-up chat histories"
ON public.dashboard_chat_messages FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Students can post messages to dashboard follow-up chats"
ON public.dashboard_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can delete their own dashboard follow-up chat messages"
ON public.dashboard_chat_messages FOR DELETE USING (auth.uid() = user_id);

-- Activity logs
CREATE POLICY "Students can view their recent action logs feed"
ON public.activity_logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Students can insert their own activity logs"
ON public.activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Database function access
REVOKE EXECUTE ON FUNCTION public.consume_ai_request(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_request(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_ai_usage() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_usage() TO authenticated;
```

---

## 11. Storage Buckets

Create a Supabase Storage bucket:

```text
rubrics
```

Recommended bucket settings:

```text
Private bucket: yes
Public access: no
Allowed file types:
- pdf
- txt
- docx optional later
Maximum file size:
- 10MB for MVP
```

Store files under this path pattern:

```text
rubrics/{user_id}/{rubric_id}/{filename}
```

Save that path to:

```text
rubrics.file_path
knowledge_documents.storage_path
```

The original file lives in Storage. The extracted/cleaned text lives in:

```text
rubrics.extracted_text
knowledge_documents.extracted_text
```

---

## 12. Gemini File Search RAG Strategy

### 12.1 Use managed RAG first

For MVP, do not build custom chunking, embedding tables, or vector search in Supabase.

Use Gemini File Search.

Gemini File Search should own:

```text
chunking
embedding creation
semantic retrieval
document index storage
retrieved document chunks
```

Supabase should own:

```text
which user owns which file
which file belongs to which rubric/session
file search store name
file search document name
indexing status
UI metadata
chat/session history
```

### 12.2 Store strategy

Recommended MVP strategy:

```text
One Gemini File Search store per user.
```

Why:

```text
- simple ownership model
- easy to attach the user's whole academic context to Chat Coach
- easy to store store name on profiles
- easy to delete all user RAG data later
```

Store the Gemini store name here:

```text
profiles.gemini_file_search_store_name
```

For every uploaded document, store the Gemini document name here:

```text
knowledge_documents.gemini_file_search_document_name
```

Optional future strategy:

```text
One File Search store per course or assignment.
```

Use that later if retrieval becomes too broad.

### 12.3 Recommended store naming

Gemini File Search store names are globally scoped. Do not assume display names are unique.

Use the returned Gemini `name` field as the canonical identifier.

Suggested display name:

```text
studypilot-user-{user_id_short}
```

Canonical value saved in Supabase:

```text
fileSearchStores/abc123...
```

### 12.4 Recommended embedding model

For new File Search stores, use:

```text
models/gemini-embedding-2
```

Store it in:

```text
knowledge_documents.embedding_model
```

### 12.5 Supported document types for MVP

Use:

```text
pdf
txt
markdown
docx optional later
```

Do not use Gemini File Search for audio/video in MVP.

---

## 13. Edge Functions

Create these Edge Functions.

```text
supabase/functions/
  live-token/
    index.ts

  ensure-file-search-store/
    index.ts

  index-knowledge-document/
    index.ts

  socratic-coach/
    index.ts

  summarize-session/
    index.ts

  extract-rubric/
    index.ts

  delete-knowledge-document/
    index.ts
```

### 13.1 `live-token`

Purpose:

```text
Create a short-lived Gemini Live ephemeral token for the extension.
```

Input:

```json
{
  "sessionId": "uuid"
}
```

Output:

```json
{
  "ephemeralToken": "...",
  "expiresAt": "..."
}
```

Rules:

```text
- Verify Supabase JWT from Authorization header.
- Never expose GEMINI_API_KEY to the extension.
- Use GEMINI_API_KEY only inside the Edge Function.
- Return only the ephemeral token.
- The extension uses that token to connect directly to Gemini Live.
```

### 13.2 `ensure-file-search-store`

Purpose:

```text
Create or return the user's Gemini File Search store.
```

Input:

```json
{}
```

Output:

```json
{
  "fileSearchStoreName": "fileSearchStores/...",
  "displayName": "studypilot-user-..."
}
```

Process:

```text
1. Verify Supabase JWT.
2. Fetch profile.
3. If profiles.gemini_file_search_store_name exists, return it.
4. Otherwise call Gemini File Search Stores create API.
5. Use embedding model models/gemini-embedding-2.
6. Save returned store name to profiles.gemini_file_search_store_name.
7. Return store name.
```

Rules:

```text
- Only Edge Functions may call Gemini File Search APIs.
- Never expose GEMINI_API_KEY to extension/dashboard.
- Always save the returned Gemini store name, not just the display name.
```

### 13.3 `index-knowledge-document`

Purpose:

```text
Upload/import a Supabase Storage document into Gemini File Search.
```

Input:

```json
{
  "knowledgeDocumentId": "uuid"
}
```

Output:

```json
{
  "knowledgeDocumentId": "uuid",
  "status": "indexed",
  "fileSearchStoreName": "fileSearchStores/...",
  "fileSearchDocumentName": "fileSearchStores/.../documents/..."
}
```

Process:

```text
1. Verify Supabase JWT.
2. Fetch knowledge_documents row and validate user ownership.
3. Ensure the user has a Gemini File Search store.
4. Download original file from Supabase Storage using service role.
5. Upload/import the file into Gemini File Search store.
6. Poll the Gemini operation until indexing is done.
7. Update knowledge_documents:
   - gemini_file_search_store_name
   - gemini_file_search_document_name
   - gemini_file_name if available
   - index_status='indexed'
   - indexed_at=now()
8. If document belongs to a rubric, update rubrics.file_search_status='indexed'.
9. Insert activity_logs event_type='document_indexed'.
```

Failure behavior:

```text
- Set knowledge_documents.index_status='failed'.
- Store error message in knowledge_documents.index_error.
- If related to rubric, set rubrics.file_search_status='failed'.
- Return a safe error message to client.
```

### 13.4 `socratic-coach`

Purpose:

```text
Dashboard Chat Coach with session/rubric context and Gemini File Search managed RAG.
Streams Gemini Flash text response through SSE.
Saves user message and final AI response to dashboard_chat_messages.
```

Input:

```json
{
  "chatId": "uuid",
  "userMessage": "What should I revise first?"
}
```

`chatId` is optional for backward compatibility. When present, the function
loads `dashboard_chats.id = chatId` for the authenticated user, returns 404 if
it does not exist, and uses that row's `session_id` instead of any body
`sessionId`. New dashboard clients send `chatId` only. Old clients may continue
to send `sessionId` without `chatId`.

Output:

```text
SSE stream:
data: {"text":"Start with your thesis..."}
data: {"text":" The rubric asks..."}
data: [DONE]
```

Context loaded from Supabase:

```text
- user profile
- selected session
- session summary
- session_messages transcript
- active rubric
- rubric_criteria
- recent dashboard_chat_messages
- profiles.gemini_file_search_store_name
- indexed knowledge_documents
```

Chat-memory scoping rules:

```text
- With chatId: query only dashboard_chat_messages.chat_id = chatId.
- Without chatId and with sessionId: query session_id = sessionId and chat_id IS NULL.
- Without either: query only chat_id IS NULL.
- Existing nullable chat_id rows are legacy history. They are never included in a chat-scoped request.
```

Gemini call should use:

```text
model: GEMINI_TEXT_MODEL, for example gemini-3.5-flash
tools:
  fileSearch:
    fileSearchStoreNames:
      - profiles.gemini_file_search_store_name
```

Prompt behavior:

```text
You are StudyPilot, a Socratic academic coach.

You may:
- explain rubric criteria
- reference imported session summaries
- reference transcript highlights
- use retrieved File Search context from uploaded documents
- help turn feedback into action items
- ask guiding questions
- suggest revision strategies

You must not:
- write full paragraphs for the student
- complete assignments
- generate final answers meant for submission
- invent rubric criteria
- ignore academic integrity
```

RAG behavior:

```text
- Prefer retrieved rubric/course-document context when available.
- If File Search returns no relevant context, say that the uploaded documents do not contain enough information.
- Do not pretend to have read a document unless it is indexed.
- Do not use RAG for live audio/screen frames.
- Save grounding metadata to dashboard_chat_messages.grounding_metadata when available.
```

### 13.5 `summarize-session`

Purpose:

```text
After a Live Coach session ends, generate:
- short session summary
- main feedback points
- action items
- suggested follow-up prompts
```

Input:

```json
{
  "sessionId": "uuid"
}
```

Output:

```json
{
  "summary": "Your thesis is clear, but paragraph 2 summarizes evidence instead of analyzing it.",
  "actionItems": [
    "Make the thesis more specific",
    "Add analysis after the quote in paragraph 2",
    "Connect the conclusion back to the central claim"
  ],
  "followUpPrompts": [
    "What should I revise first?",
    "Explain the evidence criterion",
    "Ask me Socratic questions about my thesis"
  ]
}
```

Database writes:

```text
- update sessions.summary
- insert action_items
- insert activity_logs event_type=session_summarized
```

RAG note:

```text
summarize-session may use rubric criteria from Supabase.
It does not need Gemini File Search unless you want the summary grounded in uploaded course documents.
```

### 13.6 `extract-rubric`

Purpose:

```text
Extract and clean rubric text from uploaded rubric files.
Optionally identify criteria and insert rubric_criteria rows.
```

Input:

```json
{
  "rubricId": "uuid",
  "filePath": "rubrics/user/rubric/file.pdf"
}
```

Output:

```json
{
  "rubricId": "uuid",
  "extractedText": "...",
  "criteria": [
    { "name": "Thesis clarity", "max_score": 4 },
    { "name": "Evidence quality", "max_score": 4 },
    { "name": "Analysis", "max_score": 4 }
  ]
}
```

Database writes:

```text
- update rubrics.extracted_text
- insert rubric_criteria rows
- create or update knowledge_documents row
- insert activity_logs event_type=rubric_extracted
```

Recommended follow-up:

```text
After extracting rubric text, call index-knowledge-document so the rubric becomes searchable through Gemini File Search.
```

### 13.7 `delete-knowledge-document`

Purpose:

```text
Delete a user's document from Supabase metadata/storage and Gemini File Search.
```

Input:

```json
{
  "knowledgeDocumentId": "uuid"
}
```

Process:

```text
1. Verify Supabase JWT.
2. Fetch knowledge_documents row and validate user ownership.
3. If gemini_file_search_document_name exists, delete it from Gemini File Search.
4. Delete Supabase Storage object if requested.
5. Update index_status='deleted' or delete the metadata row.
6. If related to rubric, update rubrics.file_search_status='deleted'.
7. Insert activity_logs event_type='document_deleted'.
```

---

## 14. Frontend Supabase Client

Create:

```text
src/lib/supabaseClient.ts
```

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are missing.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
```

---

## 15. TypeScript Models

Create:

```text
src/lib/studypilot-types.ts
```

```typescript
export interface Profile {
  id: string;
  name: string;
  initials: string;
  email: string;
  theme: 'dark' | 'light';
  default_coach_mode: 'essay' | 'lecture' | 'reader';
  gemini_file_search_store_name?: string | null;
  gemini_file_search_store_display_name?: string | null;
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
  summary?: string | null;
  when_timestamp: string;
  session_messages?: TranscriptMessage[];
}

export interface ActionItem {
  id: string;
  user_id: string;
  session_id?: string | null;
  rubric_id?: string | null;
  text: string;
  done: boolean;
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
```

---

## 16. Frontend Data Operators

Create:

```text
src/lib/studypilot-api.ts
```

Include these functions.

```typescript
import { supabase } from './supabaseClient';

export async function getProfile() {
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

export async function getRubrics() {
  const { data, error } = await supabase
    .from('rubrics')
    .select('*, criteria:rubric_criteria(*)')
    .order('uploaded_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function setActiveRubric(activeId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error: clearActive } = await supabase
    .from('rubrics')
    .update({ active: false })
    .eq('user_id', user.id);

  if (clearActive) throw clearActive;

  const { error: setActive } = await supabase
    .from('rubrics')
    .update({ active: true })
    .eq('id', activeId);

  if (setActive) throw setActive;
}

export async function getKnowledgeDocuments() {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function indexKnowledgeDocument(knowledgeDocumentId: string) {
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

export async function getSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id, title, source, mode, duration_seconds, summary, when_timestamp, rubric_id,
      action_items(id, done)
    `)
    .order('when_timestamp', { ascending: false });

  if (error) throw error;

  return data.map((s: any) => {
    const actions = s.action_items || [];
    const openCount = actions.filter((a: any) => !a.done).length;
    return { ...s, openCount };
  });
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

export async function toggleActionItem(id: string, currentDone: boolean) {
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
```

---

## 17. Streaming Chat Client

Create:

```text
src/lib/socraticCoach.ts
```

```typescript
import { supabase } from './supabaseClient';

export async function sendCoachingMessage(
  sessionId: string,
  userMessageText: string,
  onTokenReceived: (token: string) => void,
  onStreamComplete: () => void,
  onStreamError: (err: unknown) => void
) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Student is not signed in.');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/socratic-coach`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          sessionId,
          userMessage: userMessageText,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Edge Function failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error('No stream body available.');

    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const clean = line.trim();
        if (!clean) continue;

        if (clean.startsWith('data: ')) {
          const content = clean.substring(6).trim();

          if (content === '[DONE]') {
            onStreamComplete();
            return;
          }

          try {
            const parsed = JSON.parse(content);
            if (parsed.text) onTokenReceived(parsed.text);
          } catch {
            // Ignore partial malformed chunks.
          }
        }
      }
    }

    onStreamComplete();
  } catch (error) {
    onStreamError(error);
  }
}
```

---

## 18. Supabase Realtime

Use Realtime so the dashboard updates automatically when the extension saves a new session or when a document is indexed.

```typescript
import { useEffect } from 'react';
import { supabase } from './supabaseClient';

export function useRealtimeSessionListener(
  userId: string,
  onNewSessionImported: (newSession: any) => void
) {
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('studypilot_extension_sync')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sessions',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const { data: completedSession, error } = await supabase
            .from('sessions')
            .select(`
              id, title, source, mode, duration_seconds, summary, when_timestamp, rubric_id,
              action_items(id, done)
            `)
            .eq('id', payload.new.id)
            .single();

          if (!error && completedSession) {
            onNewSessionImported(completedSession);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onNewSessionImported]);
}

export function useRealtimeKnowledgeDocumentListener(
  userId: string,
  onDocumentUpdated: (document: any) => void
) {
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('studypilot_rag_sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'knowledge_documents',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onDocumentUpdated(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onDocumentUpdated]);
}
```

---

## 19. Extension Session Import Flow

When a user stops a live coaching session, the extension should save the session to Supabase.

Flow:

```text
1. User clicks Stop Session.
2. Extension collects:
   - title
   - rubric_id
   - source
   - mode
   - duration_seconds
   - page_title
   - page_url
   - transcript messages
3. Extension inserts into sessions.
4. Extension inserts transcript rows into session_messages.
5. Extension calls summarize-session Edge Function.
6. Edge Function updates sessions.summary.
7. Edge Function inserts action_items.
8. Dashboard receives Realtime session insert.
9. User can click Continue in chat.
```

Pseudo-code:

```typescript
async function saveLiveSession(payload) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      rubric_id: payload.rubricId,
      title: payload.title,
      source: 'Chrome Extension',
      mode: 'Essay Coach',
      duration_seconds: payload.durationSeconds,
      page_title: payload.pageTitle,
      page_url: payload.pageUrl,
    })
    .select()
    .single();

  if (sessionError) throw sessionError;

  const messages = payload.transcript.map((m) => ({
    session_id: session.id,
    role: m.role,
    message_text: m.text,
    time_offset_seconds: m.timeOffsetSeconds || 0,
  }));

  if (messages.length > 0) {
    const { error: messagesError } = await supabase
      .from('session_messages')
      .insert(messages);

    if (messagesError) throw messagesError;
  }

  await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ sessionId: session.id }),
  });

  return session;
}
```

---

## 20. Rubric Upload + RAG Indexing Flow

When a user uploads a rubric:

```text
1. User selects rubric PDF/TXT in dashboard or extension.
2. Client uploads original file to Supabase Storage bucket rubrics.
3. Client inserts rubrics row.
4. Client inserts knowledge_documents row with:
   - document_type='rubric'
   - storage_bucket='rubrics'
   - storage_path='rubrics/{user_id}/{rubric_id}/{filename}'
   - index_status='pending'
5. Client calls extract-rubric Edge Function.
6. extract-rubric updates rubrics.extracted_text and inserts rubric_criteria.
7. Client or extract-rubric calls index-knowledge-document.
8. index-knowledge-document imports file into Gemini File Search.
9. Edge Function updates knowledge_documents.index_status='indexed'.
10. Dashboard Realtime updates indexing status.
11. Chat Coach can now use the rubric through Gemini File Search.
```

---

## 21. AI Prompting Rules for All Backend Functions

All StudyPilot AI prompts must follow these rules.

```text
StudyPilot is an academic coach, not an assignment writer.

Allowed:
- explain rubric criteria
- critique structure, clarity, evidence, and analysis
- ask Socratic questions
- suggest revision strategies
- help create action items
- summarize feedback
- refer to visible work or imported session context
- use retrieved File Search context from uploaded rubrics/course docs

Not allowed:
- writing full paragraphs for the student
- completing assignments
- generating final answers meant for submission
- fabricating rubric criteria
- bypassing academic integrity
- giving guaranteed grade predictions
- claiming a document says something unless it appears in provided/retrieved context
```

Example refusal:

```text
I can’t write the introduction for you, but I can help you improve it. What is the main claim you want your reader to believe?
```

RAG-specific rules:

```text
- If retrieved context is missing, say what is missing.
- If the uploaded rubric is not indexed yet, tell the user to wait or use extracted text fallback.
- Prefer direct rubric criteria over generic writing advice.
- Use session summary and transcript context for follow-up coaching.
- Do not expose raw internal document IDs to the user.
```

---

## 22. MVP Build Order

Build in this order:

```text
1. Supabase project
2. Auth
3. Postgres schema
4. RLS policies
5. Storage bucket for rubrics
6. Frontend Supabase client
7. live-token Edge Function
8. Extension direct Gemini Live connection
9. Sessions + session_messages inserts
10. summarize-session Edge Function
11. Chat Coach / socratic-coach Edge Function without File Search
12. Dashboard Realtime sync
13. Rubric upload and extraction
14. ensure-file-search-store Edge Function
15. index-knowledge-document Edge Function
16. Update socratic-coach to use Gemini File Search
17. RAG status UI in dashboard
18. Polish UX
```

---

## 23. Team Responsibilities

Suggested three-person split:

```text
Developer 1: Extension + Gemini Live
- side panel UI
- offscreen document
- screen capture
- mic capture
- Gemini Live WebSocket
- voice output
- live transcript

Developer 2: Supabase Core
- Supabase project
- auth
- schema
- RLS
- storage
- live-token
- session import API/data functions
- knowledge_documents table

Developer 3: AI Backend + Dashboard Memory + RAG
- ensure-file-search-store
- index-knowledge-document
- socratic-coach
- summarize-session
- extract-rubric
- prompt rules
- action items
- Realtime dashboard sync
```

---

## 24. What Not To Build Yet

Do not build these in the MVP:

```text
custom vector database
manual embedding table in Supabase
custom chunking pipeline
professor dashboard
class/team management
complex analytics
billing
Firefox support
mobile app
native desktop overlay
long-term weak-area tracking
advanced grading predictions
```

---

## 25. Success Criteria

MVP is successful when:

```text
1. User can log in.
2. User can upload/select a rubric.
3. Rubric is saved to Supabase Storage.
4. Rubric metadata is saved to Supabase Postgres.
5. Rubric is indexed into Gemini File Search.
6. User can start a live extension session.
7. Extension connects to Gemini Live using an ephemeral token.
8. User can talk while sharing screen/tab.
9. Gemini responds by voice.
10. Session transcript saves to Supabase.
11. Session summary and action items are generated.
12. Dashboard imports the session automatically.
13. User can continue in dashboard chat using that session and rubric as context.
14. Chat Coach uses Gemini File Search when relevant.
15. Chat Coach refuses to write assignments and coaches instead.
```

---

## 26. Instruction to AI Agents

When implementing this backend, follow these rules:

```text
- Do not proxy Gemini Live audio/screen frames through Supabase.
- Do not expose GEMINI_API_KEY or SUPABASE_SERVICE_ROLE_KEY to the extension/frontend.
- Use Supabase Auth JWTs for all protected requests.
- Keep session_messages and dashboard_chat_messages separate.
- Save original rubric files to Supabase Storage and extracted text to Postgres.
- Use Gemini File Search for managed RAG.
- Do not build custom embeddings/vector storage for MVP.
- Store Gemini File Search store/document names in Supabase.
- Use RLS on all user-owned tables.
- Use Edge Functions for Gemini calls that require the secret API key.
- Prefer simple relational data over complex nested JSON.
- Make the dashboard feel like the memory layer of the extension.
- Keep academic integrity rules in every AI prompt.
```
