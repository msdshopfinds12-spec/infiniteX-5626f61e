-- Authenticated, idempotent workflow enqueue boundary.
-- The browser never supplies owner_id or worker-managed lifecycle fields.
CREATE OR REPLACE FUNCTION public.simula_enqueue_workflow_run(
  p_workflow_id uuid,
  p_request_id uuid,
  p_input jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid,
  status text,
  created_at timestamptz,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner uuid;
  v_existing public.workflow_runs%ROWTYPE;
  v_active_count integer;
BEGIN
  v_owner := auth.uid();
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  IF p_workflow_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'workflow_and_request_ids_required' USING ERRCODE = '22023';
  END IF;

  IF p_input IS NULL OR pg_catalog.jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION 'workflow_input_must_be_object' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.pg_column_size(p_input) > 16384 THEN
    RAISE EXCEPTION 'workflow_input_too_large' USING ERRCODE = '22001';
  END IF;

  -- Serialize each owner's queue-cap check without blocking other tenants.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner::text, 0)
  );

  -- Idempotent replay is resolved before queue limits, so a retry never
  -- creates a second run and can still retrieve the original result.
  SELECT *
    INTO v_existing
  FROM public.workflow_runs
  WHERE workflow_runs.id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.owner_id IS DISTINCT FROM v_owner
       OR v_existing.workflow_id IS DISTINCT FROM p_workflow_id
       OR v_existing.input IS DISTINCT FROM p_input THEN
      RAISE EXCEPTION 'request_id_conflict' USING ERRCODE = '23505';
    END IF;

    RETURN QUERY
    SELECT v_existing.id, v_existing.status, v_existing.created_at, true;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workflows AS w
    WHERE w.id = p_workflow_id
      AND w.owner_id = v_owner
      AND w.status = 'active'
  ) THEN
    RAISE EXCEPTION 'workflow_not_found_or_inactive' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_active_count
  FROM public.workflow_runs AS wr
  WHERE wr.owner_id = v_owner
    AND wr.status IN ('queued', 'running');

  IF v_active_count >= 10 THEN
    RAISE EXCEPTION 'workflow_queue_limit_reached' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.workflow_runs (
    id,
    workflow_id,
    owner_id,
    input,
    status,
    attempt,
    output,
    error_message,
    started_at,
    finished_at
  )
  VALUES (
    p_request_id,
    p_workflow_id,
    v_owner,
    p_input,
    'queued',
    0,
    NULL,
    NULL,
    NULL,
    NULL
  );

  RETURN QUERY
  SELECT wr.id, wr.status, wr.created_at, false
  FROM public.workflow_runs AS wr
  WHERE wr.id = p_request_id
    AND wr.owner_id = v_owner;
END;
$function$;

REVOKE ALL ON FUNCTION public.simula_enqueue_workflow_run(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.simula_enqueue_workflow_run(uuid, uuid, jsonb) TO authenticated;
