-- Browser-first question progress. The only client write API is the authenticated
-- RPC below: granting table DML would let callers bypass optimistic concurrency.
create schema exam_private;
revoke all on schema exam_private from public, anon, authenticated, service_role;
grant usage on schema exam_private to authenticated;

create function exam_private.valid_question_state(p_state jsonb)
returns boolean
language plpgsql immutable security invoker
set search_path = ''
as $$
begin
  if p_state is null or jsonb_typeof(p_state) <> 'object'
    or octet_length(p_state::text) > 16384
    or (p_state - array['selected', 'values', 'submitted', 'attempt']) <> '{}'::jsonb
    or jsonb_typeof(p_state -> 'selected') is distinct from 'array'
    or jsonb_typeof(p_state -> 'values') is distinct from 'array'
    or jsonb_typeof(p_state -> 'submitted') is distinct from 'boolean'
    or jsonb_typeof(p_state -> 'attempt') is distinct from 'number'
  then return false; end if;
  if jsonb_array_length(p_state -> 'selected') > 64
    or jsonb_array_length(p_state -> 'values') > 64
    or (p_state ->> 'attempt') !~ '^[0-9]{1,10}$'
  then return false; end if;
  if (p_state ->> 'attempt')::bigint > 2147483647 then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(p_state -> 'selected') as item(value)
    where jsonb_typeof(item.value) <> 'string' or length(item.value #>> '{}') > 128
  ) or exists (
    select 1 from jsonb_array_elements(p_state -> 'values') as item(value)
    where jsonb_typeof(item.value) <> 'string' or length(item.value #>> '{}') > 8192
  ) then return false; end if;
  return true;
end;
$$;

create table exam_private.question_sync_heads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cursor bigint not null default 0 check (cursor >= 0)
);

create table exam_private.question_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Hash the length-independent identity rather than indexing long UTF-8 paths,
  -- which can exceed PostgreSQL's B-tree entry size. Full fields are checked too.
  identity_hash bytea not null check (octet_length(identity_hash) = 32),
  document_path text not null check (length(document_path) between 1 and 2048),
  question_id text not null check (length(question_id) between 1 and 200),
  question_revision text not null check (length(question_revision) between 1 and 128),
  state jsonb not null check (exam_private.valid_question_state(state)),
  version bigint not null check (version between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  primary key (user_id, identity_hash)
);

create table exam_private.question_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  document_path text not null check (length(document_path) between 1 and 2048),
  question_id text not null check (length(question_id) between 1 and 200),
  question_revision text not null check (length(question_revision) between 1 and 128),
  state jsonb not null check (exam_private.valid_question_state(state)
    and state @> '{"submitted":true}'::jsonb and (state ->> 'attempt')::bigint >= 1),
  client_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (user_id, attempt_id)
);

-- Keep operation receipts for retry safety. They are not expired behind an
-- offline device's back; retrying an acknowledged UUID can never reapply a write.
create table exam_private.question_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  receipt jsonb not null,
  received_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

-- Immutable snapshots allow bounded pagination to replay every committed event.
-- A per-user transaction lock and transactional counter avoid sequence commit
-- holes (nextval alone could cause a slow transaction to be skipped forever).
create table exam_private.question_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  cursor bigint not null check (cursor > 0),
  kind text not null check (kind in ('progress', 'attempt')),
  payload jsonb not null,
  primary key (user_id, cursor)
);

alter table exam_private.question_sync_heads enable row level security;
alter table exam_private.question_progress enable row level security;
alter table exam_private.question_attempts enable row level security;
alter table exam_private.question_operations enable row level security;
alter table exam_private.question_events enable row level security;

create policy question_heads_owner on exam_private.question_sync_heads
  for select to authenticated using (user_id = (select auth.uid()));
create policy question_progress_owner on exam_private.question_progress
  for select to authenticated using (user_id = (select auth.uid()));
create policy question_attempts_owner on exam_private.question_attempts
  for select to authenticated using (user_id = (select auth.uid()));
create policy question_operations_owner on exam_private.question_operations
  for select to authenticated using (user_id = (select auth.uid()));
create policy question_events_owner on exam_private.question_events
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on all tables in schema exam_private from public, anon, authenticated, service_role;
revoke execute on function exam_private.valid_question_state(jsonb) from public, anon, authenticated, service_role;

-- Definer privileges are needed only to enforce CAS and idempotency without
-- exposing direct writes. This function is kept outside exposed API schemas,
-- checks the caller's uid, and uses fully qualified relations and an empty path.
create function exam_private.sync_question_state(
  p_operations jsonb,
  p_cursor bigint,
  p_limit integer
)
returns jsonb
language plpgsql security definer
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  v_user_id uuid := auth.uid();
  v_head bigint;
  v_operation jsonb;
  v_operation_id uuid;
  v_document_path text;
  v_question_id text;
  v_revision text;
  v_identity_hash bytea;
  v_base_version bigint;
  v_progress exam_private.question_progress%rowtype;
  v_saved_operation exam_private.question_operations%rowtype;
  v_attempt exam_private.question_attempts%rowtype;
  v_attempt_id uuid;
  v_attempt_time timestamptz;
  v_record jsonb;
  v_receipt jsonb;
  v_status text;
  v_receipts jsonb := '[]'::jsonb;
  v_changes jsonb;
  v_attempts jsonb;
  v_page_cursor bigint;
  v_has_more boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_operations is null or jsonb_typeof(p_operations) <> 'array'
    or octet_length(p_operations::text) > 262144
  then raise exception 'Operations must be an array of at most 256 KiB' using errcode = '22023'; end if;
  if jsonb_array_length(p_operations) > 50 then
    raise exception 'At most 50 operations per request' using errcode = '22023';
  end if;
  if p_cursor is null or p_cursor < 0 or p_limit is null or p_limit not between 1 and 200 then
    raise exception 'Invalid cursor or page size' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('exam-docs-question-sync:' || v_user_id::text, 0));
  insert into exam_private.question_sync_heads(user_id) values (v_user_id) on conflict do nothing;
  select cursor into v_head from exam_private.question_sync_heads where user_id = v_user_id;
  if p_cursor > v_head then
    raise exception 'Cursor is ahead of this account; reset its local sync cursor' using errcode = '22023';
  end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    if jsonb_typeof(v_operation) <> 'object'
      or (v_operation - array['operationId', 'documentPath', 'questionId', 'questionRevision', 'state', 'baseVersion', 'attempt']) <> '{}'::jsonb
      or jsonb_typeof(v_operation -> 'operationId') is distinct from 'string'
      or jsonb_typeof(v_operation -> 'documentPath') is distinct from 'string'
      or jsonb_typeof(v_operation -> 'questionId') is distinct from 'string'
      or jsonb_typeof(v_operation -> 'questionRevision') is distinct from 'string'
      or jsonb_typeof(v_operation -> 'baseVersion') is distinct from 'number'
      or not exam_private.valid_question_state(v_operation -> 'state')
    then raise exception 'Invalid question operation' using errcode = '22023'; end if;
    v_operation_id := (v_operation ->> 'operationId')::uuid;
    v_document_path := v_operation ->> 'documentPath';
    v_question_id := v_operation ->> 'questionId';
    v_revision := v_operation ->> 'questionRevision';
    v_identity_hash := sha256(convert_to(jsonb_build_array(v_document_path, v_question_id, v_revision)::text, 'UTF8'));
    if length(v_document_path) not between 1 and 2048
      or length(v_question_id) not between 1 and 200
      or length(v_revision) not between 1 and 128
      or (v_operation ->> 'baseVersion') !~ '^[0-9]{1,16}$'
    then raise exception 'Invalid question identity or base version' using errcode = '22023'; end if;
    v_base_version := (v_operation ->> 'baseVersion')::bigint;
    if v_base_version > 9007199254740991 then
      raise exception 'Base version exceeds the supported range' using errcode = '22023';
    end if;

    select * into v_saved_operation from exam_private.question_operations
      where user_id = v_user_id and operation_id = v_operation_id;
    if found then
      if v_saved_operation.request <> v_operation then
        raise exception 'Operation UUID was reused with different contents' using errcode = '22023';
      end if;
      v_receipts := v_receipts || jsonb_build_array(v_saved_operation.receipt);
      continue;
    end if;

    -- Submissions are immutable facts, independent of the mutable current answer.
    -- A stale progress write must not discard the student's submitted attempt.
    if v_operation ? 'attempt' then
      if jsonb_typeof(v_operation -> 'attempt') is distinct from 'object'
        or ((v_operation -> 'attempt') - array['attemptId', 'state', 'createdAt']) <> '{}'::jsonb
        or jsonb_typeof(v_operation #> '{attempt,attemptId}') is distinct from 'string'
        or jsonb_typeof(v_operation #> '{attempt,createdAt}') is distinct from 'string'
        or length(v_operation #>> '{attempt,createdAt}') > 64
        or not exam_private.valid_question_state(v_operation #> '{attempt,state}')
      then raise exception 'Invalid submission attempt' using errcode = '22023'; end if;
      if (v_operation #>> '{attempt,state,submitted}')::boolean is not true
        or (v_operation #>> '{attempt,state,attempt}')::integer < 1
      then raise exception 'Submission attempts must be submitted and have a positive attempt count' using errcode = '22023'; end if;
      v_attempt_id := (v_operation #>> '{attempt,attemptId}')::uuid;
      v_attempt_time := (v_operation #>> '{attempt,createdAt}')::timestamptz;
      if not isfinite(v_attempt_time) then
        raise exception 'Invalid submission timestamp' using errcode = '22023';
      end if;
      select * into v_attempt from exam_private.question_attempts
        where user_id = v_user_id and attempt_id = v_attempt_id;
      if found then
        if v_attempt.document_path <> v_document_path or v_attempt.question_id <> v_question_id
          or v_attempt.question_revision <> v_revision
          or v_attempt.state <> (v_operation #> '{attempt,state}')
          or v_attempt.client_created_at <> v_attempt_time
        then raise exception 'Attempt UUID was reused with different contents' using errcode = '22023'; end if;
      else
        insert into exam_private.question_attempts(user_id, attempt_id, document_path, question_id, question_revision, state, client_created_at)
          values (v_user_id, v_attempt_id, v_document_path, v_question_id, v_revision, v_operation #> '{attempt,state}', v_attempt_time)
          returning * into v_attempt;
        v_head := v_head + 1;
        insert into exam_private.question_events(user_id, cursor, kind, payload)
          values (v_user_id, v_head, 'attempt', jsonb_build_object(
            'documentPath', v_document_path, 'questionId', v_question_id, 'questionRevision', v_revision,
            'attemptId', v_attempt_id, 'state', v_attempt.state,
            'createdAt', v_attempt.client_created_at, 'receivedAt', v_attempt.received_at));
      end if;
    end if;

    select * into v_progress from exam_private.question_progress
      where user_id = v_user_id and identity_hash = v_identity_hash;
    if found and (v_progress.document_path <> v_document_path
      or v_progress.question_id <> v_question_id or v_progress.question_revision <> v_revision)
    then raise exception 'Question identity hash collision' using errcode = '22023'; end if;
    if (found and v_progress.version = v_base_version) or (not found and v_base_version = 0) then
      insert into exam_private.question_progress(user_id, identity_hash, document_path, question_id, question_revision, state, version)
        values (v_user_id, v_identity_hash, v_document_path, v_question_id, v_revision, v_operation -> 'state', 1)
        on conflict (user_id, identity_hash) do update
          set state = excluded.state, version = exam_private.question_progress.version + 1, updated_at = now()
        returning * into v_progress;
      v_status := 'applied';
    else
      v_status := 'conflict';
    end if;
    -- A nonzero base for a record that does not exist conflicts with an explicit
    -- empty server state (version zero), allowing the client to keep either side.
    v_record := jsonb_build_object('documentPath', v_document_path, 'questionId', v_question_id,
      'questionRevision', v_revision,
      'state', coalesce(v_progress.state, '{"selected":[],"values":[],"submitted":false,"attempt":0}'::jsonb),
      'version', coalesce(v_progress.version, 0), 'updatedAt', coalesce(v_progress.updated_at, now()));
    if v_status = 'applied' then
      v_head := v_head + 1;
      insert into exam_private.question_events(user_id, cursor, kind, payload)
        values (v_user_id, v_head, 'progress', v_record);
    end if;
    v_receipt := jsonb_build_object('operationId', v_operation_id, 'status', v_status, 'record', v_record);
    insert into exam_private.question_operations(user_id, operation_id, request, receipt)
      values (v_user_id, v_operation_id, v_operation, v_receipt);
    v_receipts := v_receipts || jsonb_build_array(v_receipt);
  end loop;
  update exam_private.question_sync_heads set cursor = v_head where user_id = v_user_id;

  select coalesce(jsonb_agg(payload order by cursor) filter (where kind = 'progress'), '[]'::jsonb),
    coalesce(jsonb_agg(payload order by cursor) filter (where kind = 'attempt'), '[]'::jsonb),
    coalesce(max(cursor), p_cursor)
    into v_changes, v_attempts, v_page_cursor
    from (select cursor, kind, payload from exam_private.question_events
      where user_id = v_user_id and cursor > p_cursor order by cursor limit p_limit) as page;
  v_has_more := v_page_cursor < v_head;
  return jsonb_build_object('receipts', v_receipts, 'changes', v_changes, 'attempts', v_attempts,
    'cursor', (case when v_has_more then v_page_cursor else v_head end)::text, 'hasMore', v_has_more);
end;
$$;

revoke execute on function exam_private.sync_question_state(jsonb, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function exam_private.sync_question_state(jsonb, bigint, integer) to authenticated;

create function public.exam_sync_question_state(
  p_operations jsonb default '[]'::jsonb,
  p_cursor bigint default 0,
  p_limit integer default 100
)
returns jsonb
language sql security invoker
set search_path = ''
as $$ select exam_private.sync_question_state(p_operations, p_cursor, p_limit); $$;

revoke execute on function public.exam_sync_question_state(jsonb, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.exam_sync_question_state(jsonb, bigint, integer) to authenticated;

comment on function public.exam_sync_question_state(jsonb, bigint, integer) is
  'Authenticated, idempotent question sync: at most 50 operations/256 KiB; CAS progress, immutable attempts, paged per-user cursor. Cursor is a decimal string in responses.';
