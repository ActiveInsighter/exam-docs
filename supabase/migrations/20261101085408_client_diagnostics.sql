-- Temporary client diagnostics (2026-11-01).
--
-- The HarmonyOS Huawei browser kills exam-docs pages (sometimes the same page
-- again on every restore) and there are no device logs. Pages on that engine
-- (or opened with ?diag=1) post a breadcrumb trail of their lifecycle here:
-- boot, hydration, storage, answers restored, keypad and dialogs, errors,
-- long tasks and a periodic heartbeat (JS heap, DOM size, scroll). A trail the
-- browser cut off is re-sent as kind 'previous' on the next visit.
--
-- Nothing here is readable through the API. Drop the table and function once
-- the crash is understood.

create table exam_private.client_diagnostics (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  session_id text not null check (session_id ~ '^[a-z0-9]{8,40}$'),
  kind text not null check (kind in ('live', 'previous')),
  events jsonb not null check (jsonb_typeof(events) = 'array')
);

create index client_diagnostics_session on exam_private.client_diagnostics (session_id, id);
create index client_diagnostics_received on exam_private.client_diagnostics (received_at);

alter table exam_private.client_diagnostics enable row level security;
revoke all on table exam_private.client_diagnostics from public, anon, authenticated;

create function public.exam_client_log(p_session text, p_kind text, p_events jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_session is null or p_session !~ '^[a-z0-9]{8,40}$' or p_kind is null or p_kind not in ('live', 'previous')
    or p_events is null or jsonb_typeof(p_events) <> 'array' or octet_length(p_events::text) > 32768 then
    raise exception 'invalid client diagnostics' using errcode = '22023';
  end if;
  -- Bounded per page visit and overall, so a runaway client cannot fill the table.
  if (select count(*) from (select 1 from exam_private.client_diagnostics
      where session_id = p_session limit 300) as recent) >= 300 then
    return;
  end if;
  if (select count(*) from (select 1 from exam_private.client_diagnostics
      where received_at > now() - interval '1 hour' limit 20000) as recent) >= 20000 then
    return;
  end if;
  insert into exam_private.client_diagnostics (session_id, kind, events) values (p_session, p_kind, p_events);
end;
$$;

revoke execute on function public.exam_client_log(text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.exam_client_log(text, text, jsonb) to anon, authenticated;

comment on function public.exam_client_log(text, text, jsonb) is
  'Temporary write-only crash diagnostics: one batch (JSON array, at most 32 KiB) of page lifecycle events per call; at most 300 batches per page visit.';
