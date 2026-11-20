\set ON_ERROR_STOP on

DO $fixed$
BEGIN
  BEGIN
    PERFORM phase62.fail_and_schedule_retry(
      'attempt-cross-owner-original',
      'owner-a',
      1,
      clock_timestamp(),
      3,
      'transient',
      'attempt-should-not-be-created'
    );
    RAISE EXCEPTION 'expected retry_idempotency_conflict for cross-owner global key collision';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'retry_idempotency_conflict' THEN
      RAISE;
    END IF;
  END;
END
$fixed$;

DO $assert$
BEGIN
  IF (SELECT status FROM phase62.workflow_step_attempts
       WHERE id = 'attempt-cross-owner-original') <> 'failed' THEN
    RAISE EXCEPTION 'fixed replay changed original failed attempt';
  END IF;
  IF (SELECT status FROM phase62.workflow_step_attempts
       WHERE id = 'attempt-cross-owner-collision') <> 'queued' THEN
    RAISE EXCEPTION 'fixed replay changed colliding queued attempt';
  END IF;
  IF (SELECT count(*) FROM phase62.workflow_step_attempts) <> 2 THEN
    RAISE EXCEPTION 'fixed replay created an unexpected attempt';
  END IF;
END
$assert$;

\echo 'PASS: corrected global-key lookup rejects cross-owner collision without mutation.'
