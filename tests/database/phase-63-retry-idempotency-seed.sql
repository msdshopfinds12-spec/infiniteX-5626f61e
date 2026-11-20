\set ON_ERROR_STOP on

INSERT INTO phase62.workflow_step_attempts (
  id, owner_id, run_id, step_id, attempt_number, idempotency_key,
  request_fingerprint, status, scheduled_at, finished_at
) VALUES
  (
    'attempt-cross-owner-original',
    'owner-a',
    'run-cross-owner',
    'step-j',
    1,
    'step-attempt:v1:run-cross-owner:step-j:1',
    'fingerprint-owner',
    'failed',
    clock_timestamp(),
    clock_timestamp()
  ),
  (
    'attempt-cross-owner-collision',
    'owner-b',
    'run-cross-owner',
    'step-j',
    2,
    'step-attempt:v1:run-cross-owner:step-j:2',
    'fingerprint-owner',
    'queued',
    clock_timestamp(),
    NULL
  );
