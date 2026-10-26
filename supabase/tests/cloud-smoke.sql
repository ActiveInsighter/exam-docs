-- Run as postgres after deploying the migrations, including through execute_sql.
-- Direct auth.users insertion sends no email and creates no Auth session.
-- Every fixture and write is rolled back; a pre-existing fixture UUID aborts.
begin;

do $$
begin
  if exists (select 1 from auth.users where id = 'e2f8c0e5-e0d9-4f10-9b22-df55b208a7b1') then
    raise exception 'Smoke fixture UUID already exists; choose a different UUID';
  end if;
  insert into auth.users(id) values ('e2f8c0e5-e0d9-4f10-9b22-df55b208a7b1');
end;
$$;

set local request.jwt.claim.sub = 'e2f8c0e5-e0d9-4f10-9b22-df55b208a7b1';
set local request.jwt.claims = '{"sub":"e2f8c0e5-e0d9-4f10-9b22-df55b208a7b1","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_answer jsonb := '{
    "documentPath":"/docs/__database_smoke__","questionId":"q1","questionRevision":"v1",
    "updatedAt":"2026-10-26T00:00:02Z","state":{"selected":["B"],"values":[],"submitted":true,"attempt":1}
  }';
  v_older jsonb := '{
    "documentPath":"/docs/__database_smoke__","questionId":"q1","questionRevision":"v1",
    "updatedAt":"2026-10-26T00:00:01Z","state":{"selected":["A"],"values":[],"submitted":true,"attempt":1}
  }';
  v_attempt jsonb := '{
    "attemptId":"cf0d3021-66c1-4351-96f4-e0d8ad849c0b",
    "documentPath":"/docs/__database_smoke__","questionId":"q1","questionRevision":"v1",
    "createdAt":"2026-10-26T00:00:02Z","state":{"selected":["B"],"values":[],"submitted":true,"attempt":1}
  }';
  v_tag jsonb := '{"tagId":"5d2f1c3e-7c1b-4e6a-9a55-0a7f6c1d2e3f","name":"__smoke__","color":"blue",
    "deleted":false,"createdAt":"2026-10-26T00:00:00Z","updatedAt":"2026-10-26T00:00:00Z"}';
  v_mark jsonb := '{"documentPath":"/docs/__database_smoke__","questionId":"q1","favorite":true,"note":"smoke",
    "excerpt":"","tagIds":["5d2f1c3e-7c1b-4e6a-9a55-0a7f6c1d2e3f"],"updatedAt":"2026-10-26T00:00:00Z"}';
  v_result jsonb;
begin
  if current_user <> 'authenticated' then raise exception 'Role switch failed'; end if;
  if has_function_privilege('anon', 'public.exam_sync(jsonb,bigint,integer)', 'EXECUTE') then
    raise exception 'Anonymous role can execute sync';
  end if;
  if has_table_privilege('authenticated', 'exam_private.question_progress', 'UPDATE') then
    raise exception 'Clients can bypass the sync RPC through table updates';
  end if;

  v_result := public.exam_sync(jsonb_build_object('answers', jsonb_build_array(v_answer), 'attempts', jsonb_build_array(v_attempt),
    'tags', jsonb_build_array(v_tag), 'marks', jsonb_build_array(v_mark)), 0, 100);
  if v_result #>> '{answers,0,state,selected,0}' <> 'B' or jsonb_array_length(v_result -> 'attempts') <> 1
    or v_result #>> '{marks,0,tagIds,0}' <> '5d2f1c3e-7c1b-4e6a-9a55-0a7f6c1d2e3f' or v_result ->> 'cursor' <> '4'
  then raise exception 'Initial sync failed: %', v_result; end if;

  v_result := public.exam_sync(jsonb_build_object('answers', jsonb_build_array(v_older), 'attempts', jsonb_build_array(v_attempt)), 4, 100);
  if v_result #>> '{answers,0,state,selected,0}' <> 'B' or v_result -> 'attempts' <> '[]'::jsonb or v_result ->> 'cursor' <> '4'
  then raise exception 'Older write or repeated attempt changed the account: %', v_result; end if;
end;
$$;

reset role;

do $$
begin
  if exists (select 1 from exam_private.question_progress where user_id = 'e2f8c0e5-e0d9-4f10-9b22-df55b208a7b1' and state @> '{"selected":["A"]}') then
    raise exception 'Older answer overwrote the newer one';
  end if;
end;
$$;

rollback;
