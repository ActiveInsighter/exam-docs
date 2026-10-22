-- Question annotations: the reader's own tags, favourites and notes.
--
-- * Belong to a question (document path + question id), not to one revision,
--   so a corrected typo in a question keeps the reader's note.
-- * Tags are per account. A tag's name is unique among the account's live
--   tags (case-insensitive); deleted tags stay as tombstones so the deletion
--   reaches every device.
-- * Question ↔ tag links are a junction table with real foreign keys, so a
--   link can never point at another account's tag or outlive its tag.
-- * Sync is last-writer-wins per tag and per question, through one
--   authenticated RPC with a compacted per-account feed (seq), like answers.
--   Browsers never get table privileges.

create function exam_private.annotation_identity_hash(p_document_path text, p_question_id text)
returns bytea
language sql immutable security invoker
set search_path = ''
as $$ select sha256(convert_to(jsonb_build_array(p_document_path, p_question_id)::text, 'UTF8')); $$;
revoke execute on function exam_private.annotation_identity_hash(text, text) from public, anon, authenticated, service_role;

create table exam_private.question_annotation_heads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cursor bigint not null default 0 check (cursor >= 0)
);

create table exam_private.question_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  tag_id uuid not null,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 24 and name !~ '[[:cntrl:]]'),
  color text not null check (color in ('gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink')),
  deleted boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  seq bigint not null check (seq > 0),
  primary key (user_id, tag_id)
);
create unique index question_tags_live_name on exam_private.question_tags (user_id, lower(name)) where not deleted;
create unique index question_tags_feed on exam_private.question_tags (user_id, seq);

create table exam_private.question_marks (
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Fixed-size key: long UTF-8 paths could exceed a B-tree entry.
  identity_hash bytea not null check (octet_length(identity_hash) = 32),
  document_path text not null check (length(document_path) between 1 and 2048),
  question_id text not null check (length(question_id) between 1 and 200),
  favorite boolean not null default false,
  note text not null default '' check (char_length(note) <= 4000),
  excerpt text not null default '' check (char_length(excerpt) <= 160),
  updated_at timestamptz not null,
  seq bigint not null check (seq > 0),
  primary key (user_id, identity_hash),
  check (identity_hash = exam_private.annotation_identity_hash(document_path, question_id))
);
create unique index question_marks_feed on exam_private.question_marks (user_id, seq);
-- "My favourites", newest first, without scanning notes-only rows.
create index question_marks_favorites on exam_private.question_marks (user_id, updated_at desc) where favorite;

create table exam_private.question_mark_tags (
  user_id uuid not null,
  identity_hash bytea not null,
  tag_id uuid not null,
  primary key (user_id, identity_hash, tag_id),
  foreign key (user_id, identity_hash) references exam_private.question_marks (user_id, identity_hash) on delete cascade,
  foreign key (user_id, tag_id) references exam_private.question_tags (user_id, tag_id) on delete cascade
);
-- "Questions with tag X" and tag deletion.
create index question_mark_tags_by_tag on exam_private.question_mark_tags (user_id, tag_id);

alter table exam_private.question_annotation_heads enable row level security;
alter table exam_private.question_tags enable row level security;
alter table exam_private.question_marks enable row level security;
alter table exam_private.question_mark_tags enable row level security;
create policy question_annotation_heads_owner on exam_private.question_annotation_heads
  for select to authenticated using (user_id = (select auth.uid()));
create policy question_tags_owner on exam_private.question_tags
  for select to authenticated using (user_id = (select auth.uid()));
create policy question_marks_owner on exam_private.question_marks
  for select to authenticated using (user_id = (select auth.uid()));
create policy question_mark_tags_owner on exam_private.question_mark_tags
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on exam_private.question_annotation_heads, exam_private.question_tags,
  exam_private.question_marks, exam_private.question_mark_tags from public, anon, authenticated, service_role;

create function exam_private.question_tag_snapshot(p_row exam_private.question_tags)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object('tagId', p_row.tag_id, 'name', p_row.name, 'color', p_row.color,
    'deleted', p_row.deleted, 'createdAt', p_row.created_at, 'updatedAt', p_row.updated_at);
$$;

create function exam_private.question_mark_snapshot(p_row exam_private.question_marks)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select jsonb_build_object('documentPath', p_row.document_path, 'questionId', p_row.question_id,
    'favorite', p_row.favorite, 'note', p_row.note, 'excerpt', p_row.excerpt, 'updatedAt', p_row.updated_at,
    'tagIds', coalesce((select jsonb_agg(t.tag_id order by t.tag_id) from exam_private.question_mark_tags as t
      where t.user_id = p_row.user_id and t.identity_hash = p_row.identity_hash), '[]'::jsonb));
$$;
revoke execute on function exam_private.question_tag_snapshot(exam_private.question_tags) from public, anon, authenticated, service_role;
revoke execute on function exam_private.question_mark_snapshot(exam_private.question_marks) from public, anon, authenticated, service_role;

-- Definer privileges only to write tables the browser cannot touch. Checks the
-- caller's uid, uses fully qualified names and an empty search path.
create function exam_private.sync_question_annotations(
  p_tags jsonb,
  p_marks jsonb,
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
  v_item jsonb;
  v_tag exam_private.question_tags%rowtype;
  v_mark exam_private.question_marks%rowtype;
  v_found boolean;
  v_tag_id uuid;
  v_other uuid;
  v_name text;
  v_updated timestamptz;
  v_created timestamptz;
  v_hash bytea;
  v_document_path text;
  v_question_id text;
  v_affected bytea;
  v_remap jsonb := '{}'::jsonb;
  v_merged jsonb := '[]'::jsonb;
  v_touched_tags uuid[] := '{}';
  v_touched_marks bytea[] := '{}';
  v_page_end bigint;
  v_has_more boolean := false;
  v_tags jsonb;
  v_marks jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_tags is null or jsonb_typeof(p_tags) <> 'array' or jsonb_array_length(p_tags) > 200
    or p_marks is null or jsonb_typeof(p_marks) <> 'array' or jsonb_array_length(p_marks) > 200
    or octet_length(p_tags::text) + octet_length(p_marks::text) > 1048576
  then raise exception 'Tags and marks must be arrays of at most 200 items and 1 MiB' using errcode = '22023'; end if;
  if p_cursor is null or p_cursor < 0 or p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Invalid cursor or page size' using errcode = '22023';
  end if;

  -- One exchange per account at a time, so seq numbers follow commit order.
  perform pg_advisory_xact_lock(hashtextextended('exam-docs-question-annotations:' || v_user_id::text, 0));
  insert into exam_private.question_annotation_heads(user_id) values (v_user_id) on conflict do nothing;
  select cursor into v_head from exam_private.question_annotation_heads where user_id = v_user_id;
  v_start := v_head;
  if v_cursor > v_head then
    v_cursor := 0;
    v_reset := true;
  end if;

  -- Tags first: marks in the same request may use a tag created here.
  for v_item in select value from jsonb_array_elements(p_tags)
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
    -- A device clock far in the future must not win every later edit.
    v_updated := least((v_item ->> 'updatedAt')::timestamptz, now() + interval '5 minutes');
    if not isfinite(v_created) or not isfinite(v_updated) then
      raise exception 'Invalid tag timestamp' using errcode = '22023';
    end if;

    select * into v_tag from exam_private.question_tags where user_id = v_user_id and tag_id = v_tag_id;
    v_found := found;
    if v_found and v_tag.updated_at > v_updated then
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

  for v_item in select value from jsonb_array_elements(p_marks)
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

    select * into v_mark from exam_private.question_marks where user_id = v_user_id and identity_hash = v_hash;
    if found and v_mark.updated_at > v_updated then
      v_touched_marks := v_touched_marks || v_hash;
      continue;
    end if;

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
    v_touched_marks := v_touched_marks || v_hash;
  end loop;

  if v_head <> v_start then
    update exam_private.question_annotation_heads set cursor = v_head where user_id = v_user_id;
  end if;

  -- One page of the compacted feed across both tables, plus the current row
  -- of everything this request sent, so the device can settle its writes.
  select seq into v_page_end from (
    select seq from exam_private.question_tags where user_id = v_user_id and seq > v_cursor
    union all
    select seq from exam_private.question_marks where user_id = v_user_id and seq > v_cursor
  ) as feed order by seq offset p_limit - 1 limit 1;
  if v_page_end is null then
    v_page_end := v_head;
  else
    v_has_more := exists (select 1 from exam_private.question_tags where user_id = v_user_id and seq > v_page_end)
      or exists (select 1 from exam_private.question_marks where user_id = v_user_id and seq > v_page_end);
  end if;

  select coalesce(jsonb_agg(exam_private.question_tag_snapshot(t) order by t.seq), '[]'::jsonb) into v_tags
    from exam_private.question_tags as t
    where t.user_id = v_user_id and ((t.seq > v_cursor and t.seq <= v_page_end) or t.tag_id = any(v_touched_tags));
  select coalesce(jsonb_agg(exam_private.question_mark_snapshot(m) order by m.seq), '[]'::jsonb) into v_marks
    from exam_private.question_marks as m
    where m.user_id = v_user_id and ((m.seq > v_cursor and m.seq <= v_page_end) or m.identity_hash = any(v_touched_marks));

  return jsonb_build_object('tags', v_tags, 'marks', v_marks, 'merged', v_merged,
    'cursor', (case when v_has_more then v_page_end else v_head end)::text,
    'hasMore', v_has_more, 'reset', v_reset);
end;
$$;

revoke execute on function exam_private.sync_question_annotations(jsonb, jsonb, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function exam_private.sync_question_annotations(jsonb, jsonb, bigint, integer) to authenticated;

create function public.exam_sync_question_annotations(
  p_tags jsonb default '[]'::jsonb,
  p_marks jsonb default '[]'::jsonb,
  p_cursor bigint default 0,
  p_limit integer default 200
)
returns jsonb
language sql security invoker
set search_path = ''
as $$ select exam_private.sync_question_annotations(p_tags, p_marks, p_cursor, p_limit); $$;

revoke execute on function public.exam_sync_question_annotations(jsonb, jsonb, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.exam_sync_question_annotations(jsonb, jsonb, bigint, integer) to authenticated;

comment on function public.exam_sync_question_annotations(jsonb, jsonb, bigint, integer) is
  'Authenticated tag / favourite / note sync: at most 200 tags and 200 marks (1 MiB) per call, last writer wins per row, same-name tags merged, compacted per-user feed (seq). Cursor is a decimal string; reset=true when the client cursor was ahead.';
