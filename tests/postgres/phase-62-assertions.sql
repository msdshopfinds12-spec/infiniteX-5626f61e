\set ON_ERROR_STOP on
SET search_path = phase62, public;

-- Retry scheduling and duplicate replay.
INSERT INTO workflow_step_attempts(
  id, owner_id, run_id, step_id, attempt_number, idempotency_key,
  request_fingerprint, status, scheduled_at
) VALUES (
  'attempt-retry-1', 'owner-a', 'run-retry', 'step-a', 1,
  'step-attempt:v1:run-retry:step-a:1', 'fingerprint-a', 'queued', clock_timestamp() - interval '1 second'
);
SELECT phase62.claim_attempt('attempt-retry-1', clock_timestamp(), interval '30 seconds');
DO $$
DECLARE result text;
BEGIN
  result := phase62.fail_and_schedule_retry(
    'attempt-retry-1', 'owner-a', 1, clock_timestamp(), 1,
    'transient', 'attempt-retry-2'
  );
  IF result <> 'retry_scheduled:attempt-retry-2' THEN
    RAISE EXCEPTION 'expected retry scheduling, got %', result;
  END IF;
  result := phase62.fail_and_schedule_retry(
    'attempt-retry-1', 'owner-a', 1, clock_timestamp(), 1,
    'transient', 'attempt-retry-2-replay'
  );
  IF result <> 'already_scheduled:attempt-retry-2' THEN
    RAISE EXCEPTION 'expected idempotent replay, got %', result;
  END IF;
  IF (SELECT count(*) FROM phase62.workflow_step_attempts WHERE run_id = 'run-retry') <> 2 THEN
    RAISE EXCEPTION 'duplicate retry attempt created';
  END IF;
  IF (SELECT count(*) FROM phase62.workflow_attempt_outbox WHERE attempt_id = 'attempt-retry-2') <> 1 THEN
    RAISE EXCEPTION 'outbox event missing or duplicated';
  END IF;
  IF (SELECT current_attempt_id FROM phase62.workflow_step_projection
       WHERE run_id = 'run-retry' AND step_id = 'step-a') <> 'attempt-retry-2' THEN
    RAISE EXCEPTION 'projection not advanced to next attempt';
  END IF;
END;
$$;

-- Forced outbox failure must roll back failure, next attempt, and projection.
INSERT INTO workflow_step_attempts(
  id, owner_id, run_id, step_id, attempt_number, idempotency_key,
  request_fingerprint, status, scheduled_at
) VALUES (
  'attempt-rollback-1', 'owner-a', 'run-rollback', 'step-b', 1,
  'step-attempt:v1:run-rollback:step-b:1', 'fingerprint-b', 'queued', clock_timestamp() - interval '1 second'
);
SELECT phase62.claim_attempt('attempt-rollback-1', clock_timestamp(), interval '30 seconds');
DO $$
BEGIN
  BEGIN
    PERFORM phase62.fail_and_schedule_retry(
      'attempt-rollback-1', 'owner-a', 1, clock_timestamp(), 2,
      'transient', 'attempt-rollback-2', true
    );
    RAISE EXCEPTION 'expected synthetic_outbox_failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'synthetic_outbox_failure' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM phase62.workflow_step_attempts WHERE id = 'attempt-rollback-1') <> 'running' THEN
    RAISE EXCEPTION 'failed attempt was not rolled back';
  END IF;
  IF EXISTS (SELECT 1 FROM phase62.workflow_step_attempts WHERE id = 'attempt-rollback-2') THEN
    RAISE EXCEPTION 'next attempt was not rolled back';
  END IF;
  IF EXISTS (SELECT 1 FROM phase62.workflow_step_projection WHERE run_id = 'run-rollback') THEN
    RAISE EXCEPTION 'projection was not rolled back';
  END IF;
  IF EXISTS (SELECT 1 FROM phase62.workflow_attempt_outbox WHERE attempt_id = 'attempt-rollback-2') THEN
    RAISE EXCEPTION 'outbox row was not rolled back';
  END IF;
END;
$$;

-- Stale fencing and owner mismatch fail closed.
INSERT INTO workflow_step_attempts(
  id, owner_id, run_id, step_id, attempt_number, idempotency_key,
  request_fingerprint, status, scheduled_at
) VALUES
  ('attempt-stale', 'owner-a', 'run-stale', 'step-c', 1, 'step-attempt:v1:run-stale:step-c:1', 'fingerprint-c', 'queued', clock_timestamp() - interval '1 second'),
  ('attempt-owner', 'owner-a', 'run-owner', 'step-d', 1, 'step-attempt:v1:run-owner:step-d:1', 'fingerprint-d', 'queued', clock_timestamp() - interval '1 second');
SELECT phase62.claim_attempt('attempt-stale', clock_timestamp(), interval '30 seconds');
SELECT phase62.claim_attempt('attempt-owner', clock_timestamp(), interval '30 seconds');
DO $$
BEGIN
  BEGIN
    PERFORM phase62.fail_and_schedule_retry(
      'attempt-stale', 'owner-a', 99, clock_timestamp(), 2, 'transient', 'unused-stale'
    );
    RAISE EXCEPTION 'expected stale_or_expired_lease';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'stale_or_expired_lease' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM phase62.fail_and_schedule_retry(
      'attempt-owner', 'owner-b', 1, clock_timestamp(), 2, 'transient', 'unused-owner'
    );
    RAISE EXCEPTION 'expected attempt_not_found';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'attempt_not_found' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM phase62.workflow_step_attempts WHERE id = 'attempt-stale') <> 'running' THEN
    RAISE EXCEPTION 'stale worker changed attempt';
  END IF;
  IF (SELECT status FROM phase62.workflow_step_attempts WHERE id = 'attempt-owner') <> 'running' THEN
    RAISE EXCEPTION 'wrong owner changed attempt';
  END IF;
END;
$$;

-- Retry exhaustion and permanent failures are terminal and do not enqueue.
INSERT INTO workflow_step_attempts(
  id, owner_id, run_id, step_id, attempt_number, idempotency_key,
  request_fingerprint, status, scheduled_at
) VALUES
  ('attempt-exhausted', 'owner-a', 'run-exhausted', 'step-e', 2, 'step-attempt:v1:run-exhausted:step-e:2', 'fingerprint-e', 'queued', clock_timestamp() - interval '1 second'),
  ('attempt-permanent', 'owner-a', 'run-permanent', 'step-f', 1, 'step-attempt:v1:run-permanent:step-f:1', 'fingerprint-f', 'queued', clock_timestamp() - interval '1 second');
SELECT phase62.claim_attempt('attempt-exhausted', clock_timestamp(), interval '30 seconds');
SELECT phase62.claim_attempt('attempt-permanent', clock_timestamp(), interval '30 seconds');
DO $$
DECLARE result text;
BEGIN
  result := phase62.fail_and_schedule_retry(
    'attempt-exhausted', 'owner-a', 1, clock_timestamp(), 1, 'transient', 'unused-exhausted'
  );
  IF result <> 'failed:attempt-exhausted' THEN RAISE EXCEPTION 'retry limit not enforced: %', result; END IF;
  result := phase62.fail_and_schedule_retry(
    'attempt-permanent', 'owner-a', 1, clock_timestamp(), 5, 'permanent', 'unused-permanent'
  );
  IF result <> 'failed:attempt-permanent' THEN RAISE EXCEPTION 'permanent failure retried: %', result; END IF;
  IF EXISTS (SELECT 1 FROM phase62.workflow_attempt_outbox
             WHERE attempt_id IN ('unused-exhausted', 'unused-permanent')) THEN
    RAISE EXCEPTION 'terminal failure unexpectedly emitted outbox';
  END IF;
END;
$$;

-- Cancellation is not accepted by the ordinary retry operation.
DO $$
BEGIN
  BEGIN
    PERFORM phase62.fail_and_schedule_retry(
      'attempt-stale', 'owner-a', 1, clock_timestamp(), 2, 'cancelled', 'unused-cancel'
    );
    RAISE EXCEPTION 'expected cancellation_requires_cancel_operation';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'cancellation_requires_cancel_operation' THEN RAISE; END IF;
  END;
END;
$$;

-- Terminal attempts cannot be reopened or rewritten.
DO $$
BEGIN
  BEGIN
    UPDATE phase62.workflow_step_attempts SET status = 'succeeded'
     WHERE id = 'attempt-exhausted';
    RAISE EXCEPTION 'expected terminal_attempt_immutable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'terminal_attempt_immutable' THEN RAISE; END IF;
  END;
END;
$$;

-- Cross-language canonical key vectors (JavaScript encodeURIComponent parity).
DO $phase62$
BEGIN
  IF phase62.encode_uri_component('run:/%') <> 'run%3A%2F%25' THEN
    RAISE EXCEPTION 'URI component encoding mismatch for reserved characters';
  END IF;
  IF phase62.encode_uri_component('step !*''()') <> 'step%20!*''()' THEN
    RAISE EXCEPTION 'URI component encoding mismatch for encodeURIComponent safe set';
  END IF;
  IF phase62.encode_uri_component('café') <> 'caf%C3%A9' THEN
    RAISE EXCEPTION 'URI component encoding mismatch for UTF-8';
  END IF;
END;
$phase62$;

-- A colliding retry key with a different request fingerprint must fail closed.
INSERT INTO workflow_step_attempts(
  id, owner_id, run_id, step_id, attempt_number, idempotency_key,
  request_fingerprint, status, scheduled_at, finished_at, failure_kind
) VALUES
  ('attempt-conflict-fp-1', 'owner-a', 'run-conflict-fp', 'step-g', 1,
   'step-attempt:v1:run-conflict-fp:step-g:1', 'fingerprint-original',
   'failed', clock_timestamp() - interval '2 seconds', clock_timestamp(), 'transient'),
  ('attempt-conflict-fp-2', 'owner-a', 'run-conflict-fp', 'step-g', 2,
   'step-attempt:v1:run-conflict-fp:step-g:2', 'fingerprint-different',
   'queued', clock_timestamp());
DO $phase62$
BEGIN
  BEGIN
    PERFORM phase62.fail_and_schedule_retry(
      'attempt-conflict-fp-1', 'owner-a', 1, clock_timestamp(), 3,
      'transient', 'unused-conflict-fp'
    );
    RAISE EXCEPTION 'expected retry_idempotency_conflict for fingerprint mismatch';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'retry_idempotency_conflict' THEN RAISE; END IF;
  END;
END;
$phase62$;

-- A colliding retry key bound to a different run identity must also fail closed.
INSERT INTO workflow_step_attempts(
  id, owner_id, run_id, step_id, attempt_number, idempotency_key,
  request_fingerprint, status, scheduled_at, finished_at, failure_kind
) VALUES
  ('attempt-conflict-run-1', 'owner-a', 'run-conflict-run', 'step-h', 1,
   'step-attempt:v1:run-conflict-run:step-h:1', 'fingerprint-h',
   'failed', clock_timestamp() - interval '2 seconds', clock_timestamp(), 'transient'),
  ('attempt-conflict-run-2', 'owner-a', 'different-run', 'step-h', 2,
   'step-attempt:v1:run-conflict-run:step-h:2', 'fingerprint-h',
   'queued', clock_timestamp());
DO $phase62$
BEGIN
  BEGIN
    PERFORM phase62.fail_and_schedule_retry(
      'attempt-conflict-run-1', 'owner-a', 1, clock_timestamp(), 3,
      'transient', 'unused-conflict-run'
    );
    RAISE EXCEPTION 'expected retry_idempotency_conflict for run mismatch';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'retry_idempotency_conflict' THEN RAISE; END IF;
  END;
END;
$phase62$;

SELECT 'phase-62-sql-contract-tests-passed' AS result;
