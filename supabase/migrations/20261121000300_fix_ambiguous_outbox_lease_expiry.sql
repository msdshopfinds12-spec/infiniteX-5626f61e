-- Phase 87.4: fix PL/pgSQL OUT-parameter ambiguity in outbox lease cleanup.
-- Forward-only correction. Preserve the existing RPC signature, state machine,
-- SECURITY DEFINER boundary, empty search_path, and service_role-only EXECUTE.
-- This migration is exercised by the Phase 81 disposable PostgreSQL/PostgREST
-- integration test; it must never be replayed manually against production.

BEGIN;

CREATE OR REPLACE FUNCTION public.simula_claim_workflow_outbox(p_limit integer DEFAULT 10)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  workflow_id uuid,
  run_id uuid,
  step_id uuid,
  event_type text,
  idempotency_key text,
  payload jsonb,
  attempts integer,
  lock_token uuid,
  lease_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 25));
BEGIN
  -- lease_until is also a RETURNS TABLE OUT parameter. Qualify every source
  -- column in this UPDATE to prevent PL/pgSQL variable/column ambiguity.
  UPDATE private.simula_workflow_outbox AS o
  SET status = 'dead',
      lock_token = NULL,
      lease_until = NULL,
      last_error = coalesce(o.last_error, 'outbox_lease_expired_max_attempts'),
      updated_at = pg_catalog.now()
  WHERE o.status = 'processing'
    AND o.lease_until < pg_catalog.now()
    AND o.attempts >= 8;

  RETURN QUERY
  WITH picked AS (
    SELECT o.id
    FROM private.simula_workflow_outbox AS o
    WHERE (
      (o.status = 'pending' AND o.available_at <= pg_catalog.now())
      OR
      (o.status = 'processing' AND o.lease_until < pg_catalog.now() AND o.attempts < 8)
    )
    ORDER BY o.available_at ASC, o.created_at ASC, o.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE private.simula_workflow_outbox AS o
    SET status = 'processing',
        attempts = o.attempts + 1,
        lock_token = pg_catalog.gen_random_uuid(),
        lease_until = pg_catalog.now() + interval '60 seconds',
        updated_at = pg_catalog.now()
    FROM picked
    WHERE o.id = picked.id
    RETURNING o.id, o.owner_id, o.workflow_id, o.run_id, o.step_id,
      o.event_type, o.idempotency_key, o.payload, o.attempts,
      o.lock_token, o.lease_until
  )
  SELECT * FROM claimed;
END;
$function$;

REVOKE ALL ON FUNCTION public.simula_claim_workflow_outbox(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simula_claim_workflow_outbox(integer)
  TO service_role;

COMMIT;
