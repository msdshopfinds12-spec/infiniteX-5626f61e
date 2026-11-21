-- Phase 91: explicitly model dry-run simulation as a non-delivery terminal state.
-- Candidate migration only. CI/disposable PostgreSQL verification is required;
-- this file must not be manually applied to production.

BEGIN;

ALTER TABLE private.simula_workflow_outbox
  DROP CONSTRAINT IF EXISTS simula_workflow_outbox_status_check;

ALTER TABLE private.simula_workflow_outbox
  ADD CONSTRAINT simula_workflow_outbox_status_check
  CHECK (status IN ('pending', 'processing', 'succeeded', 'dead', 'simulated'));

ALTER TABLE private.simula_workflow_outbox
  ADD COLUMN IF NOT EXISTS simulated_at timestamptz,
  ADD COLUMN IF NOT EXISTS simulation_result jsonb;

ALTER TABLE private.simula_workflow_outbox
  ADD CONSTRAINT simula_workflow_outbox_simulation_consistency
  CHECK (
    (status = 'simulated' AND simulated_at IS NOT NULL AND simulation_result IS NOT NULL)
    OR
    (status <> 'simulated' AND simulated_at IS NULL AND simulation_result IS NULL)
  );

CREATE OR REPLACE FUNCTION public.simula_record_workflow_outbox_simulation(
  p_id uuid,
  p_lock_token uuid,
  p_result jsonb
)
RETURNS TABLE (status text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row private.simula_workflow_outbox%ROWTYPE;
BEGIN
  IF p_id IS NULL OR p_lock_token IS NULL THEN
    RAISE EXCEPTION 'outbox_simulation_identity_required' USING ERRCODE = '22023';
  END IF;
  IF p_result IS NULL
     OR pg_catalog.jsonb_typeof(p_result) <> 'object'
     OR pg_catalog.pg_column_size(p_result) > 8192 THEN
    RAISE EXCEPTION 'outbox_simulation_result_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM private.simula_workflow_outbox AS o
  WHERE o.id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbox_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'simulated' THEN
    IF v_row.simulation_result IS DISTINCT FROM p_result THEN
      RAISE EXCEPTION 'outbox_simulation_replay_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT 'simulated'::text, true;
    RETURN;
  END IF;

  IF v_row.status <> 'processing'
     OR v_row.lock_token IS DISTINCT FROM p_lock_token
     OR v_row.lease_until IS NULL
     OR v_row.lease_until <= pg_catalog.now() THEN
    RAISE EXCEPTION 'outbox_lease_superseded' USING ERRCODE = '40001';
  END IF;

  UPDATE private.simula_workflow_outbox AS o
  SET status = 'simulated',
      lock_token = NULL,
      lease_until = NULL,
      simulation_result = p_result,
      simulated_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE o.id = p_id
    AND o.status = 'processing'
    AND o.lock_token = p_lock_token;

  RETURN QUERY SELECT 'simulated'::text, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.simula_record_workflow_outbox_simulation(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simula_record_workflow_outbox_simulation(uuid, uuid, jsonb)
  TO service_role;

COMMIT;
