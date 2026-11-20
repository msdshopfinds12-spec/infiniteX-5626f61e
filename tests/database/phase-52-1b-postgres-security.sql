\set ON_ERROR_STOP on

-- Disposable PostgreSQL-only security behavior test.
-- This script creates synthetic Supabase-like roles/tables, applies repository
-- migrations, exercises grants/RLS/functions, and rolls everything back.
BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role' AND rolbypassrls = false
  ) THEN
    RAISE EXCEPTION 'service_role must retain BYPASSRLS in the disposable security test';
  END IF;
END
$roles$;

CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;

-- Apply the exact checked-in profile/project RLS migration in this disposable database.
\ir ../../supabase/migrations/20261025182821_simula_app_factory_core_schema_rls.sql

GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  attempt integer NOT NULL DEFAULT 0
);
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_runs_select_own
  ON public.workflow_runs FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);
GRANT SELECT ON public.workflow_runs TO authenticated;

-- Apply the real checked-in function migrations to this disposable database.
\ir ../../supabase/migrations/20261025201831_simula_secure_workflow_run_claiming.sql
\ir ../../supabase/migrations/20261025201906_simula_move_claim_definer_to_private_schema.sql
\ir ../../supabase/migrations/20261025201915_simula_allow_authenticated_claim_wrapper_access.sql
\ir ../../supabase/migrations/20261025202606_simula_internal_worker_queue_claiming.sql

-- Apply the API-key/webhook schema and its candidate hardening migration.
-- Candidate status in the provenance manifest remains NOT_APPLIED to live DB.
\ir ../../supabase/migrations/20261103134251_ashaa_backend_api_keys_and_webhook_idempotency.sql
\ir ../../supabase/migrations/20261120120000_harden_platform_api_key_column_access.sql

INSERT INTO auth.users(id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- Seed two tenants through the real auth.users profile trigger and project schema.
INSERT INTO public.user_projects(user_id, title, project_type, content)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Tenant A project','workflow','{"private":"A"}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Tenant B project','workflow','{"private":"B"}');

INSERT INTO public.workflow_runs(workflow_id, owner_id, input, status)
VALUES
  ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"tenant":"A"}','queued'),
  ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{"tenant":"B"}','queued');

INSERT INTO public.platform_api_keys(owner_id,label,key_prefix,key_hash)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','synthetic-A','testA','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','synthetic-B','testB','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

-- Role/ACL and SECURITY DEFINER invariants.
DO $test$
DECLARE
  v_bad_functions text;
BEGIN
  IF has_table_privilege('anon','public.platform_api_keys','SELECT')
     OR has_table_privilege('anon','public.billing_webhook_events','SELECT') THEN
    RAISE EXCEPTION 'anon unexpectedly has table SELECT';
  END IF;

  IF has_column_privilege('authenticated','public.platform_api_keys','key_hash','SELECT') THEN
    RAISE EXCEPTION 'authenticated unexpectedly has key_hash SELECT';
  END IF;
  IF NOT has_column_privilege('authenticated','public.platform_api_keys','label','SELECT') THEN
    RAISE EXCEPTION 'authenticated lacks expected metadata SELECT';
  END IF;
  IF has_column_privilege('authenticated','public.platform_api_keys','label','UPDATE') THEN
    RAISE EXCEPTION 'authenticated unexpectedly has label UPDATE';
  END IF;
  IF NOT has_column_privilege('authenticated','public.platform_api_keys','revoked_at','UPDATE') THEN
    RAISE EXCEPTION 'authenticated lacks revoked_at UPDATE';
  END IF;

  IF has_table_privilege('authenticated','public.billing_webhook_events','SELECT')
     OR has_table_privilege('authenticated','public.billing_webhook_events','INSERT') THEN
    RAISE EXCEPTION 'authenticated unexpectedly has webhook table access';
  END IF;
  IF NOT has_table_privilege('service_role','public.billing_webhook_events','SELECT') THEN
    RAISE EXCEPTION 'service_role lacks expected webhook SELECT';
  END IF;

  IF has_function_privilege('anon','public.simula_claim_workflow_runs(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute the public claim wrapper';
  END IF;
  IF NOT has_function_privilege('authenticated','public.simula_claim_workflow_runs(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute the intended claim wrapper';
  END IF;
  IF has_function_privilege('authenticated','private.simula_claim_workflow_runs_internal(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute the internal cross-owner worker function';
  END IF;
  IF NOT has_function_privilege('service_role','private.simula_claim_workflow_runs_internal(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute the internal worker function';
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_bad_functions
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef
    AND n.nspname IN ('public','private')
    AND NOT COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""'];
  IF v_bad_functions IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER function(s) missing fixed empty search_path: %', v_bad_functions;
  END IF;
END
$test$;

-- User A sees only A's API-key metadata and cannot read the secret hash.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);

DO $test$
DECLARE
  v_count integer;
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.platform_api_keys;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS isolation failed for API keys: expected 1 row, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.user_projects;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS isolation failed for user A projects: expected 1 row, got %', v_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_projects WHERE title = 'Tenant B project') THEN
    RAISE EXCEPTION 'user A can read user B project metadata';
  END IF;

  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS isolation failed for user A profile: expected 1 row, got %', v_count;
  END IF;
  UPDATE public.profiles SET display_name = 'Tenant A updated'
   WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'user A could not update own allowed profile fields';
  END IF;
  UPDATE public.profiles SET display_name = 'Tampered by A'
   WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'user A modified user B profile';
  END IF;

  UPDATE public.user_projects SET title = 'Tampered by A'
   WHERE title = 'Tenant B project';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'user A modified user B project';
  END IF;

  BEGIN
    INSERT INTO public.user_projects(user_id, title, project_type)
    VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Forged tenant project','general');
    RAISE EXCEPTION 'user A inserted a project for user B';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    EXECUTE 'SELECT key_hash FROM public.platform_api_keys';
    RAISE EXCEPTION 'key_hash read unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  UPDATE public.platform_api_keys
     SET revoked_at = now()
   WHERE label = 'synthetic-A';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'owner-scoped revoked_at update failed: expected 1 row, got %', v_rows;
  END IF;

  BEGIN
    EXECUTE 'UPDATE public.platform_api_keys SET label = ''tampered''';
    RAISE EXCEPTION 'metadata UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    EXECUTE 'UPDATE public.platform_api_keys SET owner_id = ''bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb''::uuid';
    RAISE EXCEPTION 'owner_id reassignment unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    EXECUTE 'SELECT * FROM public.billing_webhook_events';
    RAISE EXCEPTION 'webhook SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    EXECUTE 'SELECT * FROM private.simula_claim_workflow_runs_internal(5)';
    RAISE EXCEPTION 'authenticated executed internal worker function';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SELECT count(*) INTO v_count
  FROM public.simula_claim_workflow_runs(5);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'owner-scoped workflow claim expected 1 row, got %', v_count;
  END IF;
END
$test$;

RESET ROLE;

DO $test$
DECLARE
  v_status_a text;
  v_status_b text;
BEGIN
  SELECT status INTO v_status_a FROM public.workflow_runs
   WHERE owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  SELECT status INTO v_status_b FROM public.workflow_runs
   WHERE owner_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  IF v_status_a <> 'running' OR v_status_b <> 'queued' THEN
    RAISE EXCEPTION 'workflow claim crossed tenant boundary or failed: A=%, B=%', v_status_a, v_status_b;
  END IF;
END
$test$;

-- User B must see only B's row and cannot mutate A's row.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
DO $test$
DECLARE
  v_count integer;
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.platform_api_keys;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS isolation failed for user B: expected 1 row, got %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.user_projects;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS isolation failed for user B projects: expected 1 row, got %', v_count;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_projects WHERE title = 'Tenant A updated') THEN
    RAISE EXCEPTION 'user B can read user A project metadata';
  END IF;

  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS isolation failed for user B profile: expected 1 row, got %', v_count;
  END IF;

  UPDATE public.user_projects SET title = 'Tampered by B'
   WHERE user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'user B modified user A project';
  END IF;
  UPDATE public.profiles SET display_name = 'Tampered by B'
   WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'user B modified user A profile';
  END IF;

  UPDATE public.platform_api_keys SET revoked_at=now()
   WHERE owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'user B modified user A API key';
  END IF;
END
$test$;
RESET ROLE;

DO $test$
BEGIN
  IF NOT has_table_privilege('service_role','public.platform_api_keys','SELECT')
     OR NOT has_table_privilege('service_role','public.platform_api_keys','UPDATE') THEN
    RAISE EXCEPTION 'service_role API-key privileges are incomplete';
  END IF;
END
$test$;

ROLLBACK;
\echo 'PASS: PostgreSQL security behavior tests completed; all fixture changes rolled back.'
