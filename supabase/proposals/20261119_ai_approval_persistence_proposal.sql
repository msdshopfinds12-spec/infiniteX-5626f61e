-- REVIEW-ONLY PROPOSAL — DO NOT APPLY DIRECTLY.
-- Phase 6G.4: isolated AI approval persistence domain.
-- Target: Ashaa-INX only after explicit migration approval.
-- This file is deliberately outside supabase/migrations/.
-- No SQL in this proposal has been executed against the live project.

begin;

create schema if not exists private;

create table if not exists private.ai_tasks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'planned'
    check (status in ('planned', 'awaiting_approval', 'running', 'succeeded', 'failed', 'cancelled')),
  task_version bigint not null default 1 check (task_version > 0),
  agent_id text not null check (length(agent_id) between 1 and 128),
  agent_version text not null check (length(agent_version) between 1 and 64),
  capability_id text not null check (length(capability_id) between 1 and 128),
  capability_version text not null check (length(capability_version) between 1 and 64),
  input jsonb not null check (pg_catalog.jsonb_typeof(input) = 'object'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  lease_id uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint ai_tasks_input_size check (pg_catalog.pg_column_size(input) <= 65536),
  constraint ai_tasks_owner_idempotency unique (owner_id, idempotency_key),
  constraint ai_tasks_lease_pair check (
    (lease_id is null and lease_expires_at is null) or
    (lease_id is not null and lease_expires_at is not null)
  )
);

create index if not exists ai_tasks_owner_status_created_idx
  on private.ai_tasks (owner_id, status, created_at desc);

create table if not exists private.ai_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references private.ai_tasks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_sequence bigint not null check (event_sequence > 0),
  from_status text,
  to_status text not null,
  event_type text not null check (length(event_type) between 1 and 64),
  actor_subject text not null check (length(actor_subject) between 1 and 128),
  metadata jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint ai_task_events_task_sequence unique (task_id, event_sequence),
  constraint ai_task_events_metadata_size check (pg_catalog.pg_column_size(metadata) <= 8192)
);

create index if not exists ai_task_events_owner_created_idx
  on private.ai_task_events (owner_id, created_at desc);

create table if not exists private.ai_approval_grants (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  task_id uuid not null references private.ai_tasks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_digest bytea not null unique check (pg_catalog.octet_length(token_digest) = 32),
  task_version bigint not null check (task_version > 0),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  agent_id text not null,
  agent_version text not null,
  capability_id text not null,
  capability_version text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index if not exists ai_approval_grants_task_owner_idx
  on private.ai_approval_grants (task_id, owner_id, expires_at);

alter table private.ai_tasks enable row level security;
alter table private.ai_task_events enable row level security;
alter table private.ai_approval_grants enable row level security;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

revoke all on private.ai_tasks from public, anon, authenticated;
revoke all on private.ai_task_events from public, anon, authenticated;
revoke all on private.ai_approval_grants from public, anon, authenticated;

grant select, insert, update on private.ai_tasks to service_role;
grant select, insert on private.ai_task_events to service_role;
grant select, insert, update on private.ai_approval_grants to service_role;
grant usage, select on all sequences in schema private to service_role;

create or replace function private.claim_ai_task_with_approval(
  p_task_id uuid,
  p_owner_id uuid,
  p_expected_task_version bigint,
  p_expected_payload_hash text,
  p_expected_agent_id text,
  p_expected_agent_version text,
  p_expected_capability_id text,
  p_expected_capability_version text,
  p_approval_token_digest bytea,
  p_lease_seconds integer default 300
)
returns table (
  claimed_task_id uuid,
  claimed_task_version bigint,
  claimed_lease_id uuid,
  claimed_lease_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_task private.ai_tasks%rowtype;
  v_grant private.ai_approval_grants%rowtype;
  v_lease_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_owner_id is null
     or p_expected_task_version is null
     or p_expected_task_version < 1
     or p_expected_payload_hash is null
     or p_expected_payload_hash !~ '^[a-f0-9]{64}$'
     or p_approval_token_digest is null
     or pg_catalog.octet_length(p_approval_token_digest) <> 32
     or p_lease_seconds is null
     or p_lease_seconds < 30
     or p_lease_seconds > 900 then
    raise exception using errcode = '22023', message = 'invalid_claim_arguments';
  end if;

  select t.* into v_task
    from private.ai_tasks as t
   where t.id = p_task_id and t.owner_id = p_owner_id
   for update;

  if not found
     or v_task.status <> 'awaiting_approval'
     or v_task.task_version <> p_expected_task_version
     or v_task.payload_hash <> p_expected_payload_hash
     or v_task.agent_id <> p_expected_agent_id
     or v_task.agent_version <> p_expected_agent_version
     or v_task.capability_id <> p_expected_capability_id
     or v_task.capability_version <> p_expected_capability_version then
    return;
  end if;

  select g.* into v_grant
    from private.ai_approval_grants as g
   where g.task_id = v_task.id
     and g.owner_id = p_owner_id
     and g.token_digest = p_approval_token_digest
     and g.task_version = v_task.task_version
     and g.payload_hash = v_task.payload_hash
     and g.agent_id = v_task.agent_id
     and g.agent_version = v_task.agent_version
     and g.capability_id = v_task.capability_id
     and g.capability_version = v_task.capability_version
     and g.consumed_at is null
     and g.expires_at > v_now
   for update;

  if not found then
    return;
  end if;

  update private.ai_approval_grants
     set consumed_at = v_now
   where id = v_grant.id and consumed_at is null;

  if not found then
    return;
  end if;

  v_lease_id := pg_catalog.gen_random_uuid();

  update private.ai_tasks as t
     set status = 'running',
         task_version = t.task_version + 1,
         lease_id = v_lease_id,
         lease_expires_at = v_now + (p_lease_seconds * interval '1 second'),
         started_at = coalesce(t.started_at, v_now),
         updated_at = v_now
   where t.id = v_task.id
     and t.owner_id = p_owner_id
     and t.status = 'awaiting_approval'
     and t.task_version = p_expected_task_version
     and t.payload_hash = p_expected_payload_hash
  returning t.task_version into claimed_task_version;

  if not found then
    raise exception using errcode = '40001', message = 'task_claim_conflict';
  end if;

  insert into private.ai_task_events (
    task_id, owner_id, event_sequence, from_status, to_status,
    event_type, actor_subject, metadata, created_at
  ) values (
    v_task.id, p_owner_id, claimed_task_version,
    'awaiting_approval', 'running',
    'approval_consumed_and_claimed', p_owner_id::text,
    pg_catalog.jsonb_build_object('lease_id', v_lease_id),
    v_now
  );

  claimed_task_id := v_task.id;
  claimed_lease_id := v_lease_id;
  claimed_lease_expires_at := v_now + (p_lease_seconds * interval '1 second');
  return next;
end;
$function$;

revoke all on function private.claim_ai_task_with_approval(
  uuid, uuid, bigint, text, text, text, text, text, bytea, integer
) from public, anon, authenticated;
grant execute on function private.claim_ai_task_with_approval(
  uuid, uuid, bigint, text, text, text, text, text, bytea, integer
) to service_role;

commit;

-- REQUIRED FOLLOW-UP BEFORE PRODUCTION:
-- * Validate actor identity in the trusted Edge Function; never trust a
--   browser-supplied p_owner_id.
-- * Add completion and renewal RPCs that require the active lease_id.
-- * Add lease-fencing, concurrency, replay and rollback integration tests.
-- * Add task/approval issuance RPCs with idempotency and audit events.
-- * Review delete cascades, retention, backup/restore and operational quotas.
