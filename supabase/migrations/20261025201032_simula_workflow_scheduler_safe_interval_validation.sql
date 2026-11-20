
create or replace function private.simula_enqueue_due_workflows()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer := 0;
begin
  with due as materialized (
    select
      w.id,
      w.owner_id,
      w.next_run_at,
      case
        when (w.trigger_config ->> 'interval_seconds') ~ '^[0-9]{1,7}$'
        then (w.trigger_config ->> 'interval_seconds')::integer
        else null
      end as interval_seconds
    from public.workflows as w
    where w.status = 'active'
      and w.trigger_type = 'schedule'
      and w.next_run_at is not null
      and w.next_run_at <= now()
      and case
        when (w.trigger_config ->> 'interval_seconds') ~ '^[0-9]{1,7}$'
        then (w.trigger_config ->> 'interval_seconds')::integer between 60 and 2592000
        else false
      end
    order by w.next_run_at
    limit 100
    for update skip locked
  ),
  inserted as (
    insert into public.workflow_runs (
      workflow_id, owner_id, scheduled_for, status, input
    )
    select
      d.id, d.owner_id, d.next_run_at, 'queued',
      jsonb_build_object('trigger', 'schedule', 'scheduled_for', d.next_run_at)
    from due as d
    on conflict (workflow_id, scheduled_for) do nothing
    returning id
  ),
  advanced as (
    update public.workflows as w
    set
      next_run_at = d.next_run_at + make_interval(secs => d.interval_seconds),
      updated_at = now()
    from due as d
    where w.id = d.id
    returning w.id
  )
  select count(*)::integer into v_count from inserted;

  return v_count;
end;
$function$;

revoke all on function private.simula_enqueue_due_workflows()
  from public, anon, authenticated;
grant execute on function private.simula_enqueue_due_workflows() to postgres;
