\\set ON_ERROR_STOP on

DO $baseline$
DECLARE
  v_result text;
BEGIN
  v_result := phase62.fail_and_schedule_retry(
    'attempt-cross-owner-original',
    'owner-a',
    1,
    clock_timestamp(),
    3,
    'transient',
    'attempt-should-not-be-created'
  );

  IF v_result <> 'already_terminal:attempt-cross-owner-original' THEN
    RAISE EXCEPTION 'baseline did not reproduce old owner-scoped lookup behavior; got %', v_result;
  END IF;
END
$baseline$;

DO $assert$
BEGIN
  IF (SELECT status FROM phase62.workflow_step_attempts
       WHERE id = 'attempt-cross-owner-original') <> 'failed' THEN
    RAISE EXCEPTION 'baseline unexpectedly changed original failed attempt';
  END IF;
  IF (SELECT status FROM phase62.workflow_step_attempts
       WHERE id = 'attempt-cross-owner-collision') <> 'queued' THEN
    RAISE EXCEPTION 'baseline unexpectedly changed colliding queued attempt';
  END IF;
  IF (SELECT count(*) FROM phase62.workflow_step_attempts) <> 2 THEN
    RAISE EXCEPTION 'baseline unexpectedly created another attempt';
  END IF;
END
$assert$;

\\echo 'PASS: old owner-scoped lookup reproduces the incorrect already_terminal result.'
