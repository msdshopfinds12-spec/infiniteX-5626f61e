
begin;

-- Enable Supabase Cron as documented by Supabase.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Extend the existing workflow schema; do not create duplicate tables.
alter table public.workflow_runs
  add column if not exists scheduled_for timestamptz;

create unique index if not exists workflow_runs_workflow_scheduled_for_uidx
  on public.workflow_runs (workflow_id, scheduled_for);

-- Keep privileged scheduler logic in a non-exposed schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres;

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
      (w.trigger_config ->> 'interval_seconds')::integer as interval_seconds
    from public.workflows as w
    where w.status = 'active'
      and w.trigger_type = 'schedule'
      and w.next_run_at is not null
      and w.next_run_at <= now()
      and coalesce(w.trigger_config ->> 'interval_seconds', '') ~ '^[0-9]+$'
      and (w.trigger_config ->> 'interval_seconds')::integer between 60 and 2592000
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

-- Replace only this specifically named job, if it already exists.
do $block$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'simula-enqueue-due-workflows'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'simula-enqueue-due-workflows',
    '* * * * *',
    $job$select private.simula_enqueue_due_workflows();$job$
  );
end;
$block$;

commit;
