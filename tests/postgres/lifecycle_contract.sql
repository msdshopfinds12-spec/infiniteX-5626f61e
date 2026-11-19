\set ON_ERROR_STOP on
-- Isolated from the Phase 6G.14 fixtures by unique task identifiers.
INSERT INTO infinitex_harness.tasks
(owner_subject,task_id,status,task_version,event_seq,fencing_token,payload_hash)
VALUES
 ('owner-15','lifecycle-task','awaiting_approval',0,0,0,repeat('1',64)),
 ('owner-15','cancel-task','awaiting_approval',0,0,0,repeat('2',64));

DO $$
DECLARE approved jsonb; claimed jsonb; replay jsonb; renewed jsonb;
        lease uuid := '33333333-3333-4333-8333-333333333333';
        grant_id_value uuid := '44444444-4444-4444-8444-444444444444';
        changed_fingerprint_rejected boolean := false;
BEGIN
  approved := infinitex_harness.approve_and_issue_grant(
    'owner-15','lifecycle-task',0,grant_id_value,repeat('a',64),clock_timestamp()+interval '5 minutes');
  IF approved->>'status' <> 'approved' OR (approved->>'version')::int <> 1 THEN
    RAISE EXCEPTION 'approval transition failed: %',approved;
  END IF;

  claimed := infinitex_harness.claim_with_approval(
    'owner-15','lifecycle-task',grant,repeat('a',64),'worker-15',lease,30000,
    'claim-key-15',repeat('b',64));
  IF claimed->>'status' <> 'running' OR (claimed->>'fencing_token')::int <> 1
     OR (claimed->>'version')::int <> 2 THEN
    RAISE EXCEPTION 'atomic claim failed: %',claimed;
  END IF;

  replay := infinitex_harness.claim_with_approval(
    'owner-15','lifecycle-task',grant,repeat('a',64),'worker-15',lease,30000,
    'claim-key-15',repeat('b',64));
  IF replay IS DISTINCT FROM claimed THEN
    RAISE EXCEPTION 'same-key replay did not return original snapshot';
  END IF;

  BEGIN
    PERFORM infinitex_harness.claim_with_approval(
      'owner-15','lifecycle-task',grant,repeat('a',64),'worker-15',lease,30000,
      'claim-key-15',repeat('c',64));
  EXCEPTION WHEN unique_violation THEN changed_fingerprint_rejected := true;
  END;
  IF NOT changed_fingerprint_rejected THEN
    RAISE EXCEPTION 'changed request fingerprint was not rejected';
  END IF;

  renewed := infinitex_harness.renew_lease(
    'owner-15','lifecycle-task',lease,'worker-15',1,2,30000);
  IF renewed IS NULL OR (renewed->>'version')::int <> 3
     OR (renewed->>'fencing_token')::int <> 1 THEN
    RAISE EXCEPTION 'lease renewal failed: %',renewed;
  END IF;

  IF infinitex_harness.settle_lease(
    'owner-15','lifecycle-task',lease,'stale-worker',1,3,'succeeded') THEN
    RAISE EXCEPTION 'stale worker unexpectedly settled task';
  END IF;
  IF NOT infinitex_harness.settle_lease(
    'owner-15','lifecycle-task',lease,'worker-15',1,3,'succeeded') THEN
    RAISE EXCEPTION 'valid worker settlement failed';
  END IF;
  IF (SELECT status FROM infinitex_harness.tasks
       WHERE owner_subject='owner-15' AND task_id='lifecycle-task') <> 'succeeded' THEN
    RAISE EXCEPTION 'terminal success state missing';
  END IF;

  approved := infinitex_harness.approve_and_issue_grant(
    'owner-15','cancel-task',0,'55555555-5555-4555-8555-555555555555',
    repeat('d',64),clock_timestamp()+interval '5 minutes');
  IF NOT infinitex_harness.cancel_task('owner-15','cancel-task',1) THEN
    RAISE EXCEPTION 'owner cancellation failed';
  END IF;
  IF infinitex_harness.cancel_task('owner-15','cancel-task',1) THEN
    RAISE EXCEPTION 'stale cancellation unexpectedly succeeded';
  END IF;
END;
$$;

DO $$
BEGIN
  IF (SELECT count(*) FROM infinitex_harness.task_events
       WHERE owner_subject='owner-15' AND task_id='lifecycle-task') <> 4 THEN
    RAISE EXCEPTION 'expected approved, claimed, renewed, succeeded events';
  END IF;
  IF (SELECT status FROM infinitex_harness.tasks
       WHERE owner_subject='owner-15' AND task_id='cancel-task') <> 'cancelled' THEN
    RAISE EXCEPTION 'cancellation state missing';
  END IF;
  IF (SELECT consumed_fencing_token FROM infinitex_harness.approval_grants
       WHERE grant_id='44444444-4444-4444-8444-444444444444') <> 1 THEN
    RAISE EXCEPTION 'approval grant was not consumed with expected fence';
  END IF;
END;
$$;

\echo 'Phase 6G.15 lifecycle contract assertions passed.'
