\set ON_ERROR_STOP on

-- Disposable-only setup. Run only after the Phase 77 migration rehearsal.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'phase81-local-only';
  ELSE
    ALTER ROLE authenticator WITH LOGIN NOINHERIT PASSWORD 'phase81-local-only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$roles$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public, private, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

-- PostgREST 12 publishes the JWT claims as request.jwt.claims. The legacy
-- disposable Phase 77 auth.uid fixture only reads request.jwt.claim.sub.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$function$;

GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;

GRANT SELECT ON public.workflows, public.workflow_steps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.workflow_runs,
  public.workflow_step_runs,
  public.workflow_logs
TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- The reconstructed workflow_logs fixture has no identity default. Supply a
-- disposable-only sequence so the worker's normal log inserts can be exercised.
CREATE SEQUENCE IF NOT EXISTS public.phase81_workflow_logs_id_seq;
ALTER TABLE public.workflow_logs
  ALTER COLUMN id SET DEFAULT nextval('public.phase81_workflow_logs_id_seq');
ALTER SEQUENCE public.phase81_workflow_logs_id_seq
  OWNED BY public.workflow_logs.id;
GRANT USAGE, SELECT ON SEQUENCE public.phase81_workflow_logs_id_seq TO service_role;

INSERT INTO auth.users(id, raw_user_meta_data)
VALUES
  ('81000000-0000-4000-8000-000000000001', '{"full_name":"Phase 81 synthetic owner A"}'::jsonb),
  ('81000000-0000-4000-8000-000000000002', '{"full_name":"Phase 81 synthetic owner B"}'::jsonb),
  ('81000000-0000-4000-8000-000000000003', '{"full_name":"Phase 103 isolated lease test owner"}'::jsonb),
  ('81000000-0000-4000-8000-000000000004', '{"full_name":"Phase 103 negative-scope test owner"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_projects(id, user_id, title, project_type, content)
VALUES
  ('82000000-4000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'Phase 82 tenant A project', 'general', '{"tenant":"A"}'::jsonb),
  ('82000000-4000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'Phase 82 tenant B project', 'general', '{"tenant":"B"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.platform_api_keys(owner_id, label, key_prefix, key_hash, scopes)
VALUES
  ('81000000-0000-4000-8000-000000000001', 'Phase 82 synthetic A', 'p82a', repeat('a', 64), ARRAY['api:read']::text[]),
  ('81000000-0000-4000-8000-000000000002', 'Phase 82 synthetic B', 'p82b', repeat('b', 64), ARRAY['api:read']::text[])
ON CONFLICT (key_hash) DO NOTHING;

INSERT INTO public.workflows(id, owner_id, name, status, trigger_type)
VALUES
  ('81000000-1000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'Phase 81 HTTP worker A', 'active', 'manual'),
  ('81000000-1000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'Phase 81 HTTP worker B', 'active', 'manual'),
  ('81000000-1000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000003', 'Phase 103 isolated lease tests', 'active', 'manual')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflow_steps(id, workflow_id, step_order, name, action_type, config, retry_limit, timeout_seconds)
VALUES
  ('81000000-2000-4000-8000-000000000001', '81000000-1000-4000-8000-000000000001', 1, 'Set integration marker', 'set_value', '{"key":"phase81","value":"http-postgrest"}'::jsonb, 0, 10),
  ('81000000-2000-4000-8000-000000000002', '81000000-1000-4000-8000-000000000001', 2, 'Set completion marker', 'set_value', '{"key":"verified","value":true}'::jsonb, 0, 10),
  ('81000000-2000-4000-8000-000000000003', '81000000-1000-4000-8000-000000000003', 1, 'Isolated lease test step', 'set_value', '{"key":"phase103","value":true}'::jsonb, 0, 10)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflow_runs(id, workflow_id, owner_id, status, input, attempt)
VALUES
  ('81000000-3000-4000-8000-000000000001', '81000000-1000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'queued', '{"seed":"phase81-primary"}'::jsonb, 0),
  ('81000000-3000-4000-8000-000000000003', '81000000-1000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'queued', '{"seed":"phase81-concurrent"}'::jsonb, 0),
  ('81000000-3000-4000-8000-000000000004', '81000000-1000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'queued', '{"seed":"phase81-inflight-fencing"}'::jsonb, 0),
  ('81000000-3000-4000-8000-000000000002', '81000000-1000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000002', 'queued', '{"seed":"tenant-b-must-not-be-claimed"}'::jsonb, 0)
ON CONFLICT (id) DO NOTHING;

-- Explicitly keep all integration fixtures inside the disposable database.
DO $guard$
BEGIN
  IF current_database() <> 'infinitex_rehearsal' THEN
    RAISE EXCEPTION 'Phase 81 fixture refused database %', current_database();
  END IF;
END
$guard$;
