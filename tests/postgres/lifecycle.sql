-- PHASE 6G.15 — TEST-ONLY transactional lifecycle functions.
-- This file is intentionally outside supabase/migrations/. It is a disposable
-- contract harness, NOT a production authorization boundary or deployable RPC set.

CREATE OR REPLACE FUNCTION infinitex_harness.approve_and_issue_grant(
  p_owner text, p_task text, p_expected_version bigint,
  p_grant_id uuid, p_token_digest text, p_expires_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t infinitex_harness.tasks%ROWTYPE;
BEGIN
  IF p_owner IS NULL OR length(p_owner) NOT BETWEEN 1 AND 128
     OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'invalid approval input' USING ERRCODE='22023';
  END IF;
  SELECT * INTO t FROM infinitex_harness.tasks
   WHERE owner_subject=p_owner AND task_id=p_task FOR UPDATE;
  IF NOT FOUND OR t.status <> 'awaiting_approval'
     OR t.task_version <> p_expected_version THEN
    RETURN NULL;
  END IF;
  UPDATE infinitex_harness.tasks
     SET status='approved', task_version=task_version+1,
         event_seq=event_seq+1, updated_at=clock_timestamp()
   WHERE owner_subject=p_owner AND task_id=p_task
   RETURNING * INTO t;
  INSERT INTO infinitex_harness.approval_grants
    (grant_id,owner_subject,task_id,token_digest,expected_task_version,
     payload_hash,expires_at)
  VALUES (p_grant_id,p_owner,p_task,p_token_digest,t.task_version,
          t.payload_hash,p_expires_at);
  INSERT INTO infinitex_harness.task_events
    (owner_subject,task_id,event_seq,task_version,fencing_token,
     event_type,actor_subject,metadata)
  VALUES (p_owner,p_task,t.event_seq,t.task_version,t.fencing_token,
          'approved',p_owner,jsonb_build_object('grant_id',p_grant_id));
  RETURN jsonb_build_object('task_id',t.task_id,'status',t.status,
                            'version',t.task_version,'event_seq',t.event_seq);
END;
$$;

CREATE OR REPLACE FUNCTION infinitex_harness.claim_with_approval(
  p_owner text, p_task text, p_grant_id uuid, p_token_digest text,
  p_worker text, p_lease_id uuid, p_lease_ms integer,
  p_idempotency_key text, p_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t infinitex_harness.tasks%ROWTYPE;
        g infinitex_harness.approval_grants%ROWTYPE;
        prior infinitex_harness.operation_idempotency%ROWTYPE;
        response jsonb;
BEGIN
  IF p_owner IS NULL OR length(p_owner) NOT BETWEEN 1 AND 128
     OR p_worker IS NULL OR length(p_worker) NOT BETWEEN 1 AND 128
     OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_fingerprint !~ '^[a-f0-9]{64}$'
     OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200
     OR p_lease_ms NOT BETWEEN 1000 AND 300000 THEN
    RAISE EXCEPTION 'invalid claim input' USING ERRCODE='22023';
  END IF;

  SELECT * INTO prior FROM infinitex_harness.operation_idempotency
   WHERE owner_subject=p_owner AND task_id=p_task
     AND operation='claim' AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF prior.request_fingerprint <> p_fingerprint THEN
      RAISE EXCEPTION 'idempotency key reused with different request'
        USING ERRCODE='23505';
    END IF;
    RETURN prior.response_snapshot;
  END IF;

  SELECT * INTO t FROM infinitex_harness.tasks
   WHERE owner_subject=p_owner AND task_id=p_task FOR UPDATE;
  IF NOT FOUND OR t.status <> 'approved' THEN RETURN NULL; END IF;

  SELECT * INTO g FROM infinitex_harness.approval_grants
   WHERE grant_id=p_grant_id AND owner_subject=p_owner AND task_id=p_task
   FOR UPDATE;
  IF NOT FOUND OR g.token_digest <> p_token_digest
     OR g.consumed_at IS NOT NULL OR g.expires_at <= clock_timestamp()
     OR g.expected_task_version <> t.task_version
     OR g.payload_hash <> t.payload_hash THEN
    RETURN NULL;
  END IF;

  UPDATE infinitex_harness.approval_grants
     SET consumed_at=clock_timestamp(),
         consumed_fencing_token=t.fencing_token+1
   WHERE grant_id=p_grant_id AND consumed_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE infinitex_harness.tasks
     SET status='running', task_version=task_version+1,
         event_seq=event_seq+1, fencing_token=fencing_token+1,
         lease_id=p_lease_id, lease_worker=p_worker,
         lease_expires_at=clock_timestamp()+(p_lease_ms * interval '1 millisecond'),
         updated_at=clock_timestamp()
   WHERE owner_subject=p_owner AND task_id=p_task
   RETURNING * INTO t;

  INSERT INTO infinitex_harness.task_events
    (owner_subject,task_id,event_seq,task_version,fencing_token,
     event_type,actor_subject,metadata)
  VALUES (p_owner,p_task,t.event_seq,t.task_version,t.fencing_token,
          'claimed',p_worker,jsonb_build_object('lease_id',p_lease_id));

  response := jsonb_build_object('task_id',t.task_id,'status',t.status,
    'version',t.task_version,'event_seq',t.event_seq,
    'fencing_token',t.fencing_token,'lease_id',t.lease_id,
    'lease_worker',t.lease_worker,'lease_expires_at',t.lease_expires_at);
  INSERT INTO infinitex_harness.operation_idempotency
    (owner_subject,task_id,operation,idempotency_key,request_fingerprint,response_snapshot)
  VALUES (p_owner,p_task,'claim',p_idempotency_key,p_fingerprint,response);
  RETURN response;
END;
$$;

CREATE OR REPLACE FUNCTION infinitex_harness.renew_lease(
  p_owner text, p_task text, p_lease_id uuid, p_worker text,
  p_fence bigint, p_expected_version bigint, p_lease_ms integer
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t infinitex_harness.tasks%ROWTYPE;
BEGIN
  IF p_lease_ms NOT BETWEEN 1000 AND 300000 THEN
    RAISE EXCEPTION 'invalid lease duration' USING ERRCODE='22023';
  END IF;
  SELECT * INTO t FROM infinitex_harness.tasks
   WHERE owner_subject=p_owner AND task_id=p_task FOR UPDATE;
  IF NOT FOUND OR t.status <> 'running' OR t.lease_id <> p_lease_id
     OR t.lease_worker <> p_worker OR t.fencing_token <> p_fence
     OR t.task_version <> p_expected_version
     OR t.lease_expires_at <= clock_timestamp() THEN RETURN NULL; END IF;
  UPDATE infinitex_harness.tasks
     SET task_version=task_version+1, event_seq=event_seq+1,
         lease_expires_at=clock_timestamp()+(p_lease_ms * interval '1 millisecond'),
         updated_at=clock_timestamp()
   WHERE owner_subject=p_owner AND task_id=p_task RETURNING * INTO t;
  INSERT INTO infinitex_harness.task_events
    (owner_subject,task_id,event_seq,task_version,fencing_token,event_type,actor_subject)
  VALUES (p_owner,p_task,t.event_seq,t.task_version,t.fencing_token,'lease_renewed',p_worker);
  RETURN jsonb_build_object('task_id',t.task_id,'status',t.status,
    'version',t.task_version,'fencing_token',t.fencing_token,
    'lease_id',t.lease_id,'lease_expires_at',t.lease_expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION infinitex_harness.settle_lease(
  p_owner text, p_task text, p_lease_id uuid, p_worker text,
  p_fence bigint, p_expected_version bigint, p_outcome text
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE t infinitex_harness.tasks%ROWTYPE;
        next_status text;
        next_event text;
BEGIN
  IF p_outcome NOT IN ('succeeded','failed') THEN
    RAISE EXCEPTION 'invalid settlement outcome' USING ERRCODE='22023';
  END IF;
  next_status := p_outcome;
  next_event := p_outcome;
  SELECT * INTO t FROM infinitex_harness.tasks
   WHERE owner_subject=p_owner AND task_id=p_task FOR UPDATE;
  IF NOT FOUND OR t.status <> 'running' OR t.lease_id <> p_lease_id
     OR t.lease_worker <> p_worker OR t.fencing_token <> p_fence
     OR t.task_version <> p_expected_version
     OR t.lease_expires_at <= clock_timestamp() THEN RETURN false; END IF;
  UPDATE infinitex_harness.tasks
     SET status=next_status, task_version=task_version+1,
         event_seq=event_seq+1, lease_id=NULL, lease_worker=NULL,
         lease_expires_at=NULL, updated_at=clock_timestamp()
   WHERE owner_subject=p_owner AND task_id=p_task RETURNING * INTO t;
  INSERT INTO infinitex_harness.task_events
    (owner_subject,task_id,event_seq,task_version,fencing_token,event_type,actor_subject)
  VALUES (p_owner,p_task,t.event_seq,t.task_version,t.fencing_token,next_event,p_worker);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION infinitex_harness.cancel_task(
  p_owner text, p_task text, p_expected_version bigint
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE t infinitex_harness.tasks%ROWTYPE;
BEGIN
  SELECT * INTO t FROM infinitex_harness.tasks
   WHERE owner_subject=p_owner AND task_id=p_task FOR UPDATE;
  IF NOT FOUND OR t.task_version <> p_expected_version
     OR t.status IN ('succeeded','failed','cancelled') THEN RETURN false; END IF;
  UPDATE infinitex_harness.tasks
     SET status='cancelled', task_version=task_version+1,
         event_seq=event_seq+1, lease_id=NULL, lease_worker=NULL,
         lease_expires_at=NULL, updated_at=clock_timestamp()
   WHERE owner_subject=p_owner AND task_id=p_task RETURNING * INTO t;
  INSERT INTO infinitex_harness.task_events
    (owner_subject,task_id,event_seq,task_version,fencing_token,event_type,actor_subject)
  VALUES (p_owner,p_task,t.event_seq,t.task_version,t.fencing_token,'cancelled',p_owner);
  RETURN true;
END;
$$;
