-- Expose the normalized citation array already stored inside
-- grounding_metadata without creating a second writable source of truth.
-- A stored generated column keeps existing rows and all RPC write paths in
-- sync while satisfying the Data API contract used by the dashboard.
alter table public.dashboard_chat_messages
  add column if not exists citations jsonb
  generated always as (
    case
      when jsonb_typeof(grounding_metadata -> 'citations') = 'array'
        then grounding_metadata -> 'citations'
      else null
    end
  ) stored;

comment on column public.dashboard_chat_messages.citations is
  'Normalized citation array derived from grounding_metadata.citations.';
