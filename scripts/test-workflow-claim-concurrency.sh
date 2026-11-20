#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must target the disposable PostgreSQL service}"
: "${PGDATABASE:?PGDATABASE must target infinitex_rehearsal}"
: "${PGUSER:?PGUSER must be configured for the disposable database}"

if [[ "$PGDATABASE" != "infinitex_rehearsal" ]]; then
  echo "REFUSING: concurrency harness only runs against infinitex_rehearsal."
  exit 2
fi

RUN_A="aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa"
RUN_B="bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb"
OWNER="cccccccc-3333-4333-8333-cccccccccccc"
WORKFLOW="dddddddd-4444-4444-8444-dddddddddddd"
STEP="eeeeeeee-5555-4555-8555-eeeeeeeeeeee"
LOCK_LOG="$(mktemp)"
LOCK_PID=""

cleanup() {
  if [[ -n "$LOCK_PID" ]]; then
    kill "$LOCK_PID" >/dev/null 2>&1 || true
    wait "$LOCK_PID" >/dev/null 2>&1 || true
  fi
  psql -X -v ON_ERROR_STOP=1 -qAt -c "DELETE FROM auth.users WHERE id = '$OWNER';" >/dev/null 2>&1 || true
  rm -f "$LOCK_LOG"
}
trap cleanup EXIT

psql -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, raw_user_meta_data)
VALUES ('$OWNER', '{"full_name":"Synthetic concurrency test"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflows(id, owner_id, name, status, trigger_type)
VALUES ('$WORKFLOW', '$OWNER', 'Synthetic concurrency fixture', 'active', 'manual');

INSERT INTO public.workflow_runs(id, workflow_id, owner_id, status, input, attempt, created_at)
VALUES
  ('$RUN_A', '$WORKFLOW', '$OWNER', 'queued', '{"fixture":"A"}'::jsonb, 0, '2026-01-01T00:00:00Z'),
  ('$RUN_B', '$WORKFLOW', '$OWNER', 'queued', '{"fixture":"B"}'::jsonb, 0, '2026-01-01T00:00:01Z');
SQL

# Hold the oldest queue row in one real PostgreSQL session. A second session must
# skip that locked row and claim the next eligible row instead of blocking/duplicating.
psql -X -v ON_ERROR_STOP=1 -qAt -c "BEGIN; SELECT id FROM public.workflow_runs WHERE id = '$RUN_A' FOR UPDATE; SELECT 'LOCK_HELD'; SELECT pg_sleep(3); COMMIT;" >"$LOCK_LOG" 2>&1 &
LOCK_PID=$!

for attempt in $(seq 1 50); do
  if grep -q "LOCK_HELD" "$LOCK_LOG"; then break; fi
  sleep 0.1
done
if ! grep -q "LOCK_HELD" "$LOCK_LOG"; then
  echo "FAIL: lock-holder session did not acquire the expected row lock."
  cat "$LOCK_LOG"
  exit 1
fi

CLAIM_ONE="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT id::text || ':' || attempt::text FROM private.simula_claim_workflow_runs_internal(1);")"
wait "$LOCK_PID"
LOCK_PID=""

if [[ "$CLAIM_ONE" != "$RUN_B:1" ]]; then
  echo "FAIL: first concurrent claimant should skip locked RUN_A and claim RUN_B:1; got '$CLAIM_ONE'."
  exit 1
fi

CLAIM_TWO="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT id::text || ':' || attempt::text FROM private.simula_claim_workflow_runs_internal(1);")"
if [[ "$CLAIM_TWO" != "$RUN_A:1" ]]; then
  echo "FAIL: second claimant should claim released RUN_A exactly once; got '$CLAIM_TWO'."
  exit 1
fi

echo "PASS: concurrent claimers used SKIP LOCKED and returned distinct run generations."

# Exercise stale-lease recovery and the bounded maximum-attempt terminal state.
psql -X -v ON_ERROR_STOP=1 <<SQL
UPDATE public.workflow_runs
SET started_at = now() - interval '16 minutes'
WHERE id = '$RUN_A';

UPDATE public.workflow_runs
SET attempt = 5, started_at = now() - interval '16 minutes'
WHERE id = '$RUN_B';
SQL

CLAIM_RECOVERED="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SET ROLE service_role; SELECT id::text || ':' || attempt::text FROM private.simula_claim_workflow_runs_internal(5);")"
if [[ "$CLAIM_RECOVERED" != "$RUN_A:2" ]]; then
  echo "FAIL: stale RUN_A should be reclaimed at generation 2; got '$CLAIM_RECOVERED'."
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 <<SQL
DO \$verify\$
DECLARE
  v_status text;
  v_attempt integer;
BEGIN
  SELECT status, attempt INTO v_status, v_attempt
  FROM public.workflow_runs WHERE id = '$RUN_B';
  IF v_status <> 'failed' OR v_attempt <> 5 THEN
    RAISE EXCEPTION 'max-attempt stale run was not terminally failed: status %, attempt %', v_status, v_attempt;
  END IF;

  SELECT status, attempt INTO v_status, v_attempt
  FROM public.workflow_runs WHERE id = '$RUN_A';
  IF v_status <> 'running' OR v_attempt <> 2 THEN
    RAISE EXCEPTION 'stale lease was not reclaimed at a newer generation: status %, attempt %', v_status, v_attempt;
  END IF;
END
\$verify\$;

INSERT INTO public.workflow_steps(id, workflow_id, step_order, name, action_type, config, retry_limit, timeout_seconds)
VALUES ('$STEP', '$WORKFLOW', 1, 'Fencing fixture', 'pass_through', '{}'::jsonb, 2, 30);

INSERT INTO public.workflow_step_runs(id, run_id, step_id, owner_id, status, attempt)
VALUES ('ffffffff-6666-4666-8666-ffffffffffff', '$RUN_A', '$STEP', '$OWNER', 'running', 3);

INSERT INTO public.workflow_step_runs(run_id, step_id, owner_id, status, attempt)
VALUES ('$RUN_A', '$STEP', '$OWNER', 'running', 4)
ON CONFLICT (run_id, step_id) DO NOTHING;

DO \$fencing\$
DECLARE
  v_count integer;
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.workflow_step_runs
  WHERE run_id = '$RUN_A' AND step_id = '$STEP';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'unique (run_id, step_id) invariant failed; count %', v_count;
  END IF;

  UPDATE public.workflow_step_runs
  SET status = 'failed', error_message = 'stale-worker-must-not-win'
  WHERE run_id = '$RUN_A' AND step_id = '$STEP' AND attempt = 2;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'stale generation unexpectedly modified the step run';
  END IF;

  UPDATE public.workflow_step_runs
  SET status = 'succeeded', output = '{"winner":"generation-3"}'::jsonb, finished_at = now()
  WHERE run_id = '$RUN_A' AND step_id = '$STEP' AND attempt = 3;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'current generation failed to commit its terminal result';
  END IF;
END
\$fencing\$;
SQL

echo "PASS: stale leases recover below attempt 5; attempt 5 is terminal."
echo "PASS: duplicate step-run identity is constrained and stale generation cannot overwrite newer result."
echo "PHASE 67 DATABASE CONCURRENCY CONTRACT: PASS (isolated PostgreSQL 17 only)."
