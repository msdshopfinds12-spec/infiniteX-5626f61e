\set ON_ERROR_STOP on
-- Phase 97: catalog-backed database security assertions.
-- DISPOSABLE CI ONLY. Read-only assertions; no schema/data mutations.
DO $guard$
BEGIN
  IF current_database() <> 'infinitex_rehearsal' THEN
    RAISE EXCEPTION 'Phase 97 refused non-disposable database: %', current_database();
  END IF;
END
$guard$;

BEGIN;

SELECT pg_catalog.jsonb_pretty(pg_catalog.coalesce(
  (SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p))
   FROM pg_catalog.pg_policies p
   WHERE p.schemaname = 'public'
     AND p.tablename IN ('workflows','workflow_steps','workflow_runs','workflow_step_runs','workflow_logs')),
  '[]'::jsonb
)) AS phase97_policy_catalog;

DO $audit$
DECLARE
  v_missing text;
  v_bad_functions text;
  v_expected record;
  v_actual_count integer;
BEGIN
  -- Every workflow data surface must enforce row-level security.
  SELECT string_agg(expected.table_name, ', ')
    INTO v_missing
  FROM (VALUES
    ('workflows'),
    ('workflow_steps'),
    ('workflow_runs'),
    ('workflow_step_runs'),
    ('workflow_logs')
  ) AS expected(table_name)
  LEFT JOIN pg_catalog.pg_class c
    ON c.oid = pg_catalog.to_regclass('public.' || expected.table_name)
  WHERE c.oid IS NULL OR NOT c.relrowsecurity;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'RLS disabled or table missing: %', v_missing;
  END IF;

  -- The exact least-privilege table-level API contract.
  FOR v_expected IN
    SELECT * FROM (VALUES
      ('workflows', 'SELECT', true),
      ('workflows', 'INSERT', true),
      ('workflows', 'UPDATE', true),
      ('workflows', 'DELETE', true),
      ('workflow_steps', 'SELECT', true),
      ('workflow_steps', 'INSERT', true),
      ('workflow_steps', 'UPDATE', true),
      ('workflow_steps', 'DELETE', true),
      ('workflow_runs', 'SELECT', true),
      ('workflow_runs', 'INSERT', true),
      ('workflow_runs', 'UPDATE', false),
      ('workflow_runs', 'DELETE', false),
      ('workflow_step_runs', 'SELECT', true),
      ('workflow_step_runs', 'INSERT', false),
      ('workflow_step_runs', 'UPDATE', false),
      ('workflow_step_runs', 'DELETE', false),
      ('workflow_logs', 'SELECT', true),
      ('workflow_logs', 'INSERT', false),
      ('workflow_logs', 'UPDATE', false),
      ('workflow_logs', 'DELETE', false)
    ) AS permissions(table_name, privilege, expected_grant)
  LOOP
    IF has_table_privilege('authenticated',
      'public.' || v_expected.table_name,
      v_expected.privilege) IS DISTINCT FROM v_expected.expected_grant THEN
      RAISE EXCEPTION 'Unexpected authenticated privilege: %.% expected %',
        v_expected.table_name, v_expected.privilege, v_expected.expected_grant;
    END IF;

    IF has_table_privilege('anon',
      'public.' || v_expected.table_name,
      v_expected.privilege) THEN
      RAISE EXCEPTION 'anon unexpectedly has %.% privilege',
        v_expected.table_name, v_expected.privilege;
    END IF;
  END LOOP;

  -- Verify owner policies exist for every table and expose only authenticated role.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'workflows'
      AND policyname = 'Owners manage workflows'
      AND 'authenticated' = ANY(roles)
      AND cmd = 'ALL' AND qual IS NOT NULL AND with_check IS NOT NULL
      AND qual LIKE '%auth.uid%' AND with_check LIKE '%auth.uid%'
  ) THEN RAISE EXCEPTION 'workflow owner ALL policy missing or incomplete'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'workflow_steps'
      AND policyname = 'Owners manage workflow steps'
      AND 'authenticated' = ANY(roles)
      AND cmd = 'ALL' AND qual IS NOT NULL AND with_check IS NOT NULL
      AND qual LIKE '%auth.uid%' AND with_check LIKE '%auth.uid%'
  ) THEN RAISE EXCEPTION 'workflow-step owner ALL policy missing or incomplete'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'workflow_runs'
      AND policyname = 'Owners view workflow runs'
      AND 'authenticated' = ANY(roles) AND cmd = 'SELECT'
      AND qual LIKE '%auth.uid%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'workflow_runs'
      AND policyname = 'Owners create workflow runs'
      AND 'authenticated' = ANY(roles) AND cmd = 'INSERT'
      AND with_check LIKE '%auth.uid%'
  ) THEN RAISE EXCEPTION 'workflow-run owner SELECT/INSERT policies missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'workflow_step_runs'
      AND policyname = 'Owners view step runs'
      AND 'authenticated' = ANY(roles) AND cmd = 'SELECT'
      AND qual LIKE '%auth.uid%'
  ) THEN RAISE EXCEPTION 'workflow-step-run owner SELECT policy missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'workflow_logs'
      AND policyname = 'Owners view workflow logs'
      AND 'authenticated' = ANY(roles) AND cmd = 'SELECT'
      AND qual LIKE '%auth.uid%'
  ) THEN RAISE EXCEPTION 'workflow-log owner SELECT policy missing'; END IF;

  -- All SECURITY DEFINER functions in application schemas must pin search_path.
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_bad_functions
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef
    AND n.nspname IN ('public', 'private')
    AND NOT COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""'];

  IF v_bad_functions IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER functions missing empty search_path: %', v_bad_functions;
  END IF;

  -- Browser enqueue is authenticated-only; cross-owner worker claim is service-role-only.
  IF has_function_privilege('anon',
       'public.simula_enqueue_workflow_run(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.simula_enqueue_workflow_run(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'workflow enqueue RPC grants are incorrect';
  END IF;

  IF has_function_privilege('anon',
       'private.simula_claim_workflow_runs_internal(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'private.simula_claim_workflow_runs_internal(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'private.simula_claim_workflow_runs_internal(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'internal cross-owner worker claim must be service_role-only';
  END IF;

  IF has_function_privilege('anon',
       'public.simula_claim_workflow_runs(integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.simula_claim_workflow_runs(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'owner-scoped claim wrapper grants are incorrect';
  END IF;

  -- The outbox is an internal service-only data plane.
  IF has_table_privilege('anon', 'private.simula_workflow_outbox', 'SELECT')
     OR has_table_privilege('authenticated', 'private.simula_workflow_outbox', 'SELECT')
     OR has_table_privilege('authenticated', 'private.simula_workflow_outbox', 'INSERT')
     OR has_table_privilege('authenticated', 'private.simula_workflow_outbox', 'UPDATE')
     OR has_table_privilege('authenticated', 'private.simula_workflow_outbox', 'DELETE')
     OR NOT has_table_privilege('service_role', 'private.simula_workflow_outbox', 'SELECT')
     OR NOT has_table_privilege('service_role', 'private.simula_workflow_outbox', 'INSERT')
     OR NOT has_table_privilege('service_role', 'private.simula_workflow_outbox', 'UPDATE') THEN
    RAISE EXCEPTION 'outbox table privileges violate service-only access';
  END IF;

  IF has_function_privilege('anon',
       'public.simula_claim_workflow_outbox(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.simula_claim_workflow_outbox(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.simula_claim_workflow_outbox(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.simula_finish_workflow_outbox(uuid,uuid,boolean,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.simula_finish_workflow_outbox(uuid,uuid,boolean,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.simula_record_workflow_outbox_simulation(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.simula_record_workflow_outbox_simulation(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'outbox worker RPC grants violate service-only access';
  END IF;

  RAISE NOTICE 'PASS: Phase 97 catalog security assertions completed.';
END
$audit$;

ROLLBACK;
