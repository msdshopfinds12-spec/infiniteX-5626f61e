-- Phase 103.1 — owner-scoped workflow lease claims.
-- REHEARSAL PATCH ONLY. Apply only after Phase 102.6 in the disposable CI database.
-- Authenticated workers must pass p_owner_id. Cron workers may pass NULL only
-- after the cron authentication boundary has succeeded.
BEGIN;

-- Remove the previous public facade before replacing its implementation
-- signature; this avoids ambiguous PostgREST overload resolution.
DROP FUNCTION IF EXISTS public.simula_claim_workflow_runs_lease_internal(integer, integer, uuid);
DROP FUNCTION IF EXISTS private.simula_claim_workflow_runs_lease_internal(integer, integer, uuid);

CREATE FUNCTION private.simula_claim_workflow_runs_lease_internal(
  p_limit integer DEFAULT 3,
  p_lease_seconds integer DEFAULT 90,
  p_run_id uuid DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, workflow_id uuid, owner_id uuid, input jsonb,
  attempt integer, lease_token uuid, lease_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 3), 5));
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 90), 900));
BEGIN
  -- Expired final-attempt runs are terminalized only inside the requested
  -- owner scope when p_owner_id is supplied.
  WITH expired_final AS (
    SELECT wr.id
    FROM public.workflow_runs AS wr
    WHERE wr.status = 'running'
      AND wr.lease_until IS NOT NULL
      AND wr.lease_until <= pg_catalog.clock_timestamp()
      AND wr.attempt >= 5
      AND (p_run_id IS NULL OR wr.id = p_run_id)
      AND (p_owner_id IS NULL OR wr.owner_id = p_owner_id)
    ORDER BY wr.lease_until ASC, wr.id ASC
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.workflow_runs AS wr
  SET status = 'failed',
      error_message = 'worker_lease_expired_max_attempts',
      finished_at = pg_catalog.clock_timestamp(),
      lease_token = NULL,
      lease_until = NULL
  FROM expired_final AS ef
  WHERE wr.id = ef.id
    AND wr.status = 'running'
    AND wr.lease_until <= pg_catalog.clock_timestamp()
    AND wr.attempt >= 5
    AND (p_owner_id IS NULL OR wr.owner_id = p_owner_id);

  RETURN QUERY
  WITH picked AS (
    SELECT wr.id
    FROM public.workflow_runs AS wr
    WHERE wr.attempt < 5
      AND (p_run_id IS NULL OR wr.id = p_run_id)
      AND (p_owner_id IS NULL OR wr.owner_id = p_owner_id)
      AND (
        wr.status = 'queued'
        OR (
          wr.status = 'running'
          AND wr.lease_token IS NOT NULL
          AND wr.lease_until IS NOT NULL
          AND wr.lease_until <= pg_catalog.clock_timestamp()
        )
      )
    ORDER BY
      CASE WHEN wr.status = 'running' THEN wr.lease_until ELSE wr.created_at END ASC,
      wr.created_at ASC,
      wr.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.workflow_runs AS wr
    SET status = 'running',
        started_at = pg_catalog.clock_timestamp(),
        finished_at = NULL,
        error_message = NULL,
        attempt = wr.attempt + 1,
        lease_token = pg_catalog.gen_random_uuid(),
        lease_until = pg_catalog.clock_timestamp()
          + pg_catalog.make_interval(secs => v_lease_seconds),
        heartbeat_at = pg_catalog.clock_timestamp()
    FROM picked
    WHERE wr.id = picked.id
      AND wr.attempt < 5
      AND (p_owner_id IS NULL OR wr.owner_id = p_owner_id)
      AND (
        wr.status = 'queued'
        OR (
          wr.status = 'running'
          AND wr.lease_token IS NOT NULL
          AND wr.lease_until <= pg_catalog.clock_timestamp()
        )
      )
    RETURNING wr.id, wr.workflow_id, wr.owner_id, wr.input, wr.attempt,
      wr.lease_token, wr.lease_until
  )
  SELECT c.id, c.workflow_id, c.owner_id, c.input, c.attempt,
    c.lease_token, c.lease_until
  FROM claimed AS c;
END;
$function$;

REVOKE ALL ON FUNCTION private.simula_claim_workflow_runs_lease_internal(integer, integer, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.simula_claim_workflow_runs_lease_internal(integer, integer, uuid, uuid)
  TO service_role;

CREATE FUNCTION public.simula_claim_workflow_runs_lease_internal(
  p_limit integer DEFAULT 3,
  p_lease_seconds integer DEFAULT 90,
  p_run_id uuid DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, workflow_id uuid, owner_id uuid, input jsonb,
  attempt integer, lease_token uuid, lease_until timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM private.simula_claim_workflow_runs_lease_internal(
    p_limit, p_lease_seconds, p_run_id, p_owner_id
  );
$function$;

REVOKE ALL ON FUNCTION public.simula_claim_workflow_runs_lease_internal(integer, integer, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simula_claim_workflow_runs_lease_internal(integer, integer, uuid, uuid)
  TO service_role;

COMMIT;
