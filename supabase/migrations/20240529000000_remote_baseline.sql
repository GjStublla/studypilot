-- Remote schema baseline dumped from studypilot (rqszloxxegvxaedptcqj).
-- Placed before incremental migrations so `supabase db reset` can recreate
-- the application from an empty local database.



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."consume_ai_request"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_limit integer;
  v_used integer;
  v_count integer;
  v_today date := (now() at time zone 'utc')::date;
begin
  select coalesce(
    (
      select profiles.ai_daily_limit
      from public.profiles
      where profiles.id = p_user_id
    ),
    50
  ) into v_limit;

  select coalesce(
    (
      select ai_usage.request_count
      from public.ai_usage
      where ai_usage.user_id = p_user_id
        and ai_usage.usage_date = v_today
    ),
    0
  ) into v_used;

  if v_limit <= 0 then
    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
  end if;

  insert into public.ai_usage (user_id, usage_date, request_count)
  values (p_user_id, v_today, 1)
  on conflict (user_id, usage_date) do update
    set request_count = ai_usage.request_count + 1,
        updated_at = now()
    where ai_usage.request_count < v_limit
  returning request_count into v_count;

  if v_count is null then
    select coalesce(
      (
        select ai_usage.request_count
        from public.ai_usage
        where ai_usage.user_id = p_user_id
          and ai_usage.usage_date = v_today
      ),
      0
    ) into v_used;

    return jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_count, 'limit', v_limit);
end;
$$;


ALTER FUNCTION "public"."consume_ai_request"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ai_usage"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_used integer;
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_user_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  select coalesce(
    (
      select profiles.ai_daily_limit
      from public.profiles
      where profiles.id = v_user_id
    ),
    50
  ) into v_limit;

  select coalesce(
    (
      select ai_usage.request_count
      from public.ai_usage
      where ai_usage.user_id = v_user_id
        and ai_usage.usage_date = v_today
    ),
    0
  ) into v_used;

  return jsonb_build_object('used', v_used, 'limit', v_limit);
end;
$$;


ALTER FUNCTION "public"."get_ai_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_rubric_sessions_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "public"."sync_rubric_sessions_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_dashboard_chat"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
begin
  update public.dashboard_chats set updated_at = now() where id = new.chat_id;
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_dashboard_chat"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_set_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_set_timestamp"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."action_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "rubric_id" "uuid",
    "text" "text" NOT NULL,
    "done" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."action_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "details" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage" (
    "user_id" "uuid" NOT NULL,
    "usage_date" "date" DEFAULT (("now"() AT TIME ZONE 'utc'::"text"))::"date" NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dashboard_chat_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "role" "text" NOT NULL,
    "text" "text" NOT NULL,
    "used_file_search" boolean DEFAULT false,
    "file_search_store_name" "text",
    "grounding_metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "chat_id" "uuid",
    CONSTRAINT "dashboard_chat_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'ai'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."dashboard_chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dashboard_chats" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "title" "text" DEFAULT 'New chat'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dashboard_chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."knowledge_documents" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rubric_id" "uuid",
    "session_id" "uuid",
    "title" "text" NOT NULL,
    "document_type" "text" DEFAULT 'rubric'::"text" NOT NULL,
    "storage_bucket" "text" DEFAULT 'rubrics'::"text",
    "storage_path" "text",
    "mime_type" "text",
    "file_size_bytes" bigint,
    "extracted_text" "text",
    "gemini_file_name" "text",
    "gemini_file_search_store_name" "text",
    "gemini_file_search_document_name" "text",
    "gemini_file_search_display_name" "text",
    "embedding_model" "text" DEFAULT 'models/gemini-embedding-2'::"text",
    "index_status" "text" DEFAULT 'pending'::"text",
    "index_error" "text",
    "indexed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "knowledge_documents_document_type_check" CHECK (("document_type" = ANY (ARRAY['rubric'::"text", 'course_notes'::"text", 'essay_draft'::"text", 'slides'::"text", 'pdf'::"text", 'other'::"text"]))),
    CONSTRAINT "knowledge_documents_index_status_check" CHECK (("index_status" = ANY (ARRAY['pending'::"text", 'uploading'::"text", 'indexing'::"text", 'indexed'::"text", 'failed'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."knowledge_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "initials" character varying(10) NOT NULL,
    "theme" "text" DEFAULT 'dark'::"text",
    "default_coach_mode" "text" DEFAULT 'essay'::"text",
    "gemini_file_search_store_name" "text",
    "gemini_file_search_store_display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "ai_daily_limit" integer DEFAULT 50 NOT NULL,
    CONSTRAINT "profiles_default_coach_mode_check" CHECK (("default_coach_mode" = ANY (ARRAY['essay'::"text", 'lecture'::"text", 'reader'::"text"]))),
    CONSTRAINT "profiles_theme_check" CHECK (("theme" = ANY (ARRAY['dark'::"text", 'light'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rubric_criteria" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "rubric_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "score" integer DEFAULT 0,
    "max_score" integer DEFAULT 4,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rubric_criteria" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rubrics" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "course" "text" NOT NULL,
    "file_path" "text",
    "extracted_text" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"(),
    "active" boolean DEFAULT false,
    "sessions_count" integer DEFAULT 0,
    "knowledge_document_id" "uuid",
    "file_search_status" "text" DEFAULT 'not_indexed'::"text",
    "file_search_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "rubrics_file_search_status_check" CHECK (("file_search_status" = ANY (ARRAY['not_indexed'::"text", 'pending'::"text", 'indexing'::"text", 'indexed'::"text", 'failed'::"text", 'deleted'::"text"])))
);


ALTER TABLE "public"."rubrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "message_text" "text" NOT NULL,
    "time_offset_seconds" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "session_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'ai'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."session_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sessions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rubric_id" "uuid",
    "title" "text" NOT NULL,
    "source" "text" DEFAULT 'Chrome Extension'::"text",
    "mode" "text" NOT NULL,
    "duration_seconds" integer DEFAULT 0 NOT NULL,
    "page_title" "text",
    "page_url" "text",
    "summary" "text",
    "when_timestamp" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "screenshot_path" "text",
    CONSTRAINT "sessions_mode_check" CHECK (("mode" = ANY (ARRAY['Essay Coach'::"text", 'Presentation Coach'::"text", 'Study Coach'::"text", 'Lecture'::"text", 'Research Reader'::"text"])))
);


ALTER TABLE "public"."sessions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("user_id", "usage_date");



ALTER TABLE ONLY "public"."dashboard_chat_messages"
    ADD CONSTRAINT "dashboard_chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_chats"
    ADD CONSTRAINT "dashboard_chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."knowledge_documents"
    ADD CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rubric_criteria"
    ADD CONSTRAINT "rubric_criteria_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rubrics"
    ADD CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_messages"
    ADD CONSTRAINT "session_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_action_items_user" ON "public"."action_items" USING "btree" ("user_id");



CREATE INDEX "idx_activity_logs_user" ON "public"."activity_logs" USING "btree" ("user_id");



CREATE INDEX "idx_chat_messages_chat" ON "public"."dashboard_chat_messages" USING "btree" ("chat_id");



CREATE INDEX "idx_chat_messages_session" ON "public"."dashboard_chat_messages" USING "btree" ("session_id");



CREATE INDEX "idx_dashboard_chats_user_updated" ON "public"."dashboard_chats" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "idx_knowledge_documents_rubric" ON "public"."knowledge_documents" USING "btree" ("rubric_id");



CREATE INDEX "idx_knowledge_documents_status" ON "public"."knowledge_documents" USING "btree" ("index_status");



CREATE INDEX "idx_knowledge_documents_store" ON "public"."knowledge_documents" USING "btree" ("gemini_file_search_store_name");



CREATE INDEX "idx_knowledge_documents_user" ON "public"."knowledge_documents" USING "btree" ("user_id");



CREATE INDEX "idx_rubric_criteria_rubric" ON "public"."rubric_criteria" USING "btree" ("rubric_id");



CREATE INDEX "idx_rubrics_user" ON "public"."rubrics" USING "btree" ("user_id");



CREATE INDEX "idx_session_messages_session" ON "public"."session_messages" USING "btree" ("session_id");



CREATE INDEX "idx_sessions_user" ON "public"."sessions" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "on_session_changed" AFTER INSERT OR DELETE OR UPDATE OF "rubric_id" ON "public"."sessions" FOR EACH ROW EXECUTE FUNCTION "public"."sync_rubric_sessions_count"();



CREATE OR REPLACE TRIGGER "set_timestamp_action_items" BEFORE UPDATE ON "public"."action_items" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_dashboard_chats" BEFORE UPDATE ON "public"."dashboard_chats" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_knowledge_documents" BEFORE UPDATE ON "public"."knowledge_documents" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_profiles" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "set_timestamp_rubrics" BEFORE UPDATE ON "public"."rubrics" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_timestamp"();



CREATE OR REPLACE TRIGGER "touch_dashboard_chat_on_message" AFTER INSERT ON "public"."dashboard_chat_messages" FOR EACH ROW WHEN (("new"."chat_id" IS NOT NULL)) EXECUTE FUNCTION "public"."touch_dashboard_chat"();



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."action_items"
    ADD CONSTRAINT "action_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dashboard_chat_messages"
    ADD CONSTRAINT "dashboard_chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."dashboard_chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dashboard_chat_messages"
    ADD CONSTRAINT "dashboard_chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dashboard_chat_messages"
    ADD CONSTRAINT "dashboard_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dashboard_chats"
    ADD CONSTRAINT "dashboard_chats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dashboard_chats"
    ADD CONSTRAINT "dashboard_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rubrics"
    ADD CONSTRAINT "fk_rubrics_knowledge_document" FOREIGN KEY ("knowledge_document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."knowledge_documents"
    ADD CONSTRAINT "knowledge_documents_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."knowledge_documents"
    ADD CONSTRAINT "knowledge_documents_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."knowledge_documents"
    ADD CONSTRAINT "knowledge_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rubric_criteria"
    ADD CONSTRAINT "rubric_criteria_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rubrics"
    ADD CONSTRAINT "rubrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_messages"
    ADD CONSTRAINT "session_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sessions"
    ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Students can add criteria to their rubrics" ON "public"."rubric_criteria" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."rubrics"
  WHERE (("rubrics"."id" = "rubric_criteria"."rubric_id") AND ("rubrics"."user_id" = "auth"."uid"())))));



CREATE POLICY "Students can create their own dashboard chats" ON "public"."dashboard_chats" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Students can delete their checklist tasks" ON "public"."action_items" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can delete their own dashboard chats" ON "public"."dashboard_chats" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Students can delete their own dashboard follow-up chat messages" ON "public"."dashboard_chat_messages" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Students can delete their own knowledge documents" ON "public"."knowledge_documents" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can delete their own rubrics" ON "public"."rubrics" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can delete their own sessions" ON "public"."sessions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can import new coaching sessions" ON "public"."sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can insert checklist tasks" ON "public"."action_items" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can insert their own activity logs" ON "public"."activity_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can insert their own knowledge documents" ON "public"."knowledge_documents" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can modify their own profile preferences" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Students can post messages to dashboard follow-up chats" ON "public"."dashboard_chat_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can read their own imported sessions" ON "public"."sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can read their own knowledge documents" ON "public"."knowledge_documents" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can read their own rubrics" ON "public"."rubrics" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can read transcripts from their sessions" ON "public"."session_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."sessions"
  WHERE (("sessions"."id" = "session_messages"."session_id") AND ("sessions"."user_id" = "auth"."uid"())))));



CREATE POLICY "Students can save messages into transcripts" ON "public"."session_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."sessions"
  WHERE (("sessions"."id" = "session_messages"."session_id") AND ("sessions"."user_id" = "auth"."uid"())))));



CREATE POLICY "Students can update their checklist tasks" ON "public"."action_items" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can update their own dashboard chats" ON "public"."dashboard_chats" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Students can update their own knowledge documents" ON "public"."knowledge_documents" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can update their own rubrics" ON "public"."rubrics" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can update their own sessions" ON "public"."sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can upload custom rubrics" ON "public"."rubrics" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can view criteria for their rubrics" ON "public"."rubric_criteria" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rubrics"
  WHERE (("rubrics"."id" = "rubric_criteria"."rubric_id") AND ("rubrics"."user_id" = "auth"."uid"())))));



CREATE POLICY "Students can view dashboard follow-up chat histories" ON "public"."dashboard_chat_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can view their checklist tasks" ON "public"."action_items" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can view their own dashboard chats" ON "public"."dashboard_chats" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Students can view their own profile details" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Students can view their recent action logs feed" ON "public"."activity_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users read own ai usage" ON "public"."ai_usage" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."action_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dashboard_chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dashboard_chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."knowledge_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rubric_criteria" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rubrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."consume_ai_request"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_ai_request"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_ai_usage"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_ai_usage"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_ai_usage"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_rubric_sessions_count"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_rubric_sessions_count"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."touch_dashboard_chat"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_dashboard_chat"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_set_timestamp"() TO "service_role";


















GRANT ALL ON TABLE "public"."action_items" TO "anon";
GRANT ALL ON TABLE "public"."action_items" TO "authenticated";
GRANT ALL ON TABLE "public"."action_items" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."ai_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_chats" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_chats" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_chats" TO "service_role";



GRANT ALL ON TABLE "public"."knowledge_documents" TO "anon";
GRANT ALL ON TABLE "public"."knowledge_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."knowledge_documents" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."rubric_criteria" TO "anon";
GRANT ALL ON TABLE "public"."rubric_criteria" TO "authenticated";
GRANT ALL ON TABLE "public"."rubric_criteria" TO "service_role";



GRANT ALL ON TABLE "public"."rubrics" TO "anon";
GRANT ALL ON TABLE "public"."rubrics" TO "authenticated";
GRANT ALL ON TABLE "public"."rubrics" TO "service_role";



GRANT ALL ON TABLE "public"."session_messages" TO "anon";
GRANT ALL ON TABLE "public"."session_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."session_messages" TO "service_role";



GRANT ALL ON TABLE "public"."sessions" TO "anon";
GRANT ALL ON TABLE "public"."sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."sessions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































