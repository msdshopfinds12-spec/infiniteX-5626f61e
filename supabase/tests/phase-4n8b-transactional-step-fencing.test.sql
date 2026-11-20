-- Run after applying the migration in a disposable local Supabase test database.
-- Catalog contract only: this does not replace semantic or concurrency integration tests.
do $test$
declare
  v_signature regprocedure := to_regprocedure(
    'public.simula_transition_workflow_step(uuid,uuid,uuid,integer,text,jsonb,jsonb,text)'
  );
  v_required record;
  v_table regclass;
  v_has_unique boolean;
begin
  if v_signature is null then
    raise exception 'missing transactional step transition RPC';
  end if;

  if not has_function_privilege('service_role', v_signature, 'EXECUTE') then
    raise exception 'service_role must be able to execute the transition RPC';
  end if;
  if has_function_privilege('anon', v_signature, 'EXECUTE') then
    raise exception 'anon must not be able to execute the transition RPC';
  end if;
  if has_function_privilege('authenticated', v_signature, 'EXECUTE') then
    raise exception 'authenticated must not be able to execute the transition RPC';
  end if;

  -- Verify every relation/column referenced by the transition contract exists.
  for v_required in
    select *
    from (values
      ('public.workflow_runs', 'id'),
      ('public.workflow_runs', 'workflow_id'),
      ('public.workflow_runs', 'owner_id'),
      ('public.workflow_runs', 'status'),
      ('public.workflow_runs', 'attempt'),
      ('public.workflows', 'id'),
      ('public.workflows', 'owner_id'),
      ('public.workflow_steps', 'id'),
      ('public.workflow_steps', 'workflow_id'),
      ('public.workflow_step_runs', 'id'),
      ('public.workflow_step_runs', 'run_id'),
      ('public.workflow_step_runs', 'step_id'),
      ('public.workflow_step_runs', 'owner_id'),
      ('public.workflow_step_runs', 'status'),
      ('public.workflow_step_runs', 'input'),
      ('public.workflow_step_runs', 'output'),
      ('public.workflow_step_runs', 'error_message'),
      ('public.workflow_step_runs', 'attempt'),
      ('public.workflow_step_runs', 'started_at'),
      ('public.workflow_step_runs', 'finished_at')
    ) as required(relation_name, column_name)
  loop
    v_table := to_regclass(v_required.relation_name);
    if v_table is null then
      raise exception 'missing_required_relation:%', v_required.relation_name;
    end if;
    if not exists (
      select 1
      from pg_attribute a
      where a.attrelid = v_table
        and a.attname = v_required.column_name
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'missing_required_column:%.%', v_required.relation_name, v_required.column_name;
    end if;
  end loop;

  -- The upsert relies on this exact unique key for idempotent step identity.
  select exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.workflow_step_runs'::regclass
      and c.contype = 'u'
      and (
        select array_agg(a.attname order by key_position.ordinality)
        from unnest(c.conkey) with ordinality as key_position(attnum, ordinality)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = key_position.attnum
      ) = array['run_id', 'step_id']::name[]
  ) into v_has_unique;

  if not v_has_unique then
    raise exception 'missing_unique_constraint_workflow_step_runs_run_id_step_id';
  end if;
end
$test$;
