-- Run as postgres after deploying the migration, including through execute_sql.
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
  v_write jsonb := '{
    "operationId":"7850e752-329f-42e3-b332-d5d26804937a",
    "documentPath":"/docs/__database_smoke__","questionId":"q1","questionRevision":"v1",
    "baseVersion":0,"state":{"selected":["A"],"values":[],"submitted":false,"attempt":0}
  }';
  v_stale jsonb := '{
    "operationId":"b6d0cbac-26c0-4425-99c8-0180e4ec172b",
    "documentPath":"/docs/__database_smoke__","questionId":"q1","questionRevision":"v1",
    "baseVersion":0,"state":{"selected":["B"],"values":[],"submitted":true,"attempt":1},
    "attempt":{"attemptId":"cf0d3021-66c1-4351-96f4-e0d8ad849c0b",
      "createdAt":"2026-10-20T00:00:00Z",
      "state":{"selected":["B"],"values":[],"submitted":true,"attempt":1}}
  }';
  v_first jsonb;
  v_result jsonb;
  v_resolution jsonb;
begin
  if current_user <> 'authenticated' then raise exception 'Role switch failed'; end if;
  if has_function_privilege('anon', 'public.exam_sync_question_state(jsonb,bigint,integer)', 'EXECUTE') then
    raise exception 'Anonymous role can execute sync';
  end if;
  if has_table_privilege('authenticated', 'exam_private.question_progress', 'UPDATE') then
    raise exception 'Clients can bypass CAS through table updates';
  end if;

  v_first := public.exam_sync_question_state(jsonb_build_array(v_write), 0, 100);
  if v_first #>> '{receipts,0,status}' <> 'applied'
    or v_first #>> '{receipts,0,record,version}' <> '1' or v_first ->> 'cursor' <> '1'
  then raise exception 'Initial apply failed: %', v_first; end if;

  v_result := public.exam_sync_question_state(jsonb_build_array(v_write), 1, 100);
  if v_result -> 'receipts' <> v_first -> 'receipts' or v_result -> 'changes' <> '[]'::jsonb
    or v_result ->> 'cursor' <> '1'
  then raise exception 'Idempotent retry failed: %', v_result; end if;

  v_result := public.exam_sync_question_state(jsonb_build_array(v_stale), 1, 100);
  if v_result #>> '{receipts,0,status}' <> 'conflict'
    or v_result #>> '{receipts,0,record,state,selected,0}' <> 'A'
    or jsonb_array_length(v_result -> 'attempts') <> 1 or v_result ->> 'cursor' <> '2'
  then raise exception 'Conflict lost server progress or immutable attempt: %', v_result; end if;

  v_result := public.exam_sync_question_state('[]', 0, 1);
  if v_result ->> 'cursor' <> '1' or v_result ->> 'hasMore' <> 'true'
    or jsonb_array_length(v_result -> 'changes') <> 1
  then raise exception 'First event page failed: %', v_result; end if;
  v_result := public.exam_sync_question_state('[]', 1, 1);
  if v_result ->> 'cursor' <> '2' or v_result ->> 'hasMore' <> 'false'
    or jsonb_array_length(v_result -> 'attempts') <> 1
  then raise exception 'Second event page failed: %', v_result; end if;

  v_resolution := jsonb_set(jsonb_set(v_stale, '{operationId}', '"9cbb354e-f716-4801-bb2e-ef43fe6658ca"'), '{baseVersion}', '1');
  v_resolution := jsonb_set(v_resolution, '{state,selected}', '["C"]');
  v_result := public.exam_sync_question_state(jsonb_build_array(v_resolution), 2, 100);
  if v_result #>> '{receipts,0,status}' <> 'applied'
    or v_result #>> '{receipts,0,record,version}' <> '2'
    or v_result -> 'attempts' <> '[]'::jsonb or v_result ->> 'cursor' <> '3'
  then raise exception 'Conflict resolution duplicated the attempt: %', v_result; end if;

  begin
    perform public.exam_sync_question_state(jsonb_build_array(jsonb_set(jsonb_set(v_stale,
      '{operationId}', '"b2cb59eb-7be1-45a0-bdfd-aebf131c8662"'), '{attempt,state,submitted}', 'false')), 3, 100);
    raise exception 'A draft was accepted as an immutable submission';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform count(*) from exam_private.question_progress;
    raise exception 'Direct private table access was permitted';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.exam_sync_question_state('[]', 0, 100);
    raise exception 'Missing user identity was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
do $$
declare v_owner uuid := 'e2f8c0e5-e0d9-4f10-9b22-df55b208a7b1';
begin
  if (select count(*) from exam_private.question_progress where user_id = v_owner) <> 1
    or (select count(*) from exam_private.question_attempts where user_id = v_owner) <> 1
    or (select count(*) from exam_private.question_operations where user_id = v_owner) <> 3
    or (select count(*) from exam_private.question_events where user_id = v_owner) <> 3
  then raise exception 'Unexpected fixture counts after retries and conflicts'; end if;
end;
$$;

rollback;

select 'question sync smoke passed; fixtures rolled back' as result,
  not exists (select 1 from auth.users where id = 'e2f8c0e5-e0d9-4f10-9b22-df55b208a7b1') as fixture_removed;
