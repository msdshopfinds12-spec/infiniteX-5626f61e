\\set ON_ERROR_STOP on

-- Every identity column must be rejected independently on a queued row.
DO $identity$
DECLARE
  v_rejected integer := 0;
BEGIN
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET owner_id = 'owner-forged' WHERE id = 'identity-queued';
    RAISE EXCEPTION 'owner_id mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
    v_rejected := v_rejected + 1;
  END;
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET run_id = 'run-forged' WHERE id = 'identity-queued';
    RAISE EXCEPTION 'run_id mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
    v_rejected := v_rejected + 1;
  END;
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET step_id = 'step-forged' WHERE id = 'identity-queued';
    RAISE EXCEPTION 'step_id mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
    v_rejected := v_rejected + 1;
  END;
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET attempt_number = 99 WHERE id = 'identity-queued';
    RAISE EXCEPTION 'attempt_number mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
    v_rejected := v_rejected + 1;
  END;
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET idempotency_key = 'key-forged' WHERE id = 'identity-queued';
    RAISE EXCEPTION 'idempotency_key mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
    v_rejected := v_rejected + 1;
  END;
  BEGIN
    UPDATE phase63e.workflow_step_attempts SET request_fingerprint = 'fingerprint-forged' WHERE id = 'identity-queued';
    RAISE EXCEPTION 'request_fingerprint mutation unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'attempt_identity_immutable' THEN RAISE; END IF;
    v_rejected := v_rejected + 1;
  END;
  IF v_rejected <> 6 THEN
    RAISE EXCEPTION 'expected 6 identity rejections; got %', v_rejected;
  END IF;
END
$identity$;

-- Identity remains fixed while supported worker-owned fields change.
DO $worker$
DECLARE
  v_claimed boolean;
  v_row phase63e.workflow_step_attempts%ROWTYPE;
BEGIN
  SELECT phase63e.claim_attempt('claim-queued', clock_timestamp(), interval '30 seconds')
    INTO v_claimed;
  IF NOT v_claimed THEN
    RAISE EXCEPTION 'queued attempt was not claimed';
  END IF;

  UPDATE phase63e.workflow_step_attempts
     SET heartbeat_at = clock_timestamp(),
         lease_expires_at = clock_timestamp() + interval '45 seconds'
   WHERE id = 'claim-queued' AND status = 'running' AND lease_generation = 1;

  SELECT * INTO v_row FROM phase63e.workflow_step_attempts WHERE id = 'claim-queued';
  IF v_row.status <> 'running' OR v_row.lease_generation <> 1
     OR v_row.heartbeat_at IS NULL OR v_row.lease_expires_at IS NULL THEN
    RAISE EXCEPTION 'legitimate claim/heartbeat transition failed';
  END IF;
  IF v_row.owner_id <> 'owner-claim' OR v_row.run_id <> 'run-claim'
     OR v_row.step_id <> 'step-claim' OR v_row.attempt_number <> 1
     OR v_row.idempotency_key <> 'claim-key-1'
     OR v_row.request_fingerprint <> 'claim-fingerprint' THEN
    RAISE EXCEPTION 'worker transition changed attempt identity';
  END IF;
END
$worker$;

-- A failed replay resolves the exact global idempotency key and validates its owner.
INSERT INTO phase63e.workflow_step_attempts (
  id, owner_id, run_id, step_id, attempt_number, idempotency_key,
  request_fingerprint, status, lease_generation, scheduled_at, finished_at
) VALUES
  ('replay-original','owner-replay','run-replay','step-replay',1,
   'step-attempt:v1:run-replay:step-replay:1','replay-fingerprint','failed',1,
   clock_timestamp() - interval '2 minutes',clock_timestamp()),
  ('replay-next','owner-replay','run-replay','step-replay',2,
   'step-attempt:v1:run-replay:step-replay:2','replay-fingerprint','queued',0,
   clock_timestamp() + interval '1 minute',NULL);

DO $replay$
DECLARE
  v_result text;
BEGIN
  v_result := phase63e.fail_and_schedule_retry(
    'replay-original','owner-replay',1,clock_timestamp(),'unused-next-id'
  );
  IF v_result <> 'already_scheduled:replay-next' THEN
    RAISE EXCEPTION 'unexpected replay result: %', v_result;
  END IF;
END
$replay$;

-- A cross-owner global-key collision must be rejected without mutation.
INSERT INTO phase63e.workflow_step_attempts (
  id, owner_id, run_id, step_id, attempt_number, idempotency_key,
  request_fingerprint, status, lease_generation, scheduled_at, finished_at
) VALUES (
  'collision-original','owner-a','run-collision','step-collision',1,
  'collision-key-1','fingerprint-a','failed',1,
  clock_timestamp() - interval '2 minutes',clock_timestamp()
), (
  'collision-next','owner-b','run-collision','step-collision',2,
  'step-attempt:v1:run-collision:step-collision:2','fingerprint-b','queued',0,
  clock_timestamp() + interval '1 minute',NULL
);

DO $collision$
BEGIN
  BEGIN
    PERFORM phase63e.fail_and_schedule_retry(
      'collision-original','owner-a',1,clock_timestamp(),'must-not-insert'
    );
    RAISE EXCEPTION 'expected retry_idempotency_conflict';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'retry_idempotency_conflict' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM phase63e.workflow_step_attempts WHERE id='collision-original') <> 'failed'
     OR (SELECT status FROM phase63e.workflow_step_attempts WHERE id='collision-next') <> 'queued'
     OR (SELECT count(*) FROM phase63e.workflow_step_attempts WHERE run_id='run-collision') <> 2 THEN
    RAISE EXCEPTION 'cross-owner collision mutated fixture rows';
  END IF;
END
$collision$;

-- Failed transaction must roll back original status and inserted retry.
DO $rollback$
BEGIN
  BEGIN
    PERFORM phase63e.fail_and_schedule_retry(
      'rollback-original','owner-rollback',1,clock_timestamp(),'rollback-next',true
    );
    RAISE EXCEPTION 'expected synthetic_retry_transaction_failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'synthetic_retry_transaction_failure' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM phase63e.workflow_step_attempts WHERE id='rollback-original') <> 'running'
     OR EXISTS (SELECT 1 FROM phase63e.workflow_step_attempts WHERE id='rollback-next') THEN
    RAISE EXCEPTION 'retry transaction did not roll back atomically';
  END IF;
END
$rollback$;

\echo 'phase-63e-identity-and-worker-regression-passed'
