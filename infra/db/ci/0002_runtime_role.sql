-- CI-only PostgreSQL runtime role. Never use this fixed credential outside disposable CI.
-- Execute as the disposable database administrator after migration 0001.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'infinite_x_app_runtime_ci') THEN
    CREATE ROLE infinite_x_app_runtime_ci
      LOGIN PASSWORD 'ci_runtime_only_password'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE infinite_x_app_runtime_ci
  WITH LOGIN PASSWORD 'ci_runtime_only_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM infinite_x_app_runtime_ci;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM infinite_x_app_runtime_ci;

GRANT CONNECT ON DATABASE infinite_x_ci TO infinite_x_app_runtime_ci;
GRANT USAGE ON SCHEMA public TO infinite_x_app_runtime_ci;

-- Read only the identity/workspace rows needed for authorization decisions.
GRANT SELECT ON TABLE app_users, workspaces, workspace_memberships
  TO infinite_x_app_runtime_ci;

-- Runtime may change membership state but cannot rewrite grant provenance.
GRANT UPDATE (role, status, updated_at) ON TABLE workspace_memberships
  TO infinite_x_app_runtime_ci;

-- Runtime may append audit records but cannot read, update, or delete them.
GRANT INSERT (actor_user_id, workspace_id, target_user_id, event_type, request_id, metadata)
  ON TABLE audit_events TO infinite_x_app_runtime_ci;

-- Explicitly deny migration/DDL capabilities.
REVOKE CREATE ON SCHEMA public FROM infinite_x_app_runtime_ci;
