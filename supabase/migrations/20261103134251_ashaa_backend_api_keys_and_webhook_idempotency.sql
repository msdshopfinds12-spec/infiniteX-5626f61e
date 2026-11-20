-- Ashaa-INX backend foundation: API key registry and idempotent webhook ledger.
-- Additive only. Does not modify existing tables, policies, or data.

create table if not exists public.platform_api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 100),
  key_prefix text not null check (char_length(key_prefix) between 4 and 24),
  key_hash text not null unique check (char_length(key_hash) = 64),
  scopes text[] not null default array['api:read']::text[],
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint platform_api_keys_scopes_nonempty check (cardinality(scopes) > 0)
);

create index if not exists platform_api_keys_owner_created_idx
  on public.platform_api_keys (owner_id, created_at desc);

alter table public.platform_api_keys enable row level security;

drop policy if exists platform_api_keys_select_own on public.platform_api_keys;
create policy platform_api_keys_select_own
  on public.platform_api_keys
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists platform_api_keys_revoke_own on public.platform_api_keys;
create policy platform_api_keys_revoke_own
  on public.platform_api_keys
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

revoke all on public.platform_api_keys from anon, authenticated;
grant select on public.platform_api_keys to authenticated;
grant update (revoked_at) on public.platform_api_keys to authenticated;
grant all on public.platform_api_keys to service_role;

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (char_length(provider) between 1 and 40),
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 255),
  event_type text not null check (char_length(event_type) between 1 and 160),
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  retry_count integer not null default 0 check (retry_count >= 0 and retry_count <= 100),
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint billing_webhook_events_provider_event_unique unique (provider, provider_event_id)
);

create index if not exists billing_webhook_events_status_received_idx
  on public.billing_webhook_events (processing_status, received_at);

alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_webhook_events from anon, authenticated;
grant all on public.billing_webhook_events to service_role;
