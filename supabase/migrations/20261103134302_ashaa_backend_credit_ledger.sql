-- Append-only server-managed credit ledger; balance is derived from entries.
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (char_length(reason) between 1 and 80),
  reference_type text check (reference_type is null or char_length(reference_type) <= 80),
  reference_id text check (reference_id is null or char_length(reference_id) <= 255),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 255),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint credit_ledger_owner_idempotency_unique unique (owner_id, idempotency_key)
);

create index if not exists credit_ledger_owner_created_idx
  on public.credit_ledger (owner_id, created_at desc);

alter table public.credit_ledger enable row level security;

drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own
  on public.credit_ledger
  for select to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on public.credit_ledger from anon, authenticated;
grant select on public.credit_ledger to authenticated;
grant all on public.credit_ledger to service_role;
