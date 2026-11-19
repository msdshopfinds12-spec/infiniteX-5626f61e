-- Synthetic contract fixture ONLY. Never use against production or a shared Supabase project.
-- It models only the columns and unique key consumed by the Phase 4N.8B RPC.
-- It is not evidence that the production schema has this shape.

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$roles$;

drop table if exists public.workflow_step_runs cascade;
drop table if exists public.workflow_steps cascade;
drop table if exists public.workflow_runs cascade;
drop table if exists public.workflows cascade;

create table public.workflows (
  id uuid primary key,
  owner_id uuid not null
);

create table public.workflow_runs (
  id uuid primary key,
  workflow_id uuid not null,
  owner_id uuid not null,
  status text not null,
  attempt integer not null
);

create table public.workflow_steps (
  id uuid primary key,
  workflow_id uuid not null
);

create table public.workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  step_id uuid not null,
  owner_id uuid not null,
  status text not null,
  input jsonb,
  output jsonb,
  error_message text,
  attempt integer not null,
  started_at timestamptz,
  finished_at timestamptz,
  constraint workflow_step_runs_run_step_key unique (run_id, step_id)
);
