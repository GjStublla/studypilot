-- Dashboard message citation schema contract (pgTAP).
begin;
select plan(8);

select has_column(
  'public',
  'dashboard_chat_messages',
  'citations',
  'dashboard messages expose normalized citations to clients'
);

select col_type_is(
  'public',
  'dashboard_chat_messages',
  'citations',
  'jsonb',
  'normalized citations use JSONB'
);

select is(
  (
    select is_generated
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dashboard_chat_messages'
      and column_name = 'citations'
  ),
  'ALWAYS',
  'citations are derived from canonical grounding metadata'
);

select ok(
  (
    select generation_expression like '%grounding_metadata%'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dashboard_chat_messages'
      and column_name = 'citations'
  ),
  'the generated citation expression reads grounding metadata'
);

select is(
  has_column_privilege(
    'authenticated',
    'public.dashboard_chat_messages',
    'citations',
    'select'
  ),
  true,
  'authenticated users may read citations through message RLS'
);

insert into auth.users (id, email, raw_user_meta_data, role, aud)
values (
  '91111111-1111-4111-8111-111111111111',
  'citation-contract@example.edu',
  '{"name":"Citation Contract"}'::jsonb,
  'authenticated',
  'authenticated'
);

insert into public.dashboard_chats (id, user_id, title, origin_surface)
values (
  '92222222-2222-4222-8222-222222222222',
  '91111111-1111-4111-8111-111111111111',
  'Citation contract',
  'legacy'
);

insert into public.dashboard_chat_messages (
  id,
  user_id,
  chat_id,
  role,
  text,
  origin_surface,
  grounding_metadata
)
values (
  '93333333-3333-4333-8333-333333333333',
  '91111111-1111-4111-8111-111111111111',
  '92222222-2222-4222-8222-222222222222',
  'ai',
  'Grounded response',
  'legacy',
  '{"citations":[{"title":"Rubric","pageNumber":3}]}'::jsonb
);

select is(
  (
    select citations
    from public.dashboard_chat_messages
    where id = '93333333-3333-4333-8333-333333333333'
  ),
  '[{"title":"Rubric","pageNumber":3}]'::jsonb,
  'existing grounding metadata is exposed as normalized citations'
);

update public.dashboard_chat_messages
set grounding_metadata = '{"citations":[{"title":"Updated"}]}'::jsonb
where id = '93333333-3333-4333-8333-333333333333';

select is(
  (
    select citations
    from public.dashboard_chat_messages
    where id = '93333333-3333-4333-8333-333333333333'
  ),
  '[{"title":"Updated"}]'::jsonb,
  'generated citations stay synchronized when grounding metadata changes'
);

update public.dashboard_chat_messages
set grounding_metadata = '{"citations":{"title":"Invalid shape"}}'::jsonb
where id = '93333333-3333-4333-8333-333333333333';

select is(
  (
    select citations
    from public.dashboard_chat_messages
    where id = '93333333-3333-4333-8333-333333333333'
  ),
  null::jsonb,
  'non-array citation metadata is not exposed as a citation list'
);

select * from finish();
rollback;
