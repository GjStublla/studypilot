-- Atomic rubric operations
--
-- Replaces the two multi-step application-level sequences in rubrics.py with
-- single SQL functions that run inside a transaction, eliminating orphaned
-- rows and zero-active-rubric windows.
--
-- create_rubric_with_criteria: inserts the rubric + all criteria atomically.
-- set_active_rubric:           deactivates all then activates one atomically.

-- ---------------------------------------------------------------------------
-- create_rubric_with_criteria
-- ---------------------------------------------------------------------------
-- Called by POST /rubrics. Inserts one rubrics row and zero-or-more
-- rubric_criteria rows in a single transaction. On any failure the entire
-- operation rolls back — no orphaned rubric rows, no manual cleanup needed.
--
-- Parameters:
--   p_user_id   uuid        — the authenticated user (must match auth.uid())
--   p_title     text        — rubric title (validated by the API layer)
--   p_course    text        — course name
--   p_criteria  jsonb       — array of {name text, max_score int} objects
--
-- Returns: jsonb { id, title, course }

create or replace function public.create_rubric_with_criteria(
  p_user_id  uuid,
  p_title    text,
  p_course   text,
  p_criteria jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rubric_id uuid;
  v_title     text;
  v_course    text;
  v_criterion jsonb;
begin
  -- Enforce caller identity — the API layer passes the verified user_id but
  -- we double-check here so the function cannot be misused directly.
  if (select auth.uid()) is distinct from p_user_id then
    raise exception 'Unauthorized'
      using errcode = '42501';
  end if;

  -- Insert the rubric row.
  insert into public.rubrics (
    user_id,
    title,
    course,
    active,
    file_search_status
  )
  values (
    p_user_id,
    p_title,
    p_course,
    false,
    'not_indexed'
  )
  returning id, title, course
  into v_rubric_id, v_title, v_course;

  -- Insert criteria if any were supplied.
  if jsonb_array_length(p_criteria) > 0 then
    for v_criterion in select * from jsonb_array_elements(p_criteria)
    loop
      insert into public.rubric_criteria (rubric_id, name, score, max_score)
      values (
        v_rubric_id,
        v_criterion->>'name',
        0,
        coalesce((v_criterion->>'max_score')::integer, 4)
      );
    end loop;
  end if;

  return jsonb_build_object(
    'id',     v_rubric_id,
    'title',  v_title,
    'course', v_course
  );
end;
$$;

-- Only the authenticated role may call this; service_role inherits it.
revoke all on function public.create_rubric_with_criteria(uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.create_rubric_with_criteria(uuid, text, text, jsonb)
  to authenticated;

comment on function public.create_rubric_with_criteria(uuid, text, text, jsonb) is
  'Atomically inserts a rubric and its criteria. Rolls back both on any failure.';

-- ---------------------------------------------------------------------------
-- set_active_rubric
-- ---------------------------------------------------------------------------
-- Called by PATCH /rubrics/{id}/active. Deactivates every rubric owned by
-- the user then activates the target — both updates in one transaction so
-- there is never a window with zero active rubrics.
--
-- Parameters:
--   p_rubric_id uuid  — the rubric to activate
--   p_user_id   uuid  — the authenticated user
--
-- Returns: jsonb row matching RubricResponse shape
--   { id, title, course, uploaded_at, active, sessions_count,
--     file_search_status, criteria: [{id, name, score, max_score}] }
--
-- Raises:
--   42501  Unauthorized — caller is not the rubric owner
--   P0002  No data found — rubric does not exist or wrong owner

create or replace function public.set_active_rubric(
  p_rubric_id uuid,
  p_user_id   uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    record;
  v_crit   record;
  v_criteria jsonb := '[]'::jsonb;
begin
  -- Enforce caller identity.
  if (select auth.uid()) is distinct from p_user_id then
    raise exception 'Unauthorized'
      using errcode = '42501';
  end if;

  -- Verify the target rubric exists and belongs to this user before touching
  -- anything — avoids a window where all rubrics are deactivated and the
  -- target turns out not to exist.
  perform 1
  from public.rubrics
  where id = p_rubric_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Rubric not found'
      using errcode = 'P0002';
  end if;

  -- Deactivate all rubrics owned by this user, then activate the target.
  -- Both happen in one statement via a CASE expression so they are atomic.
  update public.rubrics
  set
    active     = (id = p_rubric_id),
    updated_at = now()
  where user_id = p_user_id;

  -- Read the newly activated rubric to build the response.
  select
    id,
    title,
    course,
    coalesce(uploaded_at::text, '') as uploaded_at,
    active,
    coalesce(sessions_count, 0)     as sessions_count,
    coalesce(file_search_status, 'not_indexed') as file_search_status
  into v_row
  from public.rubrics
  where id = p_rubric_id
    and user_id = p_user_id;

  -- Build criteria array.
  for v_crit in
    select id, name, coalesce(score, 0) as score, coalesce(max_score, 4) as max_score
    from public.rubric_criteria
    where rubric_id = p_rubric_id
    order by created_at
  loop
    v_criteria := v_criteria || jsonb_build_object(
      'id',        v_crit.id,
      'name',      v_crit.name,
      'score',     v_crit.score,
      'max_score', v_crit.max_score
    );
  end loop;

  return jsonb_build_object(
    'id',                v_row.id,
    'title',             v_row.title,
    'course',            v_row.course,
    'uploaded_at',       v_row.uploaded_at,
    'active',            v_row.active,
    'sessions_count',    v_row.sessions_count,
    'file_search_status', v_row.file_search_status,
    'criteria',          v_criteria
  );
end;
$$;

revoke all on function public.set_active_rubric(uuid, uuid)
  from public, anon;
grant execute on function public.set_active_rubric(uuid, uuid)
  to authenticated;

comment on function public.set_active_rubric(uuid, uuid) is
  'Atomically deactivates all user rubrics and activates the target in one UPDATE.';
