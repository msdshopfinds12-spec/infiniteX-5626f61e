-- Disposable PostgreSQL 17 rehearsal for the existing API-key hardening migration.
-- Entire test runs inside a transaction and rolls back. Never point this at production.
\set ON_ERROR_STOP on
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$roles$;

CREATE TABLE public.platform_api_keys (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  label text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_api_keys_owner_select ON public.platform_api_keys
  FOR SELECT TO authenticated USING (owner_id = '00000000-0000-0000-0000-000000000001');
CREATE POLICY platform_api_keys_owner_update ON public.platform_api_keys
  FOR UPDATE TO authenticated
  USING (owner_id = '00000000-0000-0000-0000-000000000001')
  WITH CHECK (owner_id = '00000000-0000-0000-0000-000000000001');

GRANT SELECT, UPDATE ON public.platform_api_keys TO authenticated;
GRANT ALL ON public.platform_api_keys TO service_role;

-- Apply the exact checked-in migration file in this transaction.
\ir ../../supabase/migrations/20261120120000_harden_platform_api_key_column_access.sql

DO $assertions$
DECLARE
  rls_enabled boolean;
  select_policy_count integer;
  update_policy_count integer;
BEGIN
  IF has_table_privilege('authenticated', 'public.platform_api_keys', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated unexpectedly retains table-level SELECT';
  END IF;
  IF has_column_privilege('authenticated', 'public.platform_api_keys', 'key_hash', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated can SELECT key_hash';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.platform_api_keys', 'id', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.platform_api_keys', 'label', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.platform_api_keys', 'revoked_at', 'SELECT') THEN
    RAISE EXCEPTION 'expected non-secret metadata SELECT grant is missing';
  END IF;
  IF has_table_privilege('authenticated', 'public.platform_api_keys', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated unexpectedly retains table-level UPDATE';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.platform_api_keys', 'revoked_at', 'UPDATE') THEN
    RAISE EXCEPTION 'revoked_at UPDATE grant is missing';
  END IF;
  IF has_column_privilege('authenticated', 'public.platform_api_keys', 'label', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.platform_api_keys', 'key_hash', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated has an unexpected UPDATE column grant';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.platform_api_keys', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.platform_api_keys', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role privileges were unexpectedly reduced';
  END IF;

  SELECT c.relrowsecurity INTO rls_enabled
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'platform_api_keys';
  IF NOT rls_enabled THEN
    RAISE EXCEPTION 'RLS was unexpectedly disabled';
  END IF;
  SELECT count(*) INTO select_policy_count FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'platform_api_keys' AND cmd = 'SELECT';
  SELECT count(*) INTO update_policy_count FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'platform_api_keys' AND cmd = 'UPDATE';
  IF select_policy_count <> 1 OR update_policy_count <> 1 THEN
    RAISE EXCEPTION 'expected existing SELECT and UPDATE owner policies to remain intact';
  END IF;
END
$assertions$;

ROLLBACK;
