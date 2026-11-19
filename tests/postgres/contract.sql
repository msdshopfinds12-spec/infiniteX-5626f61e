\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION 'PostgreSQL 17 required; found %', version();
  END IF;
END;
$$;

INSERT INTO infinitex_harness.tasks (owner_subject,task_id,status,task_version,event_seq,fencing_token,payload_hash)
VALUES ('owner-a','rollback-task','approved',1,0,0,repeat('a',64)),
       ('owner-a','race-task','approved',1,0,0,repeat('b',64));

INSERT INTO infinitex_harness.approval_grants
(grant_id,owner_subject,task_id,token_digest,expected_task_version,payload_hash,expires_at)
VALUES ('11111111-1111-4111-8111-111111111111','owner-a','rollback-task',
        repeat('c',64),1,repeat('a',64),clock_timestamp()+interval '1 minute');

INSERT INTO infinitex_harness.operation_idempotency
(owner_subject,task_id,operation,idempotency_key,request_fingerprint,response_snapshot)
VALUES ('owner-a','rollback-task','contract_probe','same-key',repeat('d',64),'{"outcome":"accepted","version":1}'::jsonb);

DO $$
BEGIN
  BEGIN
    INSERT INTO infinitex_harness.tasks
    (owner_subject,task_id,status,task_version,event_seq,fencing_token,payload_hash,lease_id,lease_worker,lease_expires_at)
    VALUES ('owner-a','invalid-running','running',1,1,1,repeat('e',64),NULL,NULL,NULL);
    RAISE EXCEPTION 'running task without complete lease tuple was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO infinitex_harness.operation_idempotency
    (owner_subject,task_id,operation,idempotency_key,request_fingerprint,response_snapshot)
    VALUES ('owner-a','rollback-task','contract_probe','same-key',repeat('f',64),'{"outcome":"different"}'::jsonb);
    RAISE EXCEPTION 'duplicate idempotency scope was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

INSERT INTO infinitex_harness.task_events
(owner_subject,task_id,event_seq,task_version,fencing_token,event_type,actor_subject)
VALUES ('owner-a','rollback-task',1,1,0,'approved','owner-a');

DO $$
BEGIN
  BEGIN
    UPDATE infinitex_harness.task_events SET actor_subject='tampered' WHERE task_id='rollback-task';
    RAISE EXCEPTION 'append-only event mutation was accepted';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  IF (SELECT count(*) FROM infinitex_harness.task_events WHERE task_id='rollback-task') <> 1 THEN
    RAISE EXCEPTION 'event history unexpectedly changed';
  END IF;
  IF (SELECT count(*) FROM infinitex_harness.approval_grants WHERE token_digest=repeat('c',64)) <> 1 THEN
    RAISE EXCEPTION 'approval digest fixture missing';
  END IF;
END;
$$;
