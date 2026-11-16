-- Disposable PostgreSQL integration assertions for migration 0001.
-- Run only against an isolated CI database. Uses synthetic fixtures and rolls back.
BEGIN;

INSERT INTO app_users (id, status) VALUES
  ('10000000-0000-4000-8000-000000000001', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'active');

INSERT INTO identity_links (user_id, issuer, subject) VALUES
  ('10000000-0000-4000-8000-000000000001', 'https://issuer.example.test', 'synthetic-subject-001');

INSERT INTO workspaces (id, name, created_by) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Synthetic CI Workspace', '10000000-0000-4000-8000-000000000001');

INSERT INTO workspace_memberships (workspace_id, user_id, role, status, granted_by) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'owner', 'active', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'member', 'active', '10000000-0000-4000-8000-000000000001');

INSERT INTO audit_events
  (actor_user_id, workspace_id, target_user_id, event_type, request_id, metadata)
VALUES
  ('10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002',
   'ci.schema_probe', 'ci-schema-probe-001', '{"fixture":true}'::jsonb);

DO $$
BEGIN
  IF (SELECT count(*) FROM app_users) <> 2 THEN
    RAISE EXCEPTION 'app_users fixture count mismatch';
  END IF;
  IF (SELECT count(*) FROM identity_links) <> 1 THEN
    RAISE EXCEPTION 'identity_links fixture count mismatch';
  END IF;
  IF (SELECT count(*) FROM workspace_memberships WHERE status = 'active') <> 2 THEN
    RAISE EXCEPTION 'workspace membership fixture count mismatch';
  END IF;
  IF (SELECT count(*) FROM audit_events WHERE metadata @> '{"fixture":true}'::jsonb) <> 1 THEN
    RAISE EXCEPTION 'audit event JSONB fixture mismatch';
  END IF;

  BEGIN
    INSERT INTO identity_links (user_id, issuer, subject)
    VALUES ('10000000-0000-4000-8000-000000000002',
            'https://issuer.example.test', 'synthetic-subject-001');
    RAISE EXCEPTION 'duplicate issuer+subject unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO workspace_memberships (workspace_id, user_id, role, granted_by)
    VALUES ('20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000002', 'superuser',
            '10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'invalid membership role unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO workspace_memberships (workspace_id, user_id, role, granted_by)
    VALUES ('20000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000003', 'member',
            '10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'unknown user foreign key unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO audit_events (event_type, request_id, metadata)
    VALUES ('ci.invalid_metadata', 'ci-schema-probe-002', '[]'::jsonb);
    RAISE EXCEPTION 'non-object audit metadata unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

ROLLBACK;
