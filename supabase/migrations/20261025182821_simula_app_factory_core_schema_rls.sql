
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 100),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  is_active boolean not null default false,
  public_config jsonb not null default '{}'::jsonb check (jsonb_typeof(public_config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id uuid references public.tools(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  project_type text not null default 'general' check (char_length(project_type) <= 80),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_projects_owner_updated_idx on public.user_projects (user_id, updated_at desc);

create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tool_id uuid references public.tools(id) on delete set null,
  action text not null check (char_length(action) between 1 and 100),
  units integer not null default 1 check (units between 0 and 1000000),
  status text not null default 'success' check (status in ('success', 'failed', 'blocked')),
  request_id text,
  created_at timestamptz not null default now()
);

create index usage_logs_owner_created_idx on public.usage_logs (user_id, created_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null default 'free' check (plan_code in ('free', 'pro', 'business')),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end is null or current_period_start is null or current_period_end >= current_period_start)
);

create index subscriptions_owner_created_idx on public.subscriptions (user_id, created_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null,
  provider_payment_id text unique,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index payments_owner_created_idx on public.payments (user_id, created_at desc);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger tools_set_updated_at
before update on public.tools
for each row execute function private.set_updated_at();

create trigger projects_set_updated_at
before update on public.user_projects
for each row execute function private.set_updated_at();

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function private.set_updated_at();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  v_display_name := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 100), '');
  insert into public.profiles (id, display_name)
  values (new.id, v_display_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.tools enable row level security;
alter table public.user_projects enable row level security;
alter table public.usage_logs enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.tools from anon, authenticated;
revoke all on table public.user_projects from anon, authenticated;
revoke all on table public.usage_logs from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.payments from anon, authenticated;

grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create policy profiles_select_own
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

grant select on public.tools to authenticated;

create policy tools_select_active
on public.tools for select to authenticated
using (is_active);

grant select, insert, update, delete on public.user_projects to authenticated;

create policy projects_select_own
on public.user_projects for select to authenticated
using ((select auth.uid()) = user_id);

create policy projects_insert_own
on public.user_projects for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy projects_update_own
on public.user_projects for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy projects_delete_own
on public.user_projects for delete to authenticated
using ((select auth.uid()) = user_id);

grant select on public.usage_logs to authenticated;

create policy usage_select_own
on public.usage_logs for select to authenticated
using ((select auth.uid()) = user_id);

grant select on public.subscriptions to authenticated;

create policy subscriptions_select_own
on public.subscriptions for select to authenticated
using ((select auth.uid()) = user_id);

grant select on public.payments to authenticated;

create policy payments_select_own
on public.payments for select to authenticated
using ((select auth.uid()) = user_id);

commit;
