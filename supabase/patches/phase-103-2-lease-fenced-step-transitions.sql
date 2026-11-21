-- Phase 103.2 — lease-fenced workflow step transitions.
-- REHEARSAL PATCH ONLY. Do not place in supabase/migrations/ or apply to hosted projects.
-- Apply after Phase 102.6 and Phase 103.1 in a disposable PostgreSQL database
-- whose schema has been replayed from the repository migrations.
--
-- Lock order invariant: workflow_runs first, workflow_step_runs second,
-- outbox third. Every transition obtains the run row lock before validating
-- the lease using clock_timestamp(), then performs all writes in this transaction.
--
-- Compatibility note: the legacy completion RPC remains callable for the
-- existing workers until Phases 103.3–103.5 switch both workers. Full fencing
-- is NOT achieved until legacy worker paths and grants are removed/restricted.

BEGIN;

CREATE OR REPLACE FUNCTION public.simula_start_workflow_step_with_lease(
  p_owner_id uuid,
  p_run_id uuid,
  p_step_id uuid,
  p_attempt integer,
  p_lease_token uuid,
  p_input jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (step_run_id uuid, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_run public.workflow_runs%ROWTYPE;
  v_step_run public.workflow_step_runs%ROWTYPE;
  v_now timestamptz;
  v_step_run_id uuid;
BEGIN
  IF p_owner_id IS NULL OR p_run_id IS NULL OR p_step_id IS NULL
     OR p_lease_token IS NULL OR p_attempt IS NULL OR p_attempt < 1 THEN
    RAISE EXCEPTION 'workflow_run_lease_identity_required' USING ERRCODE = '22023';
  END IF;
  IF p_input IS NULL OR pg_catalog.jsonb_typeof(p_input) <> 'object'
     OR pg_catalog.pg_column_size(p_input) > 65536 THEN
    RAISE EXCEPTION 'workflow_step_input_must_be_bounded_object' USING ERRCODE = '22023';
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

  IF NOT EXISTS (
    SELECT 1 FROM public.workflow_steps AS s
    WHERE s.id = p_step_id AND s.workflow_id = v_run.workflow_id
  ) THEN
    RAISE EXCEPTION 'workflow_step_ownership_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT sr.* INTO v_step_run
  FROM public.workflow_step_runs AS sr
  WHERE sr.run_id = p_run_id
    AND sr.step_id = p_step_id
    AND sr.owner_id = p_owner_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_step_run.attempt > p_attempt THEN
      RAISE EXCEPTION 'workflow_step_attempt_superseded' USING ERRCODE = '40001';
    END IF;
    IF v_step_run.attempt = p_attempt THEN
      IF v_step_run.status = 'running' THEN
        RETURN QUERY SELECT v_step_run.id, true;
        RETURN;
      END IF;
      RAISE EXCEPTION 'workflow_step_attempt_already_terminal' USING ERRCODE = '40001';
    END IF;

    UPDATE public.workflow_step_runs AS sr
    SET status = 'running',
        input = p_input,
        output = NULL,
        error_message = NULL,
        attempt = p_attempt,
        started_at = v_now,
        finished_at = NULL
    WHERE sr.id = v_step_run.id
      AND sr.owner_id = p_owner_id
      AND sr.attempt < p_attempt
    RETURNING sr.id INTO v_step_run_id;

    IF v_step_run_id IS NULL THEN
      RAISE EXCEPTION 'workflow_step_attempt_superseded' USING ERRCODE = '40001';
    END IF;
  ELSE
    INSERT INTO public.workflow_step_runs (
      run_id, step_id, owner_id, status, input, output,
      error_message, attempt, started_at, finished_at
    )
    VALUES (
      p_run_id, p_step_id, p_owner_id, 'running', p_input, NULL,
      NULL, p_attempt, v_now, NULL
    )
    RETURNING id INTO v_step_run_id;
  END IF;

  RETURN QUERY SELECT v_step_run_id, false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.simula_fail_workflow_step_with_lease(
  p_owner_id uuid,
  p_run_id uuid,
  p_step_id uuid,
  p_attempt integer,
  p_lease_token uuid,
  p_error text
)
RETURNS TABLE (step_run_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_run public.workflow_runs%ROWTYPE;
  v_now timestamptz;
  v_step_run_id uuid;
BEGIN
  IF p_owner_id IS NULL OR p_run_id IS NULL OR p_step_id IS NULL
     OR p_lease_token IS NULL OR p_attempt IS NULL OR p_attempt < 1 THEN
    RAISE EXCEPTION 'workflow_run_lease_identity_required' USING ERRCODE = '22023';
  END IF;
  IF p_error IS NULL OR pg_catalog.char_length(p_error) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'workflow_step_error_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT wr.* INTO v_run
  FROM public.workflow_runs AS wr
  WHERE wr.id = p_run_id AND wr.owner_id = p_owner_id
    AND wr.status = 'running' AND wr.attempt = p_attempt
    AND wr.lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow_run_lease_superseded' USING ERRCODE = '40001';
  END IF;

  v_now := pg_catalog.clock_timestamp();
  IF v_run.lease_until IS NULL OR v_run.lease_until <= v_now THEN
    RAISE EXCEPTION 'workflow_run_lease_expired' USING ERRCODE = '40001';
  END IF;

  UPDATE public.workflow_step_runs AS sr
  SET status = 'failed',
      error_message = p_error,
      finished_at = v_now
  WHERE sr.run_id = p_run_id
    AND sr.step_id = p_step_id
    AND sr.owner_id = p_owner_id
    AND sr.attempt = p_attempt
    AND sr.status = 'running'
  RETURNING sr.id INTO v_step_run_id;

  IF v_step_run_id IS NULL THEN
    RAISE EXCEPTION 'workflow_step_attempt_superseded' USING ERRCODE = '40001';
  END IF;

  RETURN QUERY SELECT v_step_run_id;
END;
$function$;

-- This wrapper locks and validates the run before delegating to the existing
-- atomic step+outbox transition. The lock remains held until the caller's
-- transaction commits, preventing lease rotation between validation and writes.
CREATE OR REPLACE FUNCTION public.simula_complete_step_with_outbox_lease(
  p_owner_id uuid,
  p_run_id uuid,
  p_step_id uuid,
  p_attempt integer,
  p_lease_token uuid,
  p_output jsonb,
  p_event_type text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (step_run_id uuid, outbox_id uuid, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_run public.workflow_runs%ROWTYPE;
  v_now timestamptz;
BEGIN
  IF p_owner_id IS NULL OR p_run_id IS NULL OR p_step_id IS NULL
     OR p_lease_token IS NULL OR p_attempt IS NULL OR p_attempt < 1 THEN
    RAISE EXCEPTION 'workflow_run_lease_identity_required' USING ERRCODE = '22023';
  END IF;

  SELECT wr.* INTO v_run
  FROM public.workflow_runs AS wr
  WHERE wr.id = p_run_id AND wr.owner_id = p_owner_id
    AND wr.status = 'running' AND wr.attempt = p_attempt
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
  SELECT * FROM public.simula_complete_step_with_outbox(
    p_owner_id, p_run_id, p_step_id, p_attempt, p_output,
    p_event_type, p_idempotency_key, p_payload
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.simula_start_workflow_step_with_lease(uuid, uuid, uuid, integer, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.simula_fail_workflow_step_with_lease(uuid, uuid, uuid, integer, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.simula_complete_step_with_outbox_lease(uuid, uuid, uuid, integer, uuid, jsonb, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.simula_start_workflow_step_with_lease(uuid, uuid, uuid, integer, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.simula_fail_workflow_step_with_lease(uuid, uuid, uuid, integer, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.simula_complete_step_with_outbox_lease(uuid, uuid, uuid, integer, uuid, jsonb, text, text, jsonb)
  TO service_role;

COMMIT;
