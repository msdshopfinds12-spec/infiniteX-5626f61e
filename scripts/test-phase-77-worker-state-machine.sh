#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must target the disposable PostgreSQL service}"
: "${PGDATABASE:?PGDATABASE must target infinitex_rehearsal}"
: "${PGUSER:?PGUSER must be configured for the disposable database}"

if [[ "$PGDATABASE" != "infinitex_rehearsal" ]]; then
  echo "REFUSING: Phase 77 integration harness only runs against infinitex_rehearsal."
  exit 2
fi

OWNER="77777777-7777-4777-8777-777777777777"
WORKFLOW="77777777-8888-4888-8888-777777777777"
RUN="77777777-9999-4999-8999-777777777777"
STEP="77777777-aaaa-4aaa-8aaa-777777777777"

cleanup() {
  psql -X -v ON_ERROR_STOP=1 -qAt -c "DELETE FROM auth.users WHERE id = '$OWNER';" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, raw_user_meta_data)
VALUES ('$OWNER', '{"full_name":"Phase 77 synthetic worker integration"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflows(id, owner_id, name, status, trigger_type)
VALUES ('$WORKFLOW', '$OWNER', 'Phase 77 worker integration fixture', 'active', 'manual');

INSERT INTO public.workflow_steps(id, workflow_id, step_order, name, action_type, config, retry_limit, timeout_seconds)
VALUES ('$STEP', '$WORKFLOW', 1, 'Generation fencing fixture', 'pass_through', '{}'::jsonb, 1, 30);

INSERT INTO public.workflow_runs(id, workflow_id, owner_id, status, input, attempt)
VALUES ('$RUN', '$WORKFLOW', '$OWNER', 'queued', '{"phase":77}'::jsonb, 0);
SQL

CLAIM="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT id::text || ':' || attempt::text FROM private.simula_claim_workflow_runs_internal(1) WHERE id = '$RUN';")"
if [[ "$CLAIM" != "$RUN:1" ]]; then
  echo "FAIL: initial claim expected generation 1; got '$CLAIM'."
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO public.workflow_step_runs(run_id, step_id, owner_id, status, attempt, started_at)
VALUES ('$RUN', '$STEP', '$OWNER', 'running', 1, now());
SQL

# Simulate a later lease generation becoming authoritative. Old-generation
# terminal updates must affect zero rows; the current generation must succeed.
psql -X -v ON_ERROR_STOP=1 <<SQL
UPDATE public.workflow_runs
SET attempt = 2, started_at = now(), status = 'running'
WHERE id = '$RUN' AND attempt = 1;

UPDATE public.workflow_step_runs
SET attempt = 2, status = 'running', started_at = now(), finished_at = NULL
WHERE run_id = '$RUN' AND step_id = '$STEP' AND attempt = 1;
SQL

STALE_RUN_ROWS="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "UPDATE public.workflow_runs SET status = 'failed', error_message = 'stale-worker' WHERE id = '$RUN' AND attempt = 1 RETURNING id;")"
STALE_STEP_ROWS="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "UPDATE public.workflow_step_runs SET status = 'failed', error_message = 'stale-worker' WHERE run_id = '$RUN' AND step_id = '$STEP' AND attempt = 1 RETURNING id;")"
if [[ -n "$STALE_RUN_ROWS" || -n "$STALE_STEP_ROWS" ]]; then
  echo "FAIL: stale generation updated current run/step state."
  exit 1
fi

CURRENT_RUN_ROWS="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "UPDATE public.workflow_runs SET status = 'succeeded', output = '{\"generation\":2}'::jsonb, finished_at = now() WHERE id = '$RUN' AND attempt = 2 RETURNING id;")"
CURRENT_STEP_ROWS="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "UPDATE public.workflow_step_runs SET status = 'succeeded', output = '{\"generation\":2}'::jsonb, finished_at = now() WHERE run_id = '$RUN' AND step_id = '$STEP' AND attempt = 2 RETURNING id;")"
if [[ -z "$CURRENT_RUN_ROWS" || -z "$CURRENT_STEP_ROWS" ]]; then
  echo "FAIL: current generation could not commit terminal state."
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 <<SQL
DO \$verify\$
DECLARE
  v_run_status text;
  v_run_attempt integer;
  v_step_status text;
  v_step_attempt integer;
  v_step_count integer;
BEGIN
  SELECT status, attempt INTO v_run_status, v_run_attempt
  FROM public.workflow_runs WHERE id = '$RUN';
  SELECT status, attempt INTO v_step_status, v_step_attempt
  FROM public.workflow_step_runs WHERE run_id = '$RUN' AND step_id = '$STEP';
  SELECT count(*) INTO v_step_count
  FROM public.workflow_step_runs WHERE run_id = '$RUN' AND step_id = '$STEP';

  IF v_run_status <> 'succeeded' OR v_run_attempt <> 2 THEN
    RAISE EXCEPTION 'run generation invariant failed: status %, attempt %', v_run_status, v_run_attempt;
  END IF;
  IF v_step_status <> 'succeeded' OR v_step_attempt <> 2 OR v_step_count <> 1 THEN
    RAISE EXCEPTION 'step generation/identity invariant failed: status %, attempt %, rows %',
      v_step_status, v_step_attempt, v_step_count;
  END IF;
END
\$verify\$;
SQL

echo "PASS: stale run and step generations affected zero rows."
echo "PASS: current generation committed terminal state for exactly one step identity."
echo "PHASE 77 WORKER/POSTGRES STATE-MACHINE INTEGRATION: PASS (isolated Supabase PostgreSQL 17 only)."
