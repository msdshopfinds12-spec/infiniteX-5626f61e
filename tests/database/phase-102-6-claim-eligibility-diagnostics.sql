-- Phase 102.6 claim eligibility diagnostic.
-- Runs only in the disposable CI PostgreSQL database after the Phase 103.1 patch.
-- The transaction is always rolled back; no fixture survives this diagnostic.
BEGIN;

DO $diagnostic$
DECLARE
  v_owner_id uuid := '81000000-0000-4000-8000-000000000003';
  v_workflow_id uuid := pg_catalog.gen_random_uuid();
  v_run_id uuid := pg_catalog.gen_random_uuid();
  v_first record;
  v_second record;
  v_persisted public.workflow_runs%ROWTYPE;
BEGIN
  INSERT INTO public.workflows (id, owner_id, name, status, trigger_type)
  VALUES (v_workflow_id, v_owner_id, 'phase-1026-direct-sql-diagnostic', 'draft', 'manual');

  INSERT INTO public.workflow_runs (id, workflow_id, owner_id, status, input, attempt)
  VALUES (v_run_id, v_workflow_id, v_owner_id, 'queued',
          '{"phase":"102.6","synthetic":true,"path":"private-sql"}'::jsonb, 0);

  SELECT * INTO v_first
  FROM private.simula_claim_workflow_runs_lease_internal(1, 30, v_run_id, v_owner_id);

  IF NOT FOUND OR v_first.id IS DISTINCT FROM v_run_id
     OR v_first.attempt IS DISTINCT FROM 1
     OR v_first.lease_token IS NULL THEN
    RAISE EXCEPTION 'PHASE1026_DIRECT_SQL_INITIAL_CLAIM_FAILED: %', row_to_json(v_first);
  END IF;

  -- Use a fixed past timestamp, not the CI runner's wall clock.
  UPDATE public.workflow_runs
  SET lease_until = TIMESTAMPTZ '2000-01-01 00:00:00+00'
  WHERE id = v_run_id
    AND owner_id = v_owner_id
    AND status = 'running'
    AND attempt = 1
    AND lease_token = v_first.lease_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PHASE1026_DIRECT_SQL_EXPIRY_FIXTURE_MISSED_TARGET';
  END IF;

  SELECT * INTO v_second
  FROM private.simula_claim_workflow_runs_lease_internal(1, 30, v_run_id, v_owner_id);

  IF NOT FOUND OR v_second.id IS DISTINCT FROM v_run_id
     OR v_second.attempt IS DISTINCT FROM 2
     OR v_second.lease_token IS NULL
     OR v_second.lease_token = v_first.lease_token THEN
    RAISE EXCEPTION 'PHASE1026_DIRECT_SQL_RECLAIM_FAILED: first=%, second=%',
      row_to_json(v_first), row_to_json(v_second);
  END IF;

  SELECT * INTO v_persisted
  FROM public.workflow_runs
  WHERE id = v_run_id;

  IF NOT FOUND
     OR v_persisted.status <> 'running'
     OR v_persisted.attempt <> 2
     OR v_persisted.lease_token IS DISTINCT FROM v_second.lease_token
     OR v_persisted.lease_until IS DISTINCT FROM v_second.lease_until
     OR v_persisted.lease_until <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'PHASE1026_DIRECT_SQL_PERSISTENCE_MISMATCH: %',
      row_to_json(v_persisted);
  END IF;

  RAISE NOTICE 'PHASE1026_DIRECT_SQL_RECLAIM_OK run_id=% attempt=% token_rotated=% lease_until=% db_clock=%',
    v_run_id, v_persisted.attempt,
    (v_first.lease_token <> v_second.lease_token),
    v_persisted.lease_until, pg_catalog.clock_timestamp();
END;
$diagnostic$;

ROLLBACK;
