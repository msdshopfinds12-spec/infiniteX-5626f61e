-- Review before applying. This migration is NOT run by CI or deployment.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 1 AND 500),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject),
  UNIQUE (tenant_id, id)
);
CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  created_by uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id uuid,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 160),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  created_by uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES agents(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, id)
);
CREATE TABLE ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  issuer text NOT NULL,
  subject text NOT NULL,
  model text NOT NULL,
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  total_tokens integer CHECK (total_tokens IS NULL OR total_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 120),
  resource_type text,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX app_users_tenant_idx ON app_users(tenant_id);
CREATE INDEX agents_tenant_status_idx ON agents(tenant_id,status);
CREATE INDEX tasks_tenant_status_created_idx ON tasks(tenant_id,status,created_at DESC);
CREATE INDEX ai_usage_tenant_created_idx ON ai_usage(tenant_id,created_at DESC);
CREATE INDEX audit_events_tenant_created_idx ON audit_events(tenant_id,created_at DESC);
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY agents_tenant_isolation ON agents
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tasks_tenant_isolation ON tasks
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY ai_usage_tenant_isolation ON ai_usage
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY audit_events_tenant_isolation ON audit_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
COMMIT;