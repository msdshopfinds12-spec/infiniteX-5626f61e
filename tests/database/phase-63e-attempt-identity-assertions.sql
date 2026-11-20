\set ON_ERROR_STOP on

-- Every immutable identity component must be rejected independently.
DO $identity$
BEGIN
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET owner_id = 'owner-tampered' WHERE id = 'identity-queued';
    RAISE EXCEPTION 'owner_id mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET run_id = 'run-tampered' WHERE id = 'identity-queued';
    RAISE EXCEPTION 'run_id mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET step_id = 'step-tampered' WHERE id = 'identity-queued';
    RAISE EXCEPTION 'step_id mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET attempt_number = 99 WHERE id = 'identity-queued';
    RAISE EXCEPTION 'attempt_number mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET idempotency_key = 'key-tampered' WHERE id = 'identity-queued';
    RAISE EXCEPTION 'idempotency_key mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET request_fingerprint = 'fingerprint-tampered' WHERE id = 'identity-queued';
    RAISE EXCEPTION 'request_fingerprint mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
  END;
END
$identity$;

DO $identity_assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM phase63e.workflow_step_attempts
     WHERE id='identity-queued'
       AND owner_id='owner-identity'
       AND run_id='run-identity'
       AND step_id='step-identity'
       AND attempt_number=1
       AND idempotency_key='identity-key-1'
       AND request_fingerprint='identity-fingerprint'
       AND status='queued'
  ) THEN
    RAISE EXCEPTION 'identity mutation test changed the queued row';
  END IF;
END
$identity_assert$;

-- Legitimate claim, heartbeat, lease renewal and generation updates remain allowed.
DO $worker$
DECLARE
  v_claimed boolean;
  v_generation integer;
BEGIN
  v_claimed := phase63e.claim_attempt('claim-queued', clock_timestamp(), interval '60 seconds');
  IF NOT v_claimed THEN RAISE EXCEPTION 'queued-to-running claim unexpectedly failed'; END IF;

  UPDATE phase63e.workflow_step_attempts
     SET heartbeat_at = clock_timestamp()
   WHERE id='claim-queued' AND status='running';
  UPDATE phase63e.workflow_step_attempts
     SET lease_expires_at = lease_expires_at + interval '30 seconds'
   WHERE id='claim-queued' AND status='running';
  SELECT lease_generation INTO v_generation
    FROM phase63e.workflow_step_attempts WHERE id='claim-queued';

  IF v_generation <> 1 OR NOT EXISTS (
    SELECT 1 FROM phase63e.workflow_step_attempts
     WHERE id='claim-queued'
       AND status='running'
       AND heartbeat_at IS NOT NULL
       AND lease_expires_at > started_at
  ) THEN
    RAISE EXCEPTION 'legitimate worker lease/heartbeat transition failed';
  END IF;
END
$worker$;

-- Failure after original-row update and next-row insert must roll back atomically.
DO $rollback$
DECLARE
  v_message text;
BEGIN
  BEGIN
    PERFORM phase63e.fail_and_schedule_retry(
      'rollback-original','owner-rollback',1,clock_timestamp(),'rollback-next',true
    );
    RAISE EXCEPTION 'forced rollback did not occur';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message <> 'synthetic_retry_transaction_failure' THEN RAISE; END IF;
  END;

  IF (SELECT status FROM phase63e.workflow_step_attempts WHERE id='rollback-original') <> 'running' THEN
    RAISE EXCEPTION 'retry failure did not roll back original attempt status';
  END IF;
  IF EXISTS (SELECT 1 FROM phase63e.workflow_step_attempts WHERE id='rollback-next') THEN
    RAISE EXCEPTION 'retry failure left a partially inserted next attempt';
  END IF;
END
$rollback$;

\echo 'phase-63e-identity-worker-rollback-regressions-passed'
