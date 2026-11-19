-- Phase 4N.8B: serialize every step transition against its parent run generation.
-- This file is repository-only until an explicitly approved migration is applied.

create or replace function public.simula_transition_workflow_step(
  p_run_id uuid,
  p_step_id uuid,
  p_owner_id uuid,
  p_attempt integer,
  p_transition text,
  p_input jsonb,
  p_output jsonb,
  p_error_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_workflow_id uuid;
  v_run_owner_id uuid;
  v_run_status text;
  v_run_attempt integer;
  v_step_run_id uuid;
begin
  if p_run_id is null or p_step_id is null or p_owner_id is null then
    raise exception 'workflow_step_transition_invalid_identity' using errcode = '22023';
  end if;

  if p_attempt is null or p_attempt < 1 then
    raise exception 'workflow_step_transition_invalid_attempt' using errcode = '22023';
  end if;

  if p_transition is null or p_transition not in ('start', 'succeed', 'fail') then
    raise exception 'workflow_step_transition_invalid_operation' using errcode = '22023';
  end if;

  -- The parent row is the serialization point shared with queue claim and stale recovery.
  select wr.workflow_id, wr.owner_id, wr.status, wr.attempt
    into v_workflow_id, v_run_owner_id, v_run_status, v_run_attempt
  from public.workflow_runs as wr
  where wr.id = p_run_id
  for update;

  if not found then
    raise exception 'workflow_run_not_found' using errcode = 'P0002';
  end if;

  if v_run_owner_id is distinct from p_owner_id
     or v_run_status <> 'running'
     or v_run_attempt <> p_attempt then
    raise exception 'workflow_step_attempt_superseded' using errcode = '40001';
  end if;

  if not exists (
    select 1
    from public.workflows as w
    where w.id = v_workflow_id
      and w.owner_id = p_owner_id
  ) then
    raise exception 'workflow_owner_validation_failed' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.workflow_steps as ws
    where ws.id = p_step_id
      and ws.workflow_id = v_workflow_id
  ) then
    raise exception 'workflow_step_not_in_run_workflow' using errcode = '23503';
  end if;

  if p_transition = 'start' then
    insert into public.workflow_step_runs (
      run_id, step_id, owner_id, status, input, output,
      error_message, attempt, started_at, finished_at
    )
    values (
      p_run_id, p_step_id, p_owner_id, 'running',
      coalesce(p_input, '{}'::jsonb), null, null,
      p_attempt, now(), null
    )
    on conflict (run_id, step_id) do update
      set owner_id = excluded.owner_id,
          status = 'running',
          input = excluded.input,
          output = null,
          error_message = null,
          attempt = excluded.attempt,
          started_at = now(),
          finished_at = null
      where workflow_step_runs.attempt < excluded.attempt
    returning id into v_step_run_id;

    if v_step_run_id is null then
      raise exception 'workflow_step_attempt_superseded' using errcode = '40001';
    end if;
  else
    if p_transition = 'succeed' and p_output is null then
      raise exception 'workflow_step_output_required' using errcode = '22023';
    end if;

    update public.workflow_step_runs as sr
    set status = case when p_transition = 'succeed' then 'succeeded' else 'failed' end,
        output = case when p_transition = 'succeed' then p_output else null end,
        error_message = case when p_transition = 'fail' then left(coalesce(p_error_message, 'step_failed'), 500) else null end,
        finished_at = now()
    where sr.run_id = p_run_id
      and sr.step_id = p_step_id
      and sr.owner_id = p_owner_id
      and sr.attempt = p_attempt
      and sr.status = 'running'
    returning sr.id into v_step_run_id;

    if v_step_run_id is null then
      raise exception 'workflow_step_attempt_superseded' using errcode = '40001';
    end if;

  end if;

  return v_step_run_id;
end;
$function$;

revoke all on function public.simula_transition_workflow_step(uuid, uuid, uuid, integer, text, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.simula_transition_workflow_step(uuid, uuid, uuid, integer, text, jsonb, jsonb, text)
  to service_role;
