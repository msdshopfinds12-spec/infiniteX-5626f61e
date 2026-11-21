-- PostgREST exposes the public schema, not private. Keep the implementation
-- private and publish only a least-privilege service-role RPC entry point.
BEGIN;

CREATE OR REPLACE FUNCTION public.simula_claim_workflow_runs_internal(
  p_limit integer DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  workflow_id uuid,
  owner_id uuid,
  input jsonb,
  attempt integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT claimed.id, claimed.workflow_id, claimed.owner_id, claimed.input, claimed.attempt
  FROM private.simula_claim_workflow_runs_internal(p_limit) AS claimed;
$function$;

REVOKE ALL ON FUNCTION public.simula_claim_workflow_runs_internal(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simula_claim_workflow_runs_internal(integer)
  TO service_role;

DO $privileges$
BEGIN
  IF NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.simula_claim_workflow_runs_internal(integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role_missing_cron_queue_claim_execute';
  END IF;
  IF pg_catalog.has_function_privilege(
    'anon',
    'public.simula_claim_workflow_runs_internal(integer)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.simula_claim_workflow_runs_internal(integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'untrusted_role_has_cron_queue_claim_execute';
  END IF;
END
$privileges$;

COMMENT ON FUNCTION public.simula_claim_workflow_runs_internal(integer) IS
  'PostgREST public-schema entry point for the private cross-owner queue claim; executable only by service_role.';

COMMIT;
