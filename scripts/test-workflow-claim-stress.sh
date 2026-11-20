#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must target the disposable PostgreSQL service}"
: "${PGDATABASE:?PGDATABASE must target infinitex_rehearsal}"
: "${PGUSER:?PGUSER must be configured for the disposable database}"

if [[ "$PGDATABASE" != "infinitex_rehearsal" ]]; then
  echo "REFUSING: stress harness only runs against infinitex_rehearsal."
  exit 2
fi

OWNER="69696969-6969-4969-8969-696969696969"
WORKFLOW="79797979-7979-4979-8979-797979797979"
STEP="89898989-8989-4989-8989-898989898989"
TOTAL_RUNS=80
CLAIMERS=16
BATCH_SIZE=5
TMP_DIR="$(mktemp -d)"

cleanup() {
  psql -X -v ON_ERROR_STOP=1 -qAt -c "DELETE FROM auth.users WHERE id = '$OWNER';" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

psql -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO auth.users(id, raw_user_meta_data)
VALUES ('$OWNER', '{"full_name":"Synthetic parallel claim stress"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflows(id, owner_id, name, status, trigger_type)
VALUES ('$WORKFLOW', '$OWNER', 'Synthetic parallel claim stress', 'active', 'manual');

INSERT INTO public.workflow_runs(id, workflow_id, owner_id, status, input, attempt, created_at)
SELECT
  md5('infinitex-phase69-run-' || g)::uuid,
  '$WORKFLOW',
  '$OWNER',
  'queued',
  jsonb_build_object('fixture', 'phase69', 'ordinal', g),
  0,
  now() + (g * interval '1 millisecond')
FROM generate_series(1, $TOTAL_RUNS) AS g;

INSERT INTO public.workflow_steps(id, workflow_id, step_order, name, action_type, config, retry_limit, timeout_seconds)
VALUES ('$STEP', '$WORKFLOW', 1, 'Parallel claim stress fixture', 'pass_through', '{}'::jsonb, 0, 30);
SQL

# Launch 16 independent PostgreSQL sessions. Each session claims at most five rows.
# The combined result must contain every seeded run exactly once, with generation 1.
pids=()
for worker in $(seq 1 "$CLAIMERS"); do
  (
    psql -X -qAt -v ON_ERROR_STOP=1 \
      -c "SET ROLE service_role; SELECT id::text || ':' || attempt::text FROM private.simula_claim_workflow_runs_internal($BATCH_SIZE);" \
      > "$TMP_DIR/claim-$worker.txt"
  ) &
  pids+=("$!")
done

for pid in "${pids[@]}"; do
  wait "$pid"
done

cat "$TMP_DIR"/claim-*.txt > "$TMP_DIR/all-claims.txt"
TOTAL_CLAIMS="$(wc -l < "$TMP_DIR/all-claims.txt" | tr -d ' ')"
UNIQUE_CLAIMS="$(cut -d: -f1 "$TMP_DIR/all-claims.txt" | sort -u | wc -l | tr -d ' ')"
BAD_GENERATIONS="$(awk -F: '$2 != 1 { count++ } END { print count+0 }' "$TMP_DIR/all-claims.txt")"
DUPLICATES="$(cut -d: -f1 "$TMP_DIR/all-claims.txt" | sort | uniq -d | wc -l | tr -d ' ')"

if [[ "$TOTAL_CLAIMS" != "$TOTAL_RUNS" || "$UNIQUE_CLAIMS" != "$TOTAL_RUNS" || "$DUPLICATES" != "0" || "$BAD_GENERATIONS" != "0" ]]; then
  echo "FAIL: parallel claim invariant violated."
  echo "expected=$TOTAL_RUNS total=$TOTAL_CLAIMS unique=$UNIQUE_CLAIMS duplicates=$DUPLICATES bad_generations=$BAD_GENERATIONS"
  sort "$TMP_DIR/all-claims.txt"
  exit 1
fi

REMAINING_QUEUED="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.workflow_runs WHERE workflow_id = '$WORKFLOW' AND status = 'queued';")"
if [[ "$REMAINING_QUEUED" != "0" ]]; then
  echo "FAIL: $REMAINING_QUEUED seeded runs remain queued after all claimers completed."
  exit 1
fi

echo "PASS: $CLAIMERS parallel PostgreSQL sessions claimed $TOTAL_RUNS distinct runs exactly once."
echo "PASS: every claimed run advanced from attempt 0 to attempt 1; no seeded run remains queued."

# Race two independent INSERT sessions against the unique (run_id, step_id) key.
# ON CONFLICT is expected to serialize the winner while leaving exactly one row.
TARGET_RUN="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT id FROM public.workflow_runs WHERE workflow_id = '$WORKFLOW' ORDER BY id LIMIT 1;")"
if [[ -z "$TARGET_RUN" ]]; then
  echo "FAIL: no claimed run available for duplicate-insert race."
  exit 1
fi

insert_sql="INSERT INTO public.workflow_step_runs(run_id, step_id, owner_id, status, attempt) VALUES ('$TARGET_RUN', '$STEP', '$OWNER', 'running', 1) ON CONFLICT (run_id, step_id) DO NOTHING;"
psql -X -qAt -v ON_ERROR_STOP=1 -c "$insert_sql" > "$TMP_DIR/insert-a.txt" &
INSERT_A=$!
psql -X -qAt -v ON_ERROR_STOP=1 -c "$insert_sql" > "$TMP_DIR/insert-b.txt" &
INSERT_B=$!
wait "$INSERT_A"
wait "$INSERT_B"

STEP_ROWS="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM public.workflow_step_runs WHERE run_id = '$TARGET_RUN' AND step_id = '$STEP';")"
if [[ "$STEP_ROWS" != "1" ]]; then
  echo "FAIL: simultaneous duplicate insert produced $STEP_ROWS rows; expected exactly one."
  exit 1
fi

echo "PASS: simultaneous duplicate step-run inserts preserved the unique (run_id, step_id) invariant."
echo "PHASE 69 PARALLEL CLAIM + DUPLICATE INSERT STRESS: PASS (isolated PostgreSQL 17 only)."
