-- Phase 63E disposable-only attempt identity and retry concurrency contract.
-- This is synthetic test infrastructure. NEVER apply to hosted Supabase.
DROP SCHEMA IF EXISTS phase63e CASCADE;
CREATE SCHEMA phase63e;

CREATE TABLE phase63e.workflow_step_attempts (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  run_id text NOT NULL,
  step_id text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  idempotency_key text NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  lease_generation integer NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  finished_at timestamptz,
  failure_kind text CHECK (failure_kind IN ('transient','permanent','cancelled')),
  CHECK (
    (status = 'queued' AND started_at IS NULL AND finished_at IS NULL) OR
    (status = 'running' AND started_at IS NOT NULL AND finished_at IS NULL) OR
    (status IN ('succeeded','failed','cancelled') AND finished_at IS NOT NULL)
  )
);

CREATE FUNCTION phase63e.reject_attempt_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = phase63e, pg_temp
AS $function$
BEGIN
  IF ROW(
    NEW.owner_id, NEW.run_id, NEW.step_id, NEW.attempt_number,
    NEW.idempotency_key, NEW.request_fingerprint
  ) IS DISTINCT FROM ROW(
    OLD.owner_id, OLD.run_id, OLD.step_id, OLD.attempt_number,
    OLD.idempotency_key, OLD.request_fingerprint
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'attempt_identity_immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER workflow_step_attempts_identity_immutable
BEFORE UPDATE ON phase63e.workflow_step_attempts
FOR EACH ROW
EXECUTE FUNCTION phase63e.reject_attempt_identity_mutation();

CREATE FUNCTION phase63e.claim_attempt(
  p_attempt_id text,
  p_now timestamptz,
  p_lease_duration interval
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = phase63e, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF p_lease_duration <= interval '0 seconds' THEN
    RAISE EXCEPTION 'lease_duration_invalid';
  END IF;
  UPDATE phase63e.workflow_step_attempts
     SET status = 'running',
         lease_generation = lease_generation + 1,
         started_at = p_now,
         heartbeat_at = p_now,
         lease_expires_at = p_now + p_lease_duration
   WHERE id = p_attempt_id
     AND status = 'queued'
     AND scheduled_at <= p_now;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$function$;

CREATE FUNCTION phase63e.fail_and_schedule_retry(
  p_attempt_id text,
  p_owner_id text,
  p_expected_generation integer,
  p_now timestamptz,
  p_next_attempt_id text,
  p_force_rollback boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SET search_path = phase63e, pg_temp
AS $function$
DECLARE
  v_current phase63e.workflow_step_attempts%ROWTYPE;
  v_next phase63e.workflow_step_attempts%ROWTYPE;
  v_next_key text;
BEGIN
  SELECT * INTO v_current
    FROM phase63e.workflow_step_attempts
   WHERE id = p_attempt_id AND owner_id = p_owner_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt_not_found';
  END IF;

  v_next_key := format(
    'step-attempt:v1:%s:%s:%s',
    v_current.run_id, v_current.step_id, v_current.attempt_number + 1
  );

  -- Failed replay locks the exact next-attempt row while validating its identity.
  IF v_current.status = 'failed' THEN
    SELECT * INTO v_next
      FROM phase63e.workflow_step_attempts
     WHERE idempotency_key = v_next_key
     FOR UPDATE;
    IF FOUND THEN
      IF v_next.owner_id IS DISTINCT FROM v_current.owner_id
         OR v_next.run_id IS DISTINCT FROM v_current.run_id
         OR v_next.step_id IS DISTINCT FROM v_current.step_id
         OR v_next.attempt_number IS DISTINCT FROM v_current.attempt_number + 1
         OR v_next.idempotency_key IS DISTINCT FROM v_next_key
         OR v_next.request_fingerprint IS DISTINCT FROM v_current.request_fingerprint THEN
        RAISE EXCEPTION 'retry_idempotency_conflict';
      END IF;
      RETURN 'already_scheduled:' || v_next.id;
    END IF;
    RETURN 'already_terminal:' || v_current.id;
  END IF;

  IF v_current.status <> 'running'
     OR v_current.lease_generation <> p_expected_generation
     OR v_current.lease_expires_at IS NULL
     OR p_now >= v_current.lease_expires_at THEN
    RAISE EXCEPTION 'stale_or_expired_lease';
  END IF;

  UPDATE phase63e.workflow_step_attempts
     SET status = 'failed',
         failure_kind = 'transient',
         finished_at = p_now
   WHERE id = p_attempt_id;

  INSERT INTO phase63e.workflow_step_attempts (
    id, owner_id, run_id, step_id, attempt_number, idempotency_key,
    request_fingerprint, status, lease_generation, scheduled_at
  ) VALUES (
    p_next_attempt_id, v_current.owner_id, v_current.run_id, v_current.step_id,
    v_current.attempt_number + 1, v_next_key,
    v_current.request_fingerprint, 'queued', 0, p_now + interval '1 second'
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  IF p_force_rollback THEN
    RAISE EXCEPTION 'synthetic_retry_transaction_failure';
  END IF;

  SELECT * INTO v_next
    FROM phase63e.workflow_step_attempts
   WHERE idempotency_key = v_next_key
   FOR UPDATE;

  IF NOT FOUND
     OR v_next.owner_id IS DISTINCT FROM v_current.owner_id
     OR v_next.run_id IS DISTINCT FROM v_current.run_id
     OR v_next.step_id IS DISTINCT FROM v_current.step_id
     OR v_next.attempt_number IS DISTINCT FROM v_current.attempt_number + 1
     OR v_next.request_fingerprint IS DISTINCT FROM v_current.request_fingerprint THEN
    RAISE EXCEPTION 'retry_idempotency_conflict';
  END IF;

  RETURN 'retry_scheduled:' || v_next.id;
END;
$function$;

COMMENT ON SCHEMA phase63e IS
  'Disposable Phase 63E concurrency fixture only; never a production schema or migration.';

INSERT INTO phase63e.workflow_step_attempts (
  id, owner_id, run_id, step_id, attempt_number, idempotency_key,
  request_fingerprint, status, lease_generation, scheduled_at,
  started_at, heartbeat_at, lease_expires_at
) VALUES
  ('identity-queued','owner-identity','run-identity','step-identity',1,
   'identity-key-1','identity-fingerprint','queued',0,clock_timestamp(),NULL,NULL,NULL),
  ('claim-queued','owner-claim','run-claim','step-claim',1,
   'claim-key-1','claim-fingerprint','queued',0,clock_timestamp() - interval '1 second',NULL,NULL,NULL),
  ('retry-original','owner-retry','run-retry','step-retry',1,
   'retry-key-1','retry-fingerprint','running',1,clock_timestamp() - interval '1 minute',
   clock_timestamp() - interval '1 minute',clock_timestamp(),clock_timestamp() + interval '5 minutes'),
  ('rollback-original','owner-rollback','run-rollback','step-rollback',1,
   'rollback-key-1','rollback-fingerprint','running',1,clock_timestamp() - interval '1 minute',
   clock_timestamp() - interval '1 minute',clock_timestamp(),clock_timestamp() + interval '5 minutes');
