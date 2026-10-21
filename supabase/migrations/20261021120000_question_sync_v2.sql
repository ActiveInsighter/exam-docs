-- Question sync v2.
--
-- * Compacted change feed: every progress row and attempt carries the per-user
--   sequence number of its latest write. A pull reads rows with seq > cursor,
--   so it returns only the newest state of each question instead of replaying
--   every historical snapshot. The append-only question_events log is gone.
-- * Slim idempotency receipts: an operation UUID keeps only the hash of its
--   request and its outcome. A retried UUID is answered with the current row.
--   Receipts older than 30 days are pruned by the owner's next sync.
-- * Realtime pokes: a committed change sends a private broadcast
--   ("exam-sync:<uid>", event "changed", payload {cursor}). The broadcast is
--   only a hint; clients still pull through the RPC, so a lost message never
--   loses data.
-- * A cursor ahead of the account (restored database, other protocol) restarts
--   the feed from zero with reset=true instead of failing.

drop function public.exam_sync_question_state(jsonb, bigint, integer);
drop function exam_private.sync_question_state(jsonb, bigint, integer);

-- Feed positions -------------------------------------------------------------

alter table exam_private.question_progress
  add column seq bigint,
  add column last_operation_id uuid;
alter table exam_private.question_attempts add column seq bigint;

create temporary table question_feed_backfill as
select user_id, kind, ref, row_number() over (partition by user_id order by at, kind, ref) as seq
from (
  select user_id, 'progress' as kind, encode(identity_hash, 'hex') as ref, updated_at as at
    from exam_private.question_progress
  union all
  select user_id, 'attempt', attempt_id::text, received_at
    from exam_private.question_attempts
) as feed;

update exam_private.question_progress as p set seq = b.seq
  from question_feed_backfill as b
  where b.kind = 'progress' and b.user_id = p.user_id and b.ref = encode(p.identity_hash, 'hex');
update exam_private.question_attempts as a set seq = b.seq
  from question_feed_backfill as b
  where b.kind = 'attempt' and b.user_id = a.user_id and b.ref = a.attempt_id::text;

insert into exam_private.question_sync_heads(user_id, cursor)
  select user_id, max(seq) from question_feed_backfill group by user_id
  on conflict (user_id) do update set cursor = excluded.cursor;
update exam_private.question_sync_heads as h set cursor = 0
  where not exists (select 1 from question_feed_backfill as b where b.user_id = h.user_id);

alter table exam_private.question_progress
  alter column seq set not null,
  add constraint question_progress_seq_positive check (seq > 0);
alter table exam_private.question_attempts
  alter column seq set not null,
  add constraint question_attempts_seq_positive check (seq > 0);
create unique index question_progress_feed on exam_private.question_progress (user_id, seq);
create unique index question_attempts_feed on exam_private.question_attempts (user_id, seq);

drop table question_feed_backfill;
drop table exam_private.question_events;

-- Slim receipts ---------------------------------------------------------------

alter table exam_private.question_operations
  add column identity_hash bytea,
  add column request_hash bytea,
  add column status text;
update exam_private.question_operations set
  identity_hash = sha256(convert_to(jsonb_build_array(
    request ->> 'documentPath', request ->> 'questionId', request ->> 'questionRevision')::text, 'UTF8')),
  request_hash = sha256(convert_to(request::text, 'UTF8')),
  status = receipt ->> 'status';
alter table exam_private.question_operations
  drop column request,
  drop column receipt,
  alter column identity_hash set not null,
  alter column request_hash set not null,
  alter column status set not null,
  add constraint question_operations_identity_hash check (octet_length(identity_hash) = 32),
  add constraint question_operations_request_hash check (octet_length(request_hash) = 32),
  add constraint question_operations_status check (status in ('applied', 'conflict'));
create index question_operations_age on exam_private.question_operations (user_id, received_at);

-- Sync RPC --------------------------------------------------------------------

create function exam_private.progress_snapshot(p_row exam_private.question_progress)
returns jsonb
language sql immutable security invoker
set search_path = ''
as $$
  select jsonb_build_object('documentPath', p_row.document_path, 'questionId', p_row.question_id,
    'questionRevision', p_row.question_revision, 'state', p_row.state,
    'version', p_row.version, 'updatedAt', p_row.updated_at);
$$;
revoke execute on function exam_private.progress_snapshot(exam_private.question_progress) from public, anon, authenticated, service_role;

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
  v_start bigint;
  v_cursor bigint := p_cursor;
  v_reset boolean := false;
  v_operation jsonb;
  v_operation_id uuid;
  v_request_hash bytea;
  v_document_path text;
  v_question_id text;
  v_revision text;
  v_identity_hash bytea;
  v_base_version bigint;
  v_progress exam_private.question_progress%rowtype;
  v_saved exam_private.question_operations%rowtype;
  v_attempt exam_private.question_attempts%rowtype;
  v_attempt_id uuid;
  v_attempt_time timestamptz;
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
  if p_cursor is null or p_cursor < 0 or p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Invalid cursor or page size' using errcode = '22023';
  end if;

  -- One sync transaction per user at a time: sequence numbers are allocated
  -- in commit order, so a reader can never skip a slower concurrent write.
  perform pg_advisory_xact_lock(hashtextextended('exam-docs-question-sync:' || v_user_id::text, 0));
  insert into exam_private.question_sync_heads(user_id) values (v_user_id) on conflict do nothing;
  select cursor into v_head from exam_private.question_sync_heads where user_id = v_user_id;
  v_start := v_head;
  if v_cursor > v_head then
    v_cursor := 0;
    v_reset := true;
  end if;

  delete from exam_private.question_operations
    where user_id = v_user_id and received_at < now() - interval '30 days';

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
    if length(v_document_path) not between 1 and 2048
      or length(v_question_id) not between 1 and 200
      or length(v_revision) not between 1 and 128
      or (v_operation ->> 'baseVersion') !~ '^[0-9]{1,16}$'
    then raise exception 'Invalid question identity or base version' using errcode = '22023'; end if;
    v_identity_hash := sha256(convert_to(jsonb_build_array(v_document_path, v_question_id, v_revision)::text, 'UTF8'));
    v_request_hash := sha256(convert_to(v_operation::text, 'UTF8'));
    v_base_version := (v_operation ->> 'baseVersion')::bigint;
    if v_base_version > 9007199254740991 then
      raise exception 'Base version exceeds the supported range' using errcode = '22023';
    end if;

    select * into v_progress from exam_private.question_progress
      where user_id = v_user_id and identity_hash = v_identity_hash;
    if found and (v_progress.document_path <> v_document_path
      or v_progress.question_id <> v_question_id or v_progress.question_revision <> v_revision)
    then raise exception 'Question identity hash collision' using errcode = '22023'; end if;

    select * into v_saved from exam_private.question_operations
      where user_id = v_user_id and operation_id = v_operation_id;
    if found then
      if v_saved.request_hash <> v_request_hash then
        raise exception 'Operation UUID was reused with different contents' using errcode = '22023';
      end if;
      -- A lost response is answered with the current server row: the client
      -- either confirms its write or learns about the newer version.
      v_receipts := v_receipts || jsonb_build_array(jsonb_build_object(
        'operationId', v_operation_id, 'status', v_saved.status,
        'record', case when v_progress.user_id is null
          then jsonb_build_object('documentPath', v_document_path, 'questionId', v_question_id,
            'questionRevision', v_revision, 'state', '{"selected":[],"values":[],"submitted":false,"attempt":0}'::jsonb,
            'version', 0, 'updatedAt', now())
          else exam_private.progress_snapshot(v_progress) end));
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
        v_head := v_head + 1;
        insert into exam_private.question_attempts(user_id, attempt_id, document_path, question_id,
            question_revision, state, client_created_at, seq)
          values (v_user_id, v_attempt_id, v_document_path, v_question_id, v_revision,
            v_operation #> '{attempt,state}', v_attempt_time, v_head);
      end if;
    end if;

    if (v_progress.user_id is not null and v_progress.version = v_base_version)
      or (v_progress.user_id is null and v_base_version = 0) then
      v_head := v_head + 1;
      insert into exam_private.question_progress(user_id, identity_hash, document_path, question_id,
          question_revision, state, version, seq, last_operation_id)
        values (v_user_id, v_identity_hash, v_document_path, v_question_id, v_revision,
          v_operation -> 'state', 1, v_head, v_operation_id)
        on conflict (user_id, identity_hash) do update
          set state = excluded.state, version = exam_private.question_progress.version + 1,
            updated_at = now(), seq = excluded.seq, last_operation_id = excluded.last_operation_id
        returning * into v_progress;
      v_status := 'applied';
    else
      v_status := 'conflict';
    end if;
    insert into exam_private.question_operations(user_id, operation_id, identity_hash, request_hash, status)
      values (v_user_id, v_operation_id, v_identity_hash, v_request_hash, v_status);
    -- A nonzero base for a record that does not exist conflicts with an explicit
    -- empty server state (version zero), allowing the client to keep either side.
    v_receipts := v_receipts || jsonb_build_array(jsonb_build_object(
      'operationId', v_operation_id, 'status', v_status,
      'record', case when v_progress.user_id is null
        then jsonb_build_object('documentPath', v_document_path, 'questionId', v_question_id,
          'questionRevision', v_revision, 'state', '{"selected":[],"values":[],"submitted":false,"attempt":0}'::jsonb,
          'version', 0, 'updatedAt', now())
        else exam_private.progress_snapshot(v_progress) end));
  end loop;

  if v_head <> v_start then
    update exam_private.question_sync_heads set cursor = v_head where user_id = v_user_id;
    -- Wake the account's other devices after commit. Delivery is best effort;
    -- the pull below remains the source of truth.
    begin
      perform realtime.send(jsonb_build_object('cursor', v_head::text), 'changed',
        'exam-sync:' || v_user_id::text, true);
    exception when others then
      raise warning 'exam-sync realtime notification skipped: %', sqlerrm;
    end;
  end if;

  with page as (
    select seq, kind, payload, row_number() over (order by seq) as n
    from (
      (select p.seq, 'progress'::text as kind, exam_private.progress_snapshot(p) as payload
        from exam_private.question_progress as p
        where p.user_id = v_user_id and p.seq > v_cursor order by p.seq limit p_limit + 1)
      union all
      (select a.seq, 'attempt'::text, jsonb_build_object('documentPath', a.document_path,
          'questionId', a.question_id, 'questionRevision', a.question_revision, 'attemptId', a.attempt_id,
          'state', a.state, 'createdAt', a.client_created_at, 'receivedAt', a.received_at)
        from exam_private.question_attempts as a
        where a.user_id = v_user_id and a.seq > v_cursor order by a.seq limit p_limit + 1)
    ) as merged
    order by seq limit p_limit + 1
  )
  select coalesce(jsonb_agg(payload order by seq) filter (where kind = 'progress' and n <= p_limit), '[]'::jsonb),
    coalesce(jsonb_agg(payload order by seq) filter (where kind = 'attempt' and n <= p_limit), '[]'::jsonb),
    max(seq) filter (where n <= p_limit),
    count(*) > p_limit
    into v_changes, v_attempts, v_page_cursor, v_has_more
    from page;
  return jsonb_build_object('receipts', v_receipts, 'changes', v_changes, 'attempts', v_attempts,
    'cursor', (case when v_has_more then v_page_cursor else v_head end)::text,
    'hasMore', v_has_more, 'reset', v_reset);
end;
$$;

revoke execute on function exam_private.sync_question_state(jsonb, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function exam_private.sync_question_state(jsonb, bigint, integer) to authenticated;

create function public.exam_sync_question_state(
  p_operations jsonb default '[]'::jsonb,
  p_cursor bigint default 0,
  p_limit integer default 200
)
returns jsonb
language sql security invoker
set search_path = ''
as $$ select exam_private.sync_question_state(p_operations, p_cursor, p_limit); $$;

revoke execute on function public.exam_sync_question_state(jsonb, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.exam_sync_question_state(jsonb, bigint, integer) to authenticated;

comment on function public.exam_sync_question_state(jsonb, bigint, integer) is
  'Authenticated, idempotent question sync v2: at most 50 operations/256 KiB; CAS progress, immutable attempts, compacted per-user feed (seq). Cursor is a decimal string; reset=true when the client cursor was ahead.';

-- Realtime: members may only listen to their own private sync topic. No insert
-- policy exists, so browsers cannot forge pokes; only the RPC above sends them.
create policy exam_sync_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'exam-sync:' || (select auth.uid())::text
  );
