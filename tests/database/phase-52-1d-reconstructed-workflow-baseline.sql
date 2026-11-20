-- PHASE 52.1D RECONSTRUCTED BASELINE — DISPOSABLE TEST FIXTURE ONLY.
--
-- This is NOT an original migration, pg_dump, canonical schema, or proof of live parity.
-- It reconstructs the five workflow tables from the historical metadata artifact:
-- docs/database/live-schema-metadata.snapshot.json
-- captured_at: 2026-11-20T02:07:20.142926+00:00
-- source artifact Git blob: f67a81de26ebf2ba9b3de0340663379bd550af82
--
-- Known post-baseline objects are deliberately omitted because recovered migrations add them:
-- * workflow_runs.scheduled_for + workflow_runs_workflow_scheduled_for_uidx (52.1C replay step 5)
-- * workflow_logs_run_id_idx and workflow_logs_workflow_id_idx (migration 20261025202536)
-- * workflow_step_runs_owner_id_idx and workflow_step_runs_step_id_idx (migration 20261025202536)
--
-- Execute only in the disposable PostgreSQL rehearsal, after recovered migrations 1–4.
BEGIN;

CREATE TABLE public.workflows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft'::text,
  trigger_type text NOT NULL DEFAULT 'manual'::text,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_run_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflows_pkey PRIMARY KEY (id),
  CONSTRAINT workflows_owner_id_fkey FOREIGN KEY (owner_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT workflows_status_check CHECK (
    status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text])
  ),
  CONSTRAINT workflows_trigger_type_check CHECK (
    trigger_type = ANY (ARRAY['manual'::text, 'schedule'::text, 'webhook'::text, 'event'::text])
  )
);

CREATE TABLE public.workflow_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  step_order integer NOT NULL,
  name text NOT NULL,
  action_type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_limit integer NOT NULL DEFAULT 3,
  timeout_seconds integer NOT NULL DEFAULT 60,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflow_steps_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id)
    REFERENCES public.workflows(id) ON DELETE CASCADE,
  CONSTRAINT workflow_steps_retry_limit_check CHECK (retry_limit >= 0 AND retry_limit <= 10),
  CONSTRAINT workflow_steps_step_order_check CHECK (step_order > 0),
  CONSTRAINT workflow_steps_timeout_seconds_check CHECK (timeout_seconds >= 1 AND timeout_seconds <= 3600),
  CONSTRAINT workflow_steps_workflow_id_step_order_key UNIQUE (workflow_id, step_order)
);

CREATE TABLE public.workflow_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued'::text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error_message text,
  attempt integer NOT NULL DEFAULT 0,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflow_runs_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_runs_attempt_check CHECK (attempt >= 0),
  CONSTRAINT workflow_runs_owner_id_fkey FOREIGN KEY (owner_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT workflow_runs_status_check CHECK (
    status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])
  ),
  CONSTRAINT workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id)
    REFERENCES public.workflows(id) ON DELETE CASCADE
);

CREATE TABLE public.workflow_step_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  step_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued'::text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error_message text,
  attempt integer NOT NULL DEFAULT 0,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflow_step_runs_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_step_runs_attempt_check CHECK (attempt >= 0),
  CONSTRAINT workflow_step_runs_owner_id_fkey FOREIGN KEY (owner_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT workflow_step_runs_run_id_fkey FOREIGN KEY (run_id)
    REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  CONSTRAINT workflow_step_runs_run_id_step_id_key UNIQUE (run_id, step_id),
  CONSTRAINT workflow_step_runs_status_check CHECK (
    status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text])
  ),
  CONSTRAINT workflow_step_runs_step_id_fkey FOREIGN KEY (step_id)
    REFERENCES public.workflow_steps(id) ON DELETE CASCADE
);

CREATE TABLE public.workflow_logs (
  id bigint NOT NULL,
  workflow_id uuid,
  run_id uuid,
  owner_id uuid NOT NULL,
  level text NOT NULL DEFAULT 'info'::text,
  event text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT workflow_logs_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_logs_level_check CHECK (
    level = ANY (ARRAY['debug'::text, 'info'::text, 'warning'::text, 'error'::text])
  ),
  CONSTRAINT workflow_logs_owner_id_fkey FOREIGN KEY (owner_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT workflow_logs_run_id_fkey FOREIGN KEY (run_id)
    REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  CONSTRAINT workflow_logs_workflow_id_fkey FOREIGN KEY (workflow_id)
    REFERENCES public.workflows(id) ON DELETE SET NULL
);

CREATE INDEX workflows_owner_idx ON public.workflows USING btree (owner_id);
CREATE INDEX workflows_schedule_idx ON public.workflows USING btree (next_run_at)
  WHERE ((status = 'active'::text) AND (trigger_type = 'schedule'::text));
CREATE INDEX workflow_steps_order_idx ON public.workflow_steps USING btree (workflow_id, step_order);
CREATE INDEX workflow_runs_owner_created_idx ON public.workflow_runs USING btree (owner_id, created_at DESC);
CREATE INDEX workflow_runs_queue_idx ON public.workflow_runs USING btree (created_at)
  WHERE (status = 'queued'::text);
CREATE INDEX workflow_step_runs_run_idx ON public.workflow_step_runs USING btree (run_id, created_at);
CREATE INDEX workflow_logs_owner_created_idx ON public.workflow_logs USING btree (owner_id, created_at DESC);

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_step_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage workflows"
ON public.workflows FOR ALL TO authenticated
USING (owner_id = (SELECT auth.uid() AS uid))
WITH CHECK (owner_id = (SELECT auth.uid() AS uid));

CREATE POLICY "Owners manage workflow steps"
ON public.workflow_steps FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.workflows AS w
  WHERE w.id = workflow_steps.workflow_id
    AND w.owner_id = (SELECT auth.uid() AS uid)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.workflows AS w
  WHERE w.id = workflow_steps.workflow_id
    AND w.owner_id = (SELECT auth.uid() AS uid)
));

CREATE POLICY "Owners create workflow runs"
ON public.workflow_runs FOR INSERT TO authenticated
WITH CHECK (
  owner_id = (SELECT auth.uid() AS uid)
  AND EXISTS (
    SELECT 1 FROM public.workflows AS w
    WHERE w.id = workflow_runs.workflow_id
      AND w.owner_id = (SELECT auth.uid() AS uid)
  )
);

CREATE POLICY "Owners view workflow runs"
ON public.workflow_runs FOR SELECT TO authenticated
USING (owner_id = (SELECT auth.uid() AS uid));

CREATE POLICY "Owners view step runs"
ON public.workflow_step_runs FOR SELECT TO authenticated
USING (owner_id = (SELECT auth.uid() AS uid));

CREATE POLICY "Owners view workflow logs"
ON public.workflow_logs FOR SELECT TO authenticated
USING (owner_id = (SELECT auth.uid() AS uid));

COMMIT;
