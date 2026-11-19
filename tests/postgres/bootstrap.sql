-- TEST-ONLY disposable schema. Never place this file in a migration directory.
DROP SCHEMA IF EXISTS infinitex_harness CASCADE;
CREATE SCHEMA infinitex_harness;

CREATE TABLE infinitex_harness.tasks (
  owner_subject text NOT NULL CHECK (length(owner_subject) BETWEEN 1 AND 128),
  task_id text NOT NULL CHECK (task_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  status text NOT NULL CHECK (status IN ('queued','planning','awaiting_approval','approved','running','succeeded','failed','cancelled')),
  task_version bigint NOT NULL DEFAULT 0 CHECK (task_version >= 0),
  event_seq bigint NOT NULL DEFAULT 0 CHECK (event_seq >= 0),
  fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  lease_id uuid,
  lease_worker text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_subject, task_id),
  CHECK (
    (status = 'running' AND lease_id IS NOT NULL AND lease_worker IS NOT NULL
      AND length(lease_worker) BETWEEN 1 AND 128 AND lease_expires_at IS NOT NULL)
    OR
    (status <> 'running' AND lease_id IS NULL AND lease_worker IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE TABLE infinitex_harness.approval_grants (
  grant_id uuid PRIMARY KEY,
  owner_subject text NOT NULL,
  task_id text NOT NULL,
  token_digest char(64) NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  expected_task_version bigint NOT NULL CHECK (expected_task_version >= 0),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_fencing_token bigint,
  FOREIGN KEY (owner_subject, task_id) REFERENCES infinitex_harness.tasks(owner_subject, task_id),
  CHECK ((consumed_at IS NULL AND consumed_fencing_token IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_fencing_token > 0))
);

CREATE TABLE infinitex_harness.operation_idempotency (
  owner_subject text NOT NULL,
  task_id text NOT NULL,
  operation text NOT NULL CHECK (length(operation) BETWEEN 1 AND 64),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  request_fingerprint char(64) NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
  response_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_subject, task_id, operation, idempotency_key),
  FOREIGN KEY (owner_subject, task_id) REFERENCES infinitex_harness.tasks(owner_subject, task_id)
);

CREATE TABLE infinitex_harness.task_events (
  owner_subject text NOT NULL,
  task_id text NOT NULL,
  event_seq bigint NOT NULL CHECK (event_seq > 0),
  task_version bigint NOT NULL CHECK (task_version > 0),
  fencing_token bigint NOT NULL CHECK (fencing_token >= 0),
  event_type text NOT NULL CHECK (event_type IN ('approved','claimed','lease_renewed','succeeded','failed','cancelled')),
  actor_subject text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_subject, task_id, event_seq),
  FOREIGN KEY (owner_subject, task_id) REFERENCES infinitex_harness.tasks(owner_subject, task_id)
);

CREATE FUNCTION infinitex_harness.reject_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'task events are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER task_events_are_append_only
BEFORE UPDATE OR DELETE ON infinitex_harness.task_events
FOR EACH ROW EXECUTE FUNCTION infinitex_harness.reject_event_mutation();
