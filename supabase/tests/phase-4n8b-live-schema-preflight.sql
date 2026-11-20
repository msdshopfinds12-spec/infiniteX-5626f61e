-- Phase 4N.8B live-schema preflight (READ ONLY).
-- Run with a read-only database role against a controlled target.
-- This file intentionally contains SELECT statements only. It does not apply migrations,
-- read application rows, change grants, or expose secret values.

-- 1) Required relations and columns consumed by the transactional RPC.
with expected(relation_name, column_name) as (
  values
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
)
select
  e.relation_name,
  e.column_name,
  case when c.column_name is null then 'MISSING' else 'PRESENT' end as status,
  c.data_type,
  c.udt_name
from expected e
left join information_schema.columns c
  on c.table_schema || '.' || c.table_name = e.relation_name
 and c.column_name = e.column_name
order by e.relation_name, e.column_name;

-- 2) Confirm the unique key required by ON CONFLICT (run_id, step_id).
-- Inspect definitions rather than assuming the index/constraint name.
select
  schemaname,
  tablename,
  indexname,
  indexdef,
  case
    when indexdef ilike '%unique%' and indexdef ilike '%(run_id, step_id)%'
      then 'CANDIDATE_MATCH'
    else 'REVIEW'
  end as review_status
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename = 'workflow_step_runs'
order by indexname;

-- 3) Inspect relevant foreign keys and check/unique constraints.
-- No row values are read.
select
  n.nspname as schema_name,
  t.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_catalog.pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class t on t.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname in ('workflow_runs', 'workflows', 'workflow_steps', 'workflow_step_runs')
order by t.relname, con.conname;

-- 4) Check whether the candidate RPC exists and inspect effective EXECUTE grants.
-- Expected before migration: function_missing. Expected after approved migration:
-- service_role_execute=true; anon_execute=false; authenticated_execute=false.
with candidate as (
  select pg_catalog.to_regprocedure(
    'public.simula_transition_workflow_step(uuid,uuid,uuid,integer,text,jsonb,jsonb,text)'
  ) as function_oid
)
select
  function_oid is not null as function_exists,
  case when function_oid is null then null
       else pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE') end as anon_execute,
  case when function_oid is null then null
       else pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE') end as authenticated_execute,
  case when function_oid is null then null
       else pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE') end as service_role_execute
from candidate;

-- 5) Confirm migration ledger relation exists; do not assume a migration is applied
-- merely because its SQL file exists in Git.
select
  pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null
    as supabase_migration_ledger_exists;

-- 6) Inventory relevant function definitions and privileges for claim/recovery.
-- Review every function that changes workflow_runs.attempt/status and verify it
-- serializes on the same parent workflow_runs row used by the candidate RPC.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_catalog.pg_get_userbyid(p.proowner) as function_owner,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private')
  and (
    p.proname ilike '%claim%workflow%'
    or p.proname ilike '%recover%workflow%'
    or p.proname = 'simula_transition_workflow_step'
  )
order by n.nspname, p.proname;

-- Interpretation:
-- * Any MISSING required column blocks migration review.
-- * Verify a unique index/constraint truly covers (run_id, step_id).
-- * Confirm claim/recovery paths lock/update the same parent workflow_runs row.
-- * The candidate RPC must not be exposed to anon/authenticated.
-- * This preflight is evidence gathering only; it is not migration approval.
