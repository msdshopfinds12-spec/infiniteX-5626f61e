-- Phase 62 disposable PostgreSQL contract fixture.
-- This schema is synthetic and MUST NOT be applied to the hosted Supabase project.
DROP SCHEMA IF EXISTS phase62 CASCADE;
CREATE SCHEMA phase62;

CREATE TABLE phase62.workflow_step_attempts (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  run_id text NOT NULL,
  step_id text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  idempotency_key text NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  lease_generation integer NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  finished_at timestamptz,
  failure_kind text CHECK (failure_kind IN ('transient', 'permanent', 'cancelled')),
  error_code text,
  CHECK (
    (status = 'queued' AND started_at IS NULL AND finished_at IS NULL) OR
    (status = 'running' AND started_at IS NOT NULL AND finished_at IS NULL) OR
    (status IN ('succeeded', 'failed', 'cancelled') AND finished_at IS NOT NULL)
  )
);

CREATE TABLE phase62.workflow_step_projection (
  run_id text NOT NULL,
  step_id text NOT NULL,
  current_attempt_id text NOT NULL REFERENCES phase62.workflow_step_attempts(id),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  PRIMARY KEY (run_id, step_id)
);

CREATE TABLE phase62.workflow_attempt_outbox (
  event_id text PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type = 'workflow.step_attempt.due'),
  attempt_id text NOT NULL REFERENCES phase62.workflow_step_attempts(id),
  idempotency_key text NOT NULL UNIQUE,
  available_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION phase62.reject_terminal_attempt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = phase62, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('succeeded', 'failed', 'cancelled') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal_attempt_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workflow_step_attempts_terminal_immutable
BEFORE UPDATE ON phase62.workflow_step_attempts
FOR EACH ROW EXECUTE FUNCTION phase62.reject_terminal_attempt_mutation();

CREATE FUNCTION phase62.claim_attempt(
  p_attempt_id text,
  p_now timestamptz,
  p_lease_duration interval
)
RETURNS boolean
LANGUAGE sql
SET search_path = phase62, pg_temp
AS $$
  WITH claimed AS (
    UPDATE phase62.workflow_step_attempts
       SET status = 'running',
           lease_generation = lease_generation + 1,
           started_at = p_now,
           heartbeat_at = p_now,
           lease_expires_at = p_now + p_lease_duration
     WHERE id = p_attempt_id
       AND status = 'queued'
       AND scheduled_at <= p_now
       AND p_lease_duration > interval '0 seconds'
     RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;

CREATE FUNCTION phase62.fail_and_schedule_retry(
  p_attempt_id text,
  p_owner_id text,
  p_expected_lease_generation integer,
  p_now timestamptz,
  p_retry_limit integer,
  p_failure_kind text,
  p_next_attempt_id text,
  p_force_outbox_failure boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SET search_path = phase62, pg_temp
AS $$
DECLARE
  v_current phase62.workflow_step_attempts%ROWTYPE;
  v_next phase62.workflow_step_attempts%ROWTYPE;
  v_next_key text;
  v_inserted_id text;
BEGIN
  IF p_failure_kind = 'cancelled' THEN
    RAISE EXCEPTION 'cancellation_requires_cancel_operation';
  END IF;
  IF p_failure_kind NOT IN ('transient', 'permanent') THEN
    RAISE EXCEPTION 'failure_kind_invalid';
  END IF;
  IF p_retry_limit < 0 OR p_expected_lease_generation < 1 THEN
    RAISE EXCEPTION 'retry_input_invalid';
  END IF;

  SELECT * INTO v_current
    FROM phase62.workflow_step_attempts
   WHERE id = p_attempt_id AND owner_id = p_owner_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found';
  END IF;

  v_next_key := format(
    'step-attempt:v1:%s:%s:%s',
    v_current.run_id, v_current.step_id, v_current.attempt_number + 1
  );

  IF v_current.status = 'failed' THEN
    SELECT * INTO v_next
      FROM phase62.workflow_step_attempts
     WHERE owner_id = p_owner_id AND idempotency_key = v_next_key;
    IF FOUND THEN
      RETURN 'already_scheduled:' || v_next.id;
    END IF;
    RETURN 'already_terminal:' || v_current.id;
  END IF;

  IF v_current.status <> 'running'
     OR v_current.lease_generation <> p_expected_lease_generation
     OR v_current.lease_expires_at IS NULL
     OR p_now >= v_current.lease_expires_at THEN
    RAISE EXCEPTION 'stale_or_expired_lease';
  END IF;

  UPDATE phase62.workflow_step_attempts
     SET status = 'failed',
         failure_kind = p_failure_kind,
         finished_at = p_now,
         error_code = CASE WHEN p_failure_kind = 'transient'
                           THEN 'synthetic_transient_failure'
                           ELSE 'synthetic_permanent_failure' END
   WHERE id = p_attempt_id;

  IF p_failure_kind <> 'transient'
     OR v_current.attempt_number > p_retry_limit THEN
    INSERT INTO phase62.workflow_step_projection(run_id, step_id, current_attempt_id, status)
    VALUES (v_current.run_id, v_current.step_id, v_current.id, 'failed')
    ON CONFLICT (run_id, step_id) DO UPDATE
      SET current_attempt_id = EXCLUDED.current_attempt_id,
          status = EXCLUDED.status;
    RETURN 'failed:' || v_current.id;
  END IF;

  INSERT INTO phase62.workflow_step_attempts(
    id, owner_id, run_id, step_id, attempt_number, idempotency_key,
    request_fingerprint, status, lease_generation, scheduled_at
  )
  VALUES (
    p_next_attempt_id, v_current.owner_id, v_current.run_id, v_current.step_id,
    v_current.attempt_number + 1, v_next_key,
    v_current.request_fingerprint, 'queued', 0, p_now + interval '1 second'
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    SELECT * INTO v_next
      FROM phase62.workflow_step_attempts
     WHERE owner_id = p_owner_id AND idempotency_key = v_next_key;
    IF NOT FOUND
       OR v_next.run_id <> v_current.run_id
       OR v_next.step_id <> v_current.step_id
       OR v_next.attempt_number <> v_current.attempt_number + 1
       OR v_next.request_fingerprint <> v_current.request_fingerprint THEN
      RAISE EXCEPTION 'retry_idempotency_conflict';
    END IF;
  ELSE
    SELECT * INTO v_next
      FROM phase62.workflow_step_attempts
     WHERE id = v_inserted_id;
  END IF;

  INSERT INTO phase62.workflow_step_projection(run_id, step_id, current_attempt_id, status)
  VALUES (v_current.run_id, v_current.step_id, v_next.id, 'queued')
  ON CONFLICT (run_id, step_id) DO UPDATE
    SET current_attempt_id = EXCLUDED.current_attempt_id,
        status = EXCLUDED.status;

  IF p_force_outbox_failure THEN
    RAISE EXCEPTION 'synthetic_outbox_failure';
  END IF;

  INSERT INTO phase62.workflow_attempt_outbox(
    event_id, event_type, attempt_id, idempotency_key, available_at
  )
  VALUES (
    'workflow-step-attempt-due:v1:' || v_next.id,
    'workflow.step_attempt.due',
    v_next.id,
    'workflow-step-attempt-due:v1:' || v_next.id,
    v_next.scheduled_at
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN 'retry_scheduled:' || v_next.id;
END;
$$;

-- Explicitly document that this fixture models only the attempt/outbox contract.
COMMENT ON SCHEMA phase62 IS
  'Disposable Phase 62 test fixture only; not a production Supabase schema or migration.';
