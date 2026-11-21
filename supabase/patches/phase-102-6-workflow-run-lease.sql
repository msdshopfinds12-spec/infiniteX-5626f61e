-- Phase 102.6 — additive workflow-run lease protocol (REHEARSAL PATCH ONLY).
-- Store outside supabase/migrations/: this file is NOT applied to any database.
-- Apply only to an explicitly disposable PostgreSQL rehearsal after schema parity
-- has been established from a fresh schema dump. Do not run against hosted projects.
--
-- This patch introduces a parallel service-only claim contract. Existing workers
-- remain on their legacy RPC until Phase 103 integrates both worker runtimes.
-- The 15-minute legacy recovery function is intentionally NOT replaced here.

BEGIN;

ALTER TABLE public.workflow_runs
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

CREATE INDEX IF NOT EXISTS workflow_runs_expired_lease_idx
  ON public.workflow_runs (lease_until, created_at, id)
  WHERE status = 'running' AND lease_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS workflow_runs_queued_lease_claim_idx
  ON public.workflow_runs (created_at, id)
  WHERE status = 'queued';

-- Deliberately no NOT VALID lease CHECK constraint in this phase. Legacy
-- running rows may have no lease metadata and must be reconciled explicitly
-- before a consistency constraint can be safely enforced.

CREATE OR REPLACE FUNCTION private.simula_claim_workflow_runs_lease_internal(
  p_limit integer DEFAULT 3,
  p_lease_seconds integer DEFAULT 90
)
RETURNS TABLE (
  id uuid,
  workflow_id uuid,
  owner_id uuid,
  input jsonb,
  attempt integer,
  lease_token uuid,
  lease_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 3), 5));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 90), 900));
BEGIN
  -- An expired final attempt is terminal. Lock only rows this transaction
  -- actually owns; active leases and legacy NULL-lease rows are not reclaimed.
  WITH expired_final AS (
    SELECT wr.id
    FROM public.workflow_runs AS wr
    WHERE wr.status = 'running'
      AND wr.lease_until IS NOT NULL
      AND wr.lease_until <= pg_catalog.clock_timestamp()
      AND wr.attempt >= 5
    ORDER BY wr.lease_until ASC, wr.id ASC
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.workflow_runs AS wr
  SET status = 'failed',
      error_message = 'worker_lease_expired_max_attempts',
      finished_at = pg_catalog.clock_timestamp(),
      lease_token = NULL,
      lease_until = NULL
  FROM expired_final AS ef
  WHERE wr.id = ef.id
    AND wr.status = 'running'
    AND wr.lease_until <= pg_catalog.clock_timestamp()
    AND wr.attempt >= 5;

  RETURN QUERY
  WITH picked AS (
    SELECT wr.id
    FROM public.workflow_runs AS wr
    WHERE wr.attempt < 5
      AND (
        wr.status = 'queued'
        OR (
          wr.status = 'running'
          AND wr.lease_token IS NOT NULL
          AND wr.lease_until IS NOT NULL
          AND wr.lease_until <= pg_catalog.clock_timestamp()
        )
      )
    ORDER BY
      CASE WHEN wr.status = 'running' THEN wr.lease_until ELSE wr.created_at END ASC,
      wr.created_at ASC,
      wr.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.workflow_runs AS wr
    SET status = 'running',
        started_at = pg_catalog.clock_timestamp(),
        finished_at = NULL,
        error_message = NULL,
        attempt = wr.attempt + 1,
        lease_token = pg_catalog.gen_random_uuid(),
        lease_until = pg_catalog.clock_timestamp()
          + pg_catalog.make_interval(secs => v_lease_seconds),
        heartbeat_at = pg_catalog.clock_timestamp()
    FROM picked
    WHERE wr.id = picked.id
      AND wr.attempt < 5
      AND (
        wr.status = 'queued'
        OR (
          wr.status = 'running'
          AND wr.lease_token IS NOT NULL
          AND wr.lease_until <= pg_catalog.clock_timestamp()
        )
      )
    RETURNING wr.id, wr.workflow_id, wr.owner_id, wr.input, wr.attempt,
      wr.lease_token, wr.lease_until
  )
  SELECT c.id, c.workflow_id, c.owner_id, c.input, c.attempt,
    c.lease_token, c.lease_until
  FROM claimed AS c;
END;
$function$;

CREATE OR REPLACE FUNCTION private.simula_heartbeat_workflow_run(
  p_run_id uuid,
  p_owner_id uuid,
  p_attempt integer,
  p_lease_token uuid,
  p_extend_seconds integer DEFAULT 90
)
RETURNS TABLE (lease_until timestamptz, heartbeat_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_run public.workflow_runs%ROWTYPE;
  v_extend_seconds integer := greatest(30, least(coalesce(p_extend_seconds, 90), 900));
  v_now timestamptz;
BEGIN
  IF p_run_id IS NULL OR p_owner_id IS NULL OR p_lease_token IS NULL
     OR p_attempt IS NULL OR p_attempt < 1 THEN
    RAISE EXCEPTION 'workflow_run_lease_identity_required' USING ERRCODE = '22023';
  END IF;

  SELECT wr.* INTO v_run
  FROM public.workflow_runs AS wr
  WHERE wr.id = p_run_id
    AND wr.owner_id = p_owner_id
    AND wr.status = 'running'
    AND wr.attempt = p_attempt
    AND wr.lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow_run_lease_superseded' USING ERRCODE = '40001';
  END IF;

  -- Evaluate after acquiring the row lock; transaction_timestamp()/now() may
  -- predate a lock wait and must not revive an expired lease.
  v_now := pg_catalog.clock_timestamp();
  IF v_run.lease_until IS NULL OR v_run.lease_until <= v_now THEN
    RAISE EXCEPTION 'workflow_run_lease_expired' USING ERRCODE = '40001';
  END IF;

  RETURN QUERY
  UPDATE public.workflow_runs AS wr
  SET lease_until = v_now + pg_catalog.make_interval(secs => v_extend_seconds),
      heartbeat_at = v_now
  WHERE wr.id = p_run_id
    AND wr.owner_id = p_owner_id
    AND wr.status = 'running'
    AND wr.attempt = p_attempt
    AND wr.lease_token = p_lease_token
    AND wr.lease_until > v_now
  RETURNING wr.lease_until, wr.heartbeat_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow_run_lease_expired' USING ERRCODE = '40001';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION private.simula_finish_workflow_run_lease(
  p_run_id uuid,
  p_owner_id uuid,
  p_attempt integer,
  p_lease_token uuid,
  p_terminal_status text,
  p_output jsonb DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS TABLE (id uuid, status text, attempt integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_run public.workflow_runs%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF p_run_id IS NULL OR p_owner_id IS NULL OR p_lease_token IS NULL
     OR p_attempt IS NULL OR p_attempt < 1 THEN
    RAISE EXCEPTION 'workflow_run_lease_identity_required' USING ERRCODE = '22023';
  END IF;
  IF p_terminal_status NOT IN ('succeeded', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'workflow_run_terminal_status_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_output IS NOT NULL AND
     (pg_catalog.jsonb_typeof(p_output) <> 'object' OR pg_catalog.pg_column_size(p_output) > 65536) THEN
    RAISE EXCEPTION 'workflow_run_output_must_be_bounded_object' USING ERRCODE = '22023';
  END IF;
  IF p_error IS NOT NULL AND pg_catalog.char_length(p_error) > 500 THEN
    RAISE EXCEPTION 'workflow_run_error_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT wr.* INTO v_run
  FROM public.workflow_runs AS wr
  WHERE wr.id = p_run_id
    AND wr.owner_id = p_owner_id
    AND wr.status = 'running'
    AND wr.attempt = p_attempt
    AND wr.lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow_run_lease_superseded' USING ERRCODE = '40001';
  END IF;

  v_now := pg_catalog.clock_timestamp();
  IF v_run.lease_until IS NULL OR v_run.lease_until <= v_now THEN
    RAISE EXCEPTION 'workflow_run_lease_expired' USING ERRCODE = '40001';
  END IF;

  RETURN QUERY
  UPDATE public.workflow_runs AS wr
  SET status = p_terminal_status,
      output = CASE WHEN p_terminal_status = 'succeeded' THEN coalesce(p_output, '{}'::jsonb) ELSE wr.output END,
      error_message = CASE WHEN p_terminal_status = 'succeeded' THEN NULL ELSE nullif(p_error, '') END,
      finished_at = v_now,
      lease_token = NULL,
      lease_until = NULL
  WHERE wr.id = p_run_id
    AND wr.owner_id = p_owner_id
    AND wr.status = 'running'
    AND wr.attempt = p_attempt
    AND wr.lease_token = p_lease_token
    AND wr.lease_until > v_now
  RETURNING wr.id, wr.status, wr.attempt;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow_run_lease_expired' USING ERRCODE = '40001';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.simula_claim_workflow_runs_lease_internal(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.simula_heartbeat_workflow_run(uuid, uuid, integer, uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.simula_finish_workflow_run_lease(uuid, uuid, integer, uuid, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.simula_claim_workflow_runs_lease_internal(integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.simula_heartbeat_workflow_run(uuid, uuid, integer, uuid, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.simula_finish_workflow_run_lease(uuid, uuid, integer, uuid, text, jsonb, text)
  TO service_role;

COMMIT;
