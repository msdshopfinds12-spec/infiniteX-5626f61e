#!/usr/bin/env bash
set -euo pipefail
if [[ "${INFINITEX_TEST_DATABASE:-}" != "1" ]]; then
  echo "BLOCKED: set INFINITEX_TEST_DATABASE=1 to confirm a disposable test database." >&2; exit 2
fi
if [[ "${PGDATABASE:-}" != "infinitex_test" ]]; then
  echo "BLOCKED: PGDATABASE must be exactly infinitex_test." >&2; exit 2
fi
case "${PGHOST:-}" in
  postgres|localhost|127.0.0.1) ;;
  *) echo "BLOCKED: PGHOST must be postgres, localhost, or 127.0.0.1." >&2; exit 2 ;;
esac
command -v psql >/dev/null 2>&1 || { echo "psql client is required." >&2; exit 2; }
psql -X -v ON_ERROR_STOP=1 -f tests/postgres/bootstrap.sql
psql -X -v ON_ERROR_STOP=1 -f tests/postgres/contract.sql

psql -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
UPDATE infinitex_harness.tasks
SET status='running', task_version=task_version+1, event_seq=event_seq+1, fencing_token=fencing_token+1,
    lease_id='22222222-2222-4222-8222-222222222222', lease_worker='rollback-worker',
    lease_expires_at=clock_timestamp()+interval '30 seconds'
WHERE task_id='rollback-task' AND owner_subject='owner-a' AND status='approved';
INSERT INTO infinitex_harness.task_events
(owner_subject,task_id,event_seq,task_version,fencing_token,event_type,actor_subject)
SELECT owner_subject,task_id,event_seq,task_version,fencing_token,'claimed',lease_worker
FROM infinitex_harness.tasks WHERE task_id='rollback-task' AND status='running';
ROLLBACK;
SQL
rollback_state="$(psql -X -Atq -v ON_ERROR_STOP=1 -c "SELECT status||':'||task_version||':'||event_seq||':'||fencing_token FROM infinitex_harness.tasks WHERE task_id='rollback-task'")"
rollback_events="$(psql -X -Atq -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM infinitex_harness.task_events WHERE task_id='rollback-task'")"
[[ "$rollback_state" == "approved:1:1:0" ]] || { echo "Rollback state mismatch: $rollback_state" >&2; exit 1; }
[[ "$rollback_events" == "1" ]] || { echo "Rollback event count mismatch: $rollback_events" >&2; exit 1; }

race_sql() {
  local worker="$1"
  psql -X -Atq -v ON_ERROR_STOP=1 <<SQL
BEGIN;
WITH changed AS (
  UPDATE infinitex_harness.tasks
  SET status='running', task_version=task_version+1, event_seq=event_seq+1,
      fencing_token=fencing_token+1, lease_id=md5('$worker')::uuid, lease_worker='$worker',
      lease_expires_at=clock_timestamp()+interval '30 seconds', updated_at=clock_timestamp()
  WHERE owner_subject='owner-a' AND task_id='race-task' AND status='approved' AND task_version=1
  RETURNING owner_subject,task_id,event_seq,task_version,fencing_token,lease_worker
)
INSERT INTO infinitex_harness.task_events
(owner_subject,task_id,event_seq,task_version,fencing_token,event_type,actor_subject)
SELECT owner_subject,task_id,event_seq,task_version,fencing_token,'claimed',lease_worker
FROM changed RETURNING task_id;
SELECT pg_sleep(0.2);
COMMIT;
SQL
}
tmp_a="$(mktemp)"; tmp_b="$(mktemp)"
trap 'rm -f "$tmp_a" "$tmp_b"' EXIT
race_sql worker-a >"$tmp_a" & pid_a=$!
race_sql worker-b >"$tmp_b" & pid_b=$!
wait "$pid_a"; wait "$pid_b"
winners="$(cat "$tmp_a" "$tmp_b" | grep -c '^race-task$' || true)"
[[ "$winners" == "1" ]] || { echo "Expected exactly one race winner; observed $winners" >&2; cat "$tmp_a" "$tmp_b" >&2; exit 1; }
race_state="$(psql -X -Atq -v ON_ERROR_STOP=1 -c "SELECT status||':'||task_version||':'||event_seq||':'||fencing_token FROM infinitex_harness.tasks WHERE task_id='race-task'")"
race_events="$(psql -X -Atq -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM infinitex_harness.task_events WHERE task_id='race-task'")"
[[ "$race_state" == "running:2:1:1" ]] || { echo "Race state mismatch: $race_state" >&2; exit 1; }
[[ "$race_events" == "1" ]] || { echo "Race event count mismatch: $race_events" >&2; exit 1; }
echo "PostgreSQL 17 disposable contract smoke tests passed."
echo "Verified: schema constraints, idempotency uniqueness, append-only events, rollback, one-winner CAS race."
echo "Not verified: production RPCs, end-to-end driver, RLS, tenant-role isolation, or production wiring."
