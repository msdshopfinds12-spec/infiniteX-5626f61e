-- Phase 87.1: durable transactional outbox foundation.
-- The outbox stores intent only. Delivery is at-least-once; external adapters
-- MUST pass the stable idempotency key to the provider and reconcile outcomes.

BEGIN;

CREATE TABLE private.simula_workflow_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  attempt integer NOT NULL CHECK (attempt > 0),
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 100),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object' AND pg_catalog.pg_column_size(payload) <= 32768),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 8),
  available_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  lock_token uuid,
  lease_until timestamptz,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 500),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  completed_at timestamptz,
  CONSTRAINT simula_workflow_outbox_idempotency_unique
    UNIQUE (owner_id, idempotency_key),
  CONSTRAINT simula_workflow_outbox_lease_consistency
    CHECK (
      (status = 'processing' AND lock_token IS NOT NULL AND lease_until IS NOT NULL)
      OR
      (status <> 'processing' AND lock_token IS NULL AND lease_until IS NULL)
    )
);

CREATE INDEX simula_workflow_outbox_pending_idx
  ON private.simula_workflow_outbox (available_at, created_at, id)
  WHERE status = 'pending';

CREATE INDEX simula_workflow_outbox_expired_lease_idx
  ON private.simula_workflow_outbox (lease_until, created_at, id)
  WHERE status = 'processing';

CREATE INDEX simula_workflow_outbox_owner_created_idx
  ON private.simula_workflow_outbox (owner_id, created_at DESC);

REVOKE ALL ON TABLE private.simula_workflow_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.simula_workflow_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.simula_complete_step_with_outbox(
  p_owner_id uuid,
  p_run_id uuid,
  p_step_id uuid,
  p_attempt integer,
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
  v_step_run public.workflow_step_runs%ROWTYPE;
  v_existing private.simula_workflow_outbox%ROWTYPE;
  v_outbox_id uuid;
BEGIN
  IF p_owner_id IS NULL OR p_run_id IS NULL OR p_step_id IS NULL OR p_attempt IS NULL OR p_attempt < 1 THEN
    RAISE EXCEPTION 'outbox_step_identity_required' USING ERRCODE = '22023';
  END IF;
  IF p_output IS NULL OR pg_catalog.jsonb_typeof(p_output) <> 'object'
     OR pg_catalog.pg_column_size(p_output) > 65536 THEN
    RAISE EXCEPTION 'step_output_must_be_bounded_object' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR pg_catalog.pg_column_size(p_payload) > 32768 THEN
    RAISE EXCEPTION 'outbox_payload_must_be_bounded_object' USING ERRCODE = '22023';
  END IF;
  IF (p_event_type IS NULL) <> (p_idempotency_key IS NULL) THEN
    RAISE EXCEPTION 'outbox_event_and_idempotency_key_must_be_paired' USING ERRCODE = '22023';
  END IF;
  IF p_event_type IS NOT NULL AND
     (pg_catalog.char_length(p_event_type) NOT BETWEEN 1 AND 100
      OR pg_catalog.char_length(p_idempotency_key) NOT BETWEEN 1 AND 200) THEN
    RAISE EXCEPTION 'outbox_event_identity_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run
  FROM public.workflow_runs
  WHERE id = p_run_id AND owner_id = p_owner_id
    AND status = 'running' AND attempt = p_attempt
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow_run_generation_superseded' USING ERRCODE = '40001';
  END IF;

  IF p_event_type IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM private.simula_workflow_outbox
    WHERE owner_id = p_owner_id AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing.run_id IS DISTINCT FROM p_run_id
         OR v_existing.step_id IS DISTINCT FROM p_step_id
         OR v_existing.attempt IS DISTINCT FROM p_attempt
         OR v_existing.event_type IS DISTINCT FROM p_event_type
         OR v_existing.payload IS DISTINCT FROM p_payload THEN
        RAISE EXCEPTION 'outbox_idempotency_conflict' USING ERRCODE = '23505';
      END IF;
      SELECT * INTO v_step_run
      FROM public.workflow_step_runs
      WHERE run_id = p_run_id AND step_id = p_step_id
        AND owner_id = p_owner_id AND attempt = p_attempt
        AND status = 'succeeded';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'outbox_replay_step_state_mismatch' USING ERRCODE = '40001';
      END IF;
      RETURN QUERY SELECT v_step_run.id, v_existing.id, true;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_step_run
  FROM public.workflow_step_runs
  WHERE run_id = p_run_id AND step_id = p_step_id
    AND owner_id = p_owner_id AND attempt = p_attempt
    AND status = 'running'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow_step_generation_superseded' USING ERRCODE = '40001';
  END IF;

  UPDATE public.workflow_step_runs
  SET status = 'succeeded',
      output = p_output,
      error_message = NULL,
      finished_at = pg_catalog.now()
  WHERE id = v_step_run.id
    AND owner_id = p_owner_id
    AND attempt = p_attempt
    AND status = 'running';

  IF p_event_type IS NOT NULL THEN
    INSERT INTO private.simula_workflow_outbox (
      owner_id, workflow_id, run_id, step_id, attempt,
      event_type, idempotency_key, payload
    )
    VALUES (
      p_owner_id, v_run.workflow_id, p_run_id, p_step_id, p_attempt,
      p_event_type, p_idempotency_key, p_payload
    )
    RETURNING id INTO v_outbox_id;
  END IF;

  RETURN QUERY SELECT v_step_run.id, v_outbox_id, false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.simula_claim_workflow_outbox(p_limit integer DEFAULT 10)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  workflow_id uuid,
  run_id uuid,
  step_id uuid,
  event_type text,
  idempotency_key text,
  payload jsonb,
  attempts integer,
  lock_token uuid,
  lease_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 25));
BEGIN
  UPDATE private.simula_workflow_outbox
  SET status = 'dead',
      lock_token = NULL,
      lease_until = NULL,
      last_error = coalesce(last_error, 'outbox_lease_expired_max_attempts'),
      updated_at = pg_catalog.now()
  WHERE status = 'processing'
    AND lease_until < pg_catalog.now()
    AND attempts >= 8;

  RETURN QUERY
  WITH picked AS (
    SELECT o.id
    FROM private.simula_workflow_outbox AS o
    WHERE (
      (o.status = 'pending' AND o.available_at <= pg_catalog.now())
      OR
      (o.status = 'processing' AND o.lease_until < pg_catalog.now() AND o.attempts < 8)
    )
    ORDER BY o.available_at ASC, o.created_at ASC, o.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE private.simula_workflow_outbox AS o
    SET status = 'processing',
        attempts = o.attempts + 1,
        lock_token = pg_catalog.gen_random_uuid(),
        lease_until = pg_catalog.now() + interval '60 seconds',
        updated_at = pg_catalog.now()
    FROM picked
    WHERE o.id = picked.id
    RETURNING o.id, o.owner_id, o.workflow_id, o.run_id, o.step_id,
      o.event_type, o.idempotency_key, o.payload, o.attempts,
      o.lock_token, o.lease_until
  )
  SELECT * FROM claimed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.simula_finish_workflow_outbox(
  p_id uuid,
  p_lock_token uuid,
  p_succeeded boolean,
  p_error text DEFAULT NULL
)
RETURNS TABLE (status text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row private.simula_workflow_outbox%ROWTYPE;
  v_status text;
BEGIN
  IF p_id IS NULL OR p_lock_token IS NULL OR p_succeeded IS NULL THEN
    RAISE EXCEPTION 'outbox_completion_identity_required' USING ERRCODE = '22023';
  END IF;
  IF p_error IS NOT NULL AND pg_catalog.char_length(p_error) > 500 THEN
    RAISE EXCEPTION 'outbox_error_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM private.simula_workflow_outbox
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbox_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'succeeded' AND p_succeeded THEN
    RETURN QUERY SELECT 'succeeded'::text, true;
    RETURN;
  END IF;

  IF v_row.status <> 'processing' OR v_row.lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'outbox_lease_superseded' USING ERRCODE = '40001';
  END IF;

  IF p_succeeded THEN
    v_status := 'succeeded';
    UPDATE private.simula_workflow_outbox
    SET status = v_status, lock_token = NULL, lease_until = NULL,
        last_error = NULL, completed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    WHERE id = p_id AND lock_token = p_lock_token;
  ELSE
    v_status := CASE WHEN v_row.attempts >= 8 THEN 'dead' ELSE 'pending' END;
    UPDATE private.simula_workflow_outbox
    SET status = v_status, lock_token = NULL, lease_until = NULL,
        last_error = nullif(p_error, ''),
        available_at = CASE WHEN v_status = 'pending'
          THEN pg_catalog.now() + pg_catalog.make_interval(secs => least(3600, 5 * pg_catalog.power(2::numeric, greatest(v_row.attempts - 1, 0))::integer))
          ELSE available_at END,
        updated_at = pg_catalog.now()
    WHERE id = p_id AND lock_token = p_lock_token;
  END IF;

  RETURN QUERY SELECT v_status, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.simula_complete_step_with_outbox(uuid, uuid, uuid, integer, jsonb, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.simula_claim_workflow_outbox(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.simula_finish_workflow_outbox(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simula_complete_step_with_outbox(uuid, uuid, uuid, integer, jsonb, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.simula_claim_workflow_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.simula_finish_workflow_outbox(uuid, uuid, boolean, text) TO service_role;

COMMIT;
