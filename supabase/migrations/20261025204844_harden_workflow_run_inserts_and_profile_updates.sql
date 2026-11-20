CREATE OR REPLACE FUNCTION private.enforce_workflow_run_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();

  -- Apply client-facing protections only to authenticated user requests.
  -- Trusted service-role workers have no end-user auth.uid() and update runs,
  -- rather than inserting new client-owned runs.
  IF v_uid IS NOT NULL THEN
    IF NEW.owner_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'workflow_run_owner_mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.workflows AS w
      WHERE w.id = NEW.workflow_id
        AND w.owner_id = v_uid
    ) THEN
      RAISE EXCEPTION 'workflow_not_owned_by_user' USING ERRCODE = '42501';
    END IF;

    -- The client may provide input and workflow_id, but cannot forge
    -- worker-managed execution state on initial insert.
    NEW.status := 'queued';
    NEW.attempt := 0;
    NEW.output := NULL;
    NEW.error_message := NULL;
    NEW.started_at := NULL;
    NEW.finished_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_workflow_run_insert_defaults
  ON public.workflow_runs;

CREATE TRIGGER enforce_workflow_run_insert_defaults
BEFORE INSERT ON public.workflow_runs
FOR EACH ROW
EXECUTE FUNCTION private.enforce_workflow_run_insert_defaults();

-- Allow users to edit only their own profile's presentation fields.
-- RLS policy profiles_update_own remains responsible for row ownership.
GRANT UPDATE (display_name, avatar_url)
ON TABLE public.profiles
TO authenticated;