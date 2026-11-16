-- Workspace-scoped RLS policies for the application runtime.
-- Apply after 0001_identity_workspace_foundation.sql and CI/runtime role provisioning.
-- Application transactions MUST set both context values with set_config(..., true).
BEGIN;

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users FORCE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_users_workspace_read ON app_users;
CREATE POLICY app_users_workspace_read ON app_users
  FOR SELECT
  USING (
    id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1
      FROM workspace_memberships AS membership
      WHERE membership.workspace_id =
        NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
        AND membership.user_id = app_users.id
        AND membership.status = 'active'
    )
  );

DROP POLICY IF EXISTS app_users_workspace_lock ON app_users;
CREATE POLICY app_users_workspace_lock ON app_users
  FOR UPDATE
  USING (
    id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1
      FROM workspace_memberships AS membership
      WHERE membership.workspace_id =
        NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
        AND membership.user_id = app_users.id
        AND membership.status = 'active'
    )
  )
  WITH CHECK (
    id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1
      FROM workspace_memberships AS membership
      WHERE membership.workspace_id =
        NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
        AND membership.user_id = app_users.id
        AND membership.status = 'active'
    )
  );

DROP POLICY IF EXISTS workspaces_current_workspace_read ON workspaces;
CREATE POLICY workspaces_current_workspace_read ON workspaces
  FOR SELECT
  USING (
    id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  );

DROP POLICY IF EXISTS workspaces_current_workspace_lock ON workspaces;
CREATE POLICY workspaces_current_workspace_lock ON workspaces
  FOR UPDATE
  USING (
    id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  )
  WITH CHECK (
    id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  );

DROP POLICY IF EXISTS memberships_current_workspace_access ON workspace_memberships;
CREATE POLICY memberships_current_workspace_access ON workspace_memberships
  FOR ALL
  USING (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  );

DROP POLICY IF EXISTS audit_events_current_actor_insert ON audit_events;
CREATE POLICY audit_events_current_actor_insert ON audit_events
  FOR INSERT
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND actor_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

COMMIT;
