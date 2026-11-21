-- Phase 102.4 review patch: strict outbox lease-expiry enforcement.
-- IMPORTANT:
--   * This is deliberately stored outside supabase/migrations/.
--   * It is NOT applied to any database by this commit.
--   * Rehearse against disposable PostgreSQL, generate a timestamped migration
--     with the Supabase CLI, run advisors, and obtain review before applying.
--
-- The row lock is acquired before checking clock_timestamp(). Unlike now(),
-- clock_timestamp() reflects wall-clock time after any lock wait. A matching
-- token alone is insufficient once the lease has expired.

BEGIN;

CREATE OR REPLACE FUNCTION public.simula_finish_workflow_outbox(
  p_id uuid,
  p_lock_token uuid,
  p_succeeded boolean,
  p_error text DEFAULT NULL
)
RETURNS TABLE (status text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row private.simula_workflow_outbox%ROWTYPE;
  v_status text;
  v_rows integer;
BEGIN
  IF p_id IS NULL OR p_lock_token IS NULL OR p_succeeded IS NULL THEN
    RAISE EXCEPTION 'outbox_completion_identity_required' USING ERRCODE = '22023';
  END IF;
  IF p_error IS NOT NULL AND pg_catalog.char_length(p_error) > 500 THEN
    RAISE EXCEPTION 'outbox_error_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM private.simula_workflow_outbox
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbox_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent replay of an already committed success remains safe: no lease
  -- is being consumed or state changed by this branch.
  IF v_row.status = 'succeeded' AND p_succeeded THEN
    RETURN QUERY SELECT 'succeeded'::text, true;
    RETURN;
  END IF;

  IF v_row.status <> 'processing' OR v_row.lock_token IS DISTINCT FROM p_lock_token THEN
    RAISE EXCEPTION 'outbox_lease_superseded' USING ERRCODE = '40001';
  END IF;

  -- Critical fence: evaluate only after FOR UPDATE has acquired the row lock.
  -- clock_timestamp() is intentional; transaction_timestamp()/now() may
  -- predate a lock wait and would incorrectly accept an expired lease.
  IF v_row.lease_until IS NULL
     OR v_row.lease_until <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'outbox_lease_expired' USING ERRCODE = '40001';
  END IF;

  IF p_succeeded THEN
    v_status := 'succeeded';
    UPDATE private.simula_workflow_outbox
    SET status = v_status, lock_token = NULL, lease_until = NULL,
        last_error = NULL, completed_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_id AND lock_token = p_lock_token
      AND lease_until > pg_catalog.clock_timestamp();
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'outbox_lease_expired' USING ERRCODE = '40001';
    END IF;
  ELSE
    v_status := CASE WHEN v_row.attempts >= 8 THEN 'dead' ELSE 'pending' END;
    UPDATE private.simula_workflow_outbox
    SET status = v_status, lock_token = NULL, lease_until = NULL,
        last_error = nullif(p_error, ''),
        available_at = CASE WHEN v_status = 'pending'
          THEN pg_catalog.clock_timestamp() + pg_catalog.make_interval(
            secs => least(3600, 5 * pg_catalog.power(
              2::numeric, greatest(v_row.attempts - 1, 0)
            )::integer
          ))
          ELSE available_at END,
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_id AND lock_token = p_lock_token
      AND lease_until > pg_catalog.clock_timestamp();
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'outbox_lease_expired' USING ERRCODE = '40001';
    END IF;
  END IF;

  RETURN QUERY SELECT v_status, false;
END;
$function$;

-- Preserve the existing service-role-only execution boundary.
REVOKE ALL ON FUNCTION public.simula_finish_workflow_outbox(uuid, uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.simula_finish_workflow_outbox(uuid, uuid, boolean, text)
  TO service_role;

COMMIT;
