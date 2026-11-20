-- Phase 73D — read-only Supabase/PostgreSQL catalog diagnostics
-- Safe scope: metadata only. No application rows, credentials, Vault values, or secrets.
-- Run in Supabase SQL Editor using a read-only-capable role.
-- This file contains SELECT statements only.

-- 1. Public application table RLS and policy coverage.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  (select count(*) from pg_catalog.pg_policies p
   where p.schemaname = n.nspname and p.tablename = c.relname) as policy_count
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- 2. Explicit table grants for application roles.
select table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role', 'postgres', 'PUBLIC')
order by table_name, grantee, privilege_type;

-- 3. API-key table effective privileges; does not read any key values.
select
  has_table_privilege('authenticated', 'public.platform_api_keys', 'SELECT') as authenticated_table_select,
  has_table_privilege('authenticated', 'public.platform_api_keys', 'UPDATE') as authenticated_table_update,
  has_column_privilege('authenticated', 'public.platform_api_keys', 'key_hash', 'SELECT') as authenticated_key_hash_select,
  has_column_privilege('authenticated', 'public.platform_api_keys', 'revoked_at', 'UPDATE') as authenticated_revoked_at_update,
  has_table_privilege('service_role', 'public.platform_api_keys', 'SELECT') as service_role_table_select,
  has_table_privilege('service_role', 'public.platform_api_keys', 'INSERT') as service_role_table_insert;

-- 4. Private billing-webhook table effective access; no webhook payloads are read.
select
  has_table_privilege('anon', 'public.billing_webhook_events', 'SELECT') as anon_select,
  has_table_privilege('anon', 'public.billing_webhook_events', 'INSERT') as anon_insert,
  has_table_privilege('authenticated', 'public.billing_webhook_events', 'SELECT') as authenticated_select,
  has_table_privilege('authenticated', 'public.billing_webhook_events', 'INSERT') as authenticated_insert,
  has_table_privilege('service_role', 'public.billing_webhook_events', 'SELECT') as service_role_select,
  has_table_privilege('service_role', 'public.billing_webhook_events', 'INSERT') as service_role_insert;

-- 5. Function security metadata and effective EXECUTE rights for the worker-secret verifier.
select
  p.oid::regprocedure as function_identity,
  p.prosecdef as security_definer,
  p.proacl as function_acl,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'simula_verify_worker_secret';

-- 6. Public index definitions; no automatic DROP recommendation is implied.
select tablename, indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 7. Non-internal public triggers.
select
  c.relname as table_name,
  t.tgname as trigger_name,
  t.tgenabled as enabled_state,
  pg_catalog.pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
order by c.relname, t.tgname;

-- 8. Migration ledger inventory only; never execute recovered statements here.
select version, name
from supabase_migrations.schema_migrations
order by version;
