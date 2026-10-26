-- Question sync v3: one exchange, last writer wins.
--
-- * Drafts never reach the cloud. Browsers upload only what the reader
--   committed: a submitted answer, a reset, and their tags, favourites and
--   notes. The current answer of a question is therefore last-writer-wins by
--   the device's write time (clamped to now() + 5 minutes, like annotations).
--   Every submission stays in question_attempts, so a newer answer from
--   another device never loses a graded attempt. The CAS versions, operation
--   receipts and the reader-facing conflict choice are gone.
-- * Answers, attempts, tags and marks share one per-account compacted feed
--   (seq) and one RPC, public.exam_sync, so a device makes one request per
--   sync instead of two.
-- * Removed: question_operations, question_annotation_heads, the v2 RPCs, the
--   unused realtime policy and the never-used favourites index.

drop function public.exam_sync_question_state(jsonb, bigint, integer);
drop function exam_private.sync_question_state(jsonb, bigint, integer);
drop function exam_private.progress_snapshot(exam_private.question_progress);
drop function public.exam_sync_question_annotations(jsonb, jsonb, bigint, integer);
drop function exam_private.sync_question_annotations(jsonb, jsonb, bigint, integer);
drop policy if exists exam_sync_receive on realtime.messages;

drop table exam_private.question_operations;
drop index exam_private.question_marks_favorites;

alter table exam_private.question_progress
  drop column version,
  drop column last_operation_id;

-- One feed per account. Annotation rows move above the answer rows; the
-- browser starts the new feed from zero, so only uniqueness matters here.
update exam_private.question_tags as t set seq = t.seq + coalesce(h.cursor, 0)
  from exam_private.question_sync_heads as h where h.user_id = t.user_id;
update exam_private.question_marks as m set seq = m.seq + coalesce(h.cursor, 0)
  from exam_private.question_sync_heads as h where h.user_id = m.user_id;
insert into exam_private.question_sync_heads(user_id, cursor)
  select a.user_id, a.cursor from exam_private.question_annotation_heads as a
  on conflict (user_id) do update set cursor = exam_private.question_sync_heads.cursor + excluded.cursor;
drop table exam_private.question_annotation_heads;

-- Snapshots ------------------------------------------------------------------

create function exam_private.answer_snapshot(p_row exam_private.question_progress)
returns jsonb
language sql immutable security invoker
set search_path = ''
as $$
  select jsonb_build_object('documentPath', p_row.document_path, 'questionId', p_row.question_id,
    'questionRevision', p_row.question_revision, 'state', p_row.state, 'updatedAt', p_row.updated_at);
$$;

create function exam_private.attempt_snapshot(p_row exam_private.question_attempts)
returns jsonb
language sql immutable security invoker
set search_path = ''
as $$
  select jsonb_build_object('documentPath', p_row.document_path, 'questionId', p_row.question_id,
    'questionRevision', p_row.question_revision, 'attemptId', p_row.attempt_id,
    'state', p_row.state, 'createdAt', p_row.client_created_at);
$$;

revoke execute on function exam_private.answer_snapshot(exam_private.question_progress) from public, anon, authenticated, service_role;
revoke execute on function exam_private.attempt_snapshot(exam_private.question_attempts) from public, anon, authenticated, service_role;

-- Sync RPC --------------------------------------------------------------------

-- Definer privileges only to write tables the browser cannot touch. Checks the
-- caller's uid, uses fully qualified names and an empty search path.
create function exam_private.sync(p_changes jsonb, p_cursor bigint, p_limit integer)
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
  v_item jsonb;
  v_found boolean;
  v_updated timestamptz;
  v_created timestamptz;
  v_hash bytea;
  v_document_path text;
  v_question_id text;
  v_revision text;
  v_progress exam_private.question_progress%rowtype;
  v_tag exam_private.question_tags%rowtype;
  v_mark exam_private.question_marks%rowtype;
  v_tag_id uuid;
  v_other uuid;
  v_name text;
  v_affected bytea;
  v_remap jsonb := '{}'::jsonb;
  v_merged jsonb := '[]'::jsonb;
  v_touched_answers bytea[] := '{}';
  v_touched_tags uuid[] := '{}';
  v_touched_marks bytea[] := '{}';
  v_page_end bigint;
  v_has_more boolean := false;
  v_answers jsonb;
  v_attempts jsonb;
  v_tags jsonb;
  v_marks jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or (p_changes - array['answers', 'attempts', 'tags', 'marks']) <> '{}'::jsonb
    or octet_length(p_changes::text) > 1048576
  then raise exception 'Changes must be an object of at most 1 MiB' using errcode = '22023'; end if;
  for v_name in select unnest(array['answers', 'attempts', 'tags', 'marks'])
  loop
    if jsonb_typeof(coalesce(p_changes -> v_name, '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(p_changes -> v_name, '[]'::jsonb)) > 200
    then raise exception 'Each change list must be an array of at most 200 items' using errcode = '22023'; end if;
  end loop;
  if p_cursor is null or p_cursor < 0 or p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Invalid cursor or page size' using errcode = '22023';
  end if;

  -- One exchange per account at a time, so seq numbers follow commit order
  -- and a reader can never skip a slower concurrent write.
  perform pg_advisory_xact_lock(hashtextextended('exam-docs-question-sync:' || v_user_id::text, 0));
  insert into exam_private.question_sync_heads(user_id) values (v_user_id) on conflict do nothing;
  select cursor into v_head from exam_private.question_sync_heads where user_id = v_user_id;
  v_start := v_head;
  if v_cursor > v_head then
    v_cursor := 0;
    v_reset := true;
  end if;

  -- Submissions: immutable facts, idempotent by attempt id.
  for v_item in select value from jsonb_array_elements(coalesce(p_changes -> 'attempts', '[]'::jsonb))
  loop
    if jsonb_typeof(v_item) <> 'object'
      or (v_item - array['attemptId', 'documentPath', 'questionId', 'questionRevision', 'state', 'createdAt']) <> '{}'::jsonb
      or jsonb_typeof(v_item -> 'attemptId') is distinct from 'string'
      or jsonb_typeof(v_item -> 'documentPath') is distinct from 'string'
      or jsonb_typeof(v_item -> 'questionId') is distinct from 'string'
      or jsonb_typeof(v_item -> 'questionRevision') is distinct from 'string'
      or jsonb_typeof(v_item -> 'createdAt') is distinct from 'string'
      or length(v_item ->> 'createdAt') > 64
      or not exam_private.valid_question_state(v_item -> 'state')
    then raise exception 'Invalid submission attempt' using errcode = '22023'; end if;
    if (v_item #>> '{state,submitted}')::boolean is not true or (v_item #>> '{state,attempt}')::bigint < 1 then
      raise exception 'A submission must be submitted with a positive attempt count' using errcode = '22023';
    end if;
    v_created := (v_item ->> 'createdAt')::timestamptz;
    if not isfinite(v_created) then raise exception 'Invalid submission timestamp' using errcode = '22023'; end if;
    v_head := v_head + 1;
    insert into exam_private.question_attempts(user_id, attempt_id, document_path, question_id,
        question_revision, state, client_created_at, seq)
      values (v_user_id, (v_item ->> 'attemptId')::uuid, v_item ->> 'documentPath', v_item ->> 'questionId',
        v_item ->> 'questionRevision', v_item -> 'state', v_created, v_head)
      on conflict (user_id, attempt_id) do nothing;
    if not found then v_head := v_head - 1; end if;
  end loop;

  -- Current answers: the newer write wins; a retried write is a no-op.
  for v_item in select value from jsonb_array_elements(coalesce(p_changes -> 'answers', '[]'::jsonb))
  loop
    if jsonb_typeof(v_item) <> 'object'
      or (v_item - array['documentPath', 'questionId', 'questionRevision', 'state', 'updatedAt']) <> '{}'::jsonb
      or jsonb_typeof(v_item -> 'documentPath') is distinct from 'string'
      or jsonb_typeof(v_item -> 'questionId') is distinct from 'string'
      or jsonb_typeof(v_item -> 'questionRevision') is distinct from 'string'
      or jsonb_typeof(v_item -> 'updatedAt') is distinct from 'string'
      or length(v_item ->> 'updatedAt') > 64
      or not exam_private.valid_question_state(v_item -> 'state')
    then raise exception 'Invalid answer' using errcode = '22023'; end if;
    v_document_path := v_item ->> 'documentPath';
    v_question_id := v_item ->> 'questionId';
    v_revision := v_item ->> 'questionRevision';
    if length(v_document_path) not between 1 and 2048
      or length(v_question_id) not between 1 and 200
      or length(v_revision) not between 1 and 128
    then raise exception 'Invalid question identity' using errcode = '22023'; end if;
    -- A device clock far in the future must not win every later edit.
    v_updated := least((v_item ->> 'updatedAt')::timestamptz, now() + interval '5 minutes');
    if not isfinite(v_updated) then raise exception 'Invalid answer timestamp' using errcode = '22023'; end if;
    v_hash := sha256(convert_to(jsonb_build_array(v_document_path, v_question_id, v_revision)::text, 'UTF8'));
    v_touched_answers := v_touched_answers || v_hash;

    select * into v_progress from exam_private.question_progress
      where user_id = v_user_id and identity_hash = v_hash;
    if found and (v_progress.document_path <> v_document_path
      or v_progress.question_id <> v_question_id or v_progress.question_revision <> v_revision)
    then raise exception 'Question identity hash collision' using errcode = '22023'; end if;
    if found and v_progress.updated_at >= v_updated then continue; end if;

    v_head := v_head + 1;
    insert into exam_private.question_progress(user_id, identity_hash, document_path, question_id,
        question_revision, state, updated_at, seq)
      values (v_user_id, v_hash, v_document_path, v_question_id, v_revision, v_item -> 'state', v_updated, v_head)
      on conflict (user_id, identity_hash) do update
        set state = excluded.state, updated_at = excluded.updated_at, seq = excluded.seq;
  end loop;

  -- Tags before marks: marks in the same request may use a tag created here.
  for v_item in select value from jsonb_array_elements(coalesce(p_changes -> 'tags', '[]'::jsonb))
  loop
    if jsonb_typeof(v_item) <> 'object'
      or (v_item - array['tagId', 'name', 'color', 'createdAt', 'updatedAt', 'deleted']) <> '{}'::jsonb
      or jsonb_typeof(v_item -> 'tagId') is distinct from 'string'
      or jsonb_typeof(v_item -> 'name') is distinct from 'string'
      or jsonb_typeof(v_item -> 'color') is distinct from 'string'
      or jsonb_typeof(v_item -> 'createdAt') is distinct from 'string'
      or jsonb_typeof(v_item -> 'updatedAt') is distinct from 'string'
      or jsonb_typeof(v_item -> 'deleted') is distinct from 'boolean'
      or length(v_item ->> 'createdAt') > 64 or length(v_item ->> 'updatedAt') > 64
    then raise exception 'Invalid tag' using errcode = '22023'; end if;
    v_tag_id := (v_item ->> 'tagId')::uuid;
    v_name := v_item ->> 'name';
    v_created := (v_item ->> 'createdAt')::timestamptz;
    v_updated := least((v_item ->> 'updatedAt')::timestamptz, now() + interval '5 minutes');
    if not isfinite(v_created) or not isfinite(v_updated) then
      raise exception 'Invalid tag timestamp' using errcode = '22023';
    end if;

    select * into v_tag from exam_private.question_tags where user_id = v_user_id and tag_id = v_tag_id;
    v_found := found;
    if v_found and v_tag.updated_at >= v_updated then
      v_touched_tags := v_touched_tags || v_tag_id;
      continue;
    end if;

    if not (v_item ->> 'deleted')::boolean then
      select tag_id into v_other from exam_private.question_tags
        where user_id = v_user_id and lower(name) = lower(v_name) and not deleted and tag_id <> v_tag_id;
      if found then
        if not v_found then
          -- The same name created on two devices: fold the newcomer into the existing tag.
          v_remap := v_remap || jsonb_build_object(v_tag_id::text, v_other);
          v_merged := v_merged || jsonb_build_array(jsonb_build_object('from', v_tag_id, 'to', v_other));
          v_touched_tags := v_touched_tags || v_other;
        else
          -- A rename onto a taken name loses; the device receives the current row.
          v_touched_tags := v_touched_tags || v_tag_id;
        end if;
        continue;
      end if;
      if not v_found and (select count(*) from exam_private.question_tags
        where user_id = v_user_id and not deleted) >= 200
      then raise exception 'At most 200 tags per account' using errcode = '22023'; end if;
    end if;

    v_head := v_head + 1;
    insert into exam_private.question_tags(user_id, tag_id, name, color, deleted, created_at, updated_at, seq)
      values (v_user_id, v_tag_id, v_name, v_item ->> 'color', (v_item ->> 'deleted')::boolean,
        coalesce(v_tag.created_at, v_created), v_updated, v_head)
      on conflict (user_id, tag_id) do update
        set name = excluded.name, color = excluded.color, deleted = excluded.deleted,
          updated_at = excluded.updated_at, seq = excluded.seq;
    v_touched_tags := v_touched_tags || v_tag_id;

    if (v_item ->> 'deleted')::boolean then
      -- Questions that lost the tag change too; every device must hear about them.
      for v_affected in
        delete from exam_private.question_mark_tags where user_id = v_user_id and tag_id = v_tag_id
        returning identity_hash
      loop
        v_head := v_head + 1;
        update exam_private.question_marks set seq = v_head
          where user_id = v_user_id and identity_hash = v_affected;
      end loop;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_changes -> 'marks', '[]'::jsonb))
  loop
    if jsonb_typeof(v_item) <> 'object'
      or (v_item - array['documentPath', 'questionId', 'favorite', 'note', 'tagIds', 'excerpt', 'updatedAt']) <> '{}'::jsonb
      or jsonb_typeof(v_item -> 'documentPath') is distinct from 'string'
      or jsonb_typeof(v_item -> 'questionId') is distinct from 'string'
      or jsonb_typeof(v_item -> 'favorite') is distinct from 'boolean'
      or jsonb_typeof(v_item -> 'note') is distinct from 'string'
      or jsonb_typeof(v_item -> 'excerpt') is distinct from 'string'
      or jsonb_typeof(v_item -> 'updatedAt') is distinct from 'string'
      or jsonb_typeof(v_item -> 'tagIds') is distinct from 'array'
      or jsonb_array_length(v_item -> 'tagIds') > 20
      or length(v_item ->> 'updatedAt') > 64
      or exists (select 1 from jsonb_array_elements(v_item -> 'tagIds') as id(value)
        where jsonb_typeof(id.value) <> 'string')
    then raise exception 'Invalid question mark' using errcode = '22023'; end if;
    v_document_path := v_item ->> 'documentPath';
    v_question_id := v_item ->> 'questionId';
    if length(v_document_path) not between 1 and 2048 or length(v_question_id) not between 1 and 200 then
      raise exception 'Invalid question identity' using errcode = '22023';
    end if;
    v_updated := least((v_item ->> 'updatedAt')::timestamptz, now() + interval '5 minutes');
    if not isfinite(v_updated) then raise exception 'Invalid mark timestamp' using errcode = '22023'; end if;
    v_hash := exam_private.annotation_identity_hash(v_document_path, v_question_id);
    v_touched_marks := v_touched_marks || v_hash;

    select * into v_mark from exam_private.question_marks where user_id = v_user_id and identity_hash = v_hash;
    if found and v_mark.updated_at >= v_updated then continue; end if;

    v_head := v_head + 1;
    insert into exam_private.question_marks(user_id, identity_hash, document_path, question_id,
        favorite, note, excerpt, updated_at, seq)
      values (v_user_id, v_hash, v_document_path, v_question_id, (v_item ->> 'favorite')::boolean,
        v_item ->> 'note', v_item ->> 'excerpt', v_updated, v_head)
      on conflict (user_id, identity_hash) do update
        set favorite = excluded.favorite, note = excluded.note, excerpt = excluded.excerpt,
          updated_at = excluded.updated_at, seq = excluded.seq;
    delete from exam_private.question_mark_tags where user_id = v_user_id and identity_hash = v_hash;
    -- Unknown and deleted tags are dropped rather than failing the batch.
    insert into exam_private.question_mark_tags(user_id, identity_hash, tag_id)
      select v_user_id, v_hash, t.tag_id
      from jsonb_array_elements_text(v_item -> 'tagIds') as id(value)
      join exam_private.question_tags as t
        on t.user_id = v_user_id and not t.deleted
        and t.tag_id::text = coalesce(v_remap ->> id.value, id.value)
      on conflict do nothing;
  end loop;

  if v_head <> v_start then
    update exam_private.question_sync_heads set cursor = v_head where user_id = v_user_id;
  end if;

  -- One page of the compacted feed across the four tables (each read through
  -- its (user_id, seq) index), plus the current row of everything this request
  -- sent, so the device can settle its writes.
  select seq into v_page_end from (
    (select seq from exam_private.question_progress where user_id = v_user_id and seq > v_cursor order by seq limit p_limit)
    union all
    (select seq from exam_private.question_attempts where user_id = v_user_id and seq > v_cursor order by seq limit p_limit)
    union all
    (select seq from exam_private.question_tags where user_id = v_user_id and seq > v_cursor order by seq limit p_limit)
    union all
    (select seq from exam_private.question_marks where user_id = v_user_id and seq > v_cursor order by seq limit p_limit)
  ) as feed order by seq offset p_limit - 1 limit 1;
  if v_page_end is null then
    v_page_end := v_head;
  else
    v_has_more := exists (select 1 from exam_private.question_progress where user_id = v_user_id and seq > v_page_end)
      or exists (select 1 from exam_private.question_attempts where user_id = v_user_id and seq > v_page_end)
      or exists (select 1 from exam_private.question_tags where user_id = v_user_id and seq > v_page_end)
      or exists (select 1 from exam_private.question_marks where user_id = v_user_id and seq > v_page_end);
    if not v_has_more then v_page_end := v_head; end if;
  end if;

  select coalesce(jsonb_agg(exam_private.answer_snapshot(p) order by p.seq), '[]'::jsonb) into v_answers
    from exam_private.question_progress as p
    where p.user_id = v_user_id and ((p.seq > v_cursor and p.seq <= v_page_end) or p.identity_hash = any(v_touched_answers));
  select coalesce(jsonb_agg(exam_private.attempt_snapshot(a) order by a.seq), '[]'::jsonb) into v_attempts
    from exam_private.question_attempts as a
    where a.user_id = v_user_id and a.seq > v_cursor and a.seq <= v_page_end;
  select coalesce(jsonb_agg(exam_private.question_tag_snapshot(t) order by t.seq), '[]'::jsonb) into v_tags
    from exam_private.question_tags as t
    where t.user_id = v_user_id and ((t.seq > v_cursor and t.seq <= v_page_end) or t.tag_id = any(v_touched_tags));
  select coalesce(jsonb_agg(exam_private.question_mark_snapshot(m) order by m.seq), '[]'::jsonb) into v_marks
    from exam_private.question_marks as m
    where m.user_id = v_user_id and ((m.seq > v_cursor and m.seq <= v_page_end) or m.identity_hash = any(v_touched_marks));

  return jsonb_build_object('answers', v_answers, 'attempts', v_attempts, 'tags', v_tags, 'marks', v_marks,
    'merged', v_merged, 'cursor', v_page_end::text, 'hasMore', v_has_more, 'reset', v_reset);
end;
$$;

revoke execute on function exam_private.sync(jsonb, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function exam_private.sync(jsonb, bigint, integer) to authenticated;

create function public.exam_sync(
  p_changes jsonb default '{}'::jsonb,
  p_cursor bigint default 0,
  p_limit integer default 200
)
returns jsonb
language sql security invoker
set search_path = ''
as $$ select exam_private.sync(p_changes, p_cursor, p_limit); $$;

revoke execute on function public.exam_sync(jsonb, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.exam_sync(jsonb, bigint, integer) to authenticated;

comment on function public.exam_sync(jsonb, bigint, integer) is
  'Authenticated reader-data sync: p_changes = {answers, attempts, tags, marks} (each at most 200 items, 1 MiB in total). Last writer wins per answer, tag and mark; attempts are immutable and idempotent by id. Returns the current row of everything sent plus one page of the compacted per-account feed (seq). Cursor is a decimal string; reset=true when the client cursor was ahead.';
