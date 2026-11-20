#!/usr/bin/env bash
set -euo pipefail

: "${PG_CONTAINER_ID:?PG_CONTAINER_ID is required}"
: "${POSTGRES_USER:=infinitex_test}"
: "${POSTGRES_DB:=infinitex_test}"

psql_in_container() {
  docker exec -i "$PG_CONTAINER_ID" psql -X -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

psql_in_container < tests/postgres/phase-62-schema.sql
psql_in_container < tests/postgres/phase-62-assertions.sql

# Two independent PostgreSQL sessions race to claim the same queued row.
psql_in_container -c "INSERT INTO phase62.workflow_step_attempts(
  id, owner_id, run_id, step_id, attempt_number, idempotency_key,
  request_fingerprint, status, scheduled_at
) VALUES (
  'attempt-race', 'owner-race', 'run-race', 'step-race', 1,
  'step-attempt:v1:run-race:step-race:1', 'fingerprint-race',
  'queued', clock_timestamp() - interval '1 second'
);" >/dev/null

claim_sql="SELECT phase62.claim_attempt('attempt-race', clock_timestamp(), interval '30 seconds');"
psql_in_container -At -c "$claim_sql" > /tmp/phase62-claim-a.txt &
pid_a=$!
psql_in_container -At -c "$claim_sql" > /tmp/phase62-claim-b.txt &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

claims="$(cat /tmp/phase62-claim-a.txt /tmp/phase62-claim-b.txt | grep -c '^t$' || true)"
if [[ "$claims" != "1" ]]; then
  echo "Expected exactly one successful concurrent claim; got $claims" >&2
  cat /tmp/phase62-claim-a.txt /tmp/phase62-claim-b.txt >&2
  exit 1
fi

psql_in_container -c "DO \$\$
BEGIN
  IF (SELECT status FROM phase62.workflow_step_attempts WHERE id = 'attempt-race') <> 'running' THEN
    RAISE EXCEPTION 'concurrent claim did not leave one running attempt';
  END IF;
  IF (SELECT lease_generation FROM phase62.workflow_step_attempts WHERE id = 'attempt-race') <> 1 THEN
    RAISE EXCEPTION 'concurrent claim incremented lease generation more than once';
  END IF;
END;
\$\$;" >/dev/null

echo "phase-62-postgresql-contract-and-concurrency-tests-passed"
