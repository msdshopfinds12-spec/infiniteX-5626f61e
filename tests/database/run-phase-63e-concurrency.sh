#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must point to disposable PostgreSQL}"
: "${PGDATABASE:?PGDATABASE must be the dedicated Phase 63E database}"
: "${PGUSER:?PGUSER must be set}"

if [[ "$PGDATABASE" != "infinitex_phase63e" ]]; then
  echo "REFUSING: Phase 63E concurrency tests require infinitex_phase63e."
  exit 2
fi

TMP_DIR="$(mktemp -d)"
LOCK_PID=""
OTHER_PID=""
cleanup() {
  for pid in "$OTHER_PID" "$LOCK_PID"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

wait_for_lock_waiters() {
  local app_prefix="$1"
  local expected_count="$2"
  for _ in $(seq 1 60); do
    local waiting
    waiting="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
      "SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE '$app_prefix%' AND wait_event_type = 'Lock';")"
    if [[ "$waiting" -ge "$expected_count" ]]; then return 0; fi
    sleep 0.1
  done
  echo "FAIL: expected $expected_count session(s) matching $app_prefix to enter a PostgreSQL lock wait."
  return 1
}

# Hold the failed original row while two independent sessions attempt the same replay.
PGAPPNAME=phase63e-replay-lock-holder psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "BEGIN; SELECT id FROM phase63e.workflow_step_attempts WHERE id='replay-original' FOR UPDATE; SELECT pg_sleep(3); COMMIT;" \
  >"$TMP_DIR/replay-holder.out" 2>&1 &
LOCK_PID=$!

sleep 0.2
PGAPPNAME=phase63e-replay-contender-a psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SET statement_timeout='8s'; SELECT phase63e.fail_and_schedule_retry('replay-original','owner-replay',1,clock_timestamp(),'concurrent-unused-a');" \
  >"$TMP_DIR/replay-a.out" 2>"$TMP_DIR/replay-a.err" &
REPLAY_A_PID=$!
PGAPPNAME=phase63e-replay-contender-b psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SET statement_timeout='8s'; SELECT phase63e.fail_and_schedule_retry('replay-original','owner-replay',1,clock_timestamp(),'concurrent-unused-b');" \
  >"$TMP_DIR/replay-b.out" 2>"$TMP_DIR/replay-b.err" &
REPLAY_B_PID=$!

wait_for_lock_waiters "phase63e-replay-contender-" 2
wait "$LOCK_PID"
LOCK_PID=""
wait "$REPLAY_A_PID"
wait "$REPLAY_B_PID"

for replay_output in "$TMP_DIR/replay-a.out" "$TMP_DIR/replay-b.out"; do
  if [[ "$(tr -d '[:space:]' < "$replay_output")" != "already_scheduled:replay-next" ]]; then
    echo "FAIL: concurrent replay returned an unexpected result."
    cat "$TMP_DIR/replay-a.out" "$TMP_DIR/replay-a.err" "$TMP_DIR/replay-b.out" "$TMP_DIR/replay-b.err"
    exit 1
  fi
done
echo "PASS: two independent replay sessions waited on the original-attempt lock and resolved to the same next attempt."

# Race two workers to claim one queued attempt. Exactly one conditional UPDATE wins.
PGAPPNAME=phase63e-claim-a psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SELECT phase63e.claim_attempt('identity-queued',clock_timestamp(),interval '30 seconds');" \
  >"$TMP_DIR/claim-a.out" &
CLAIM_A_PID=$!
PGAPPNAME=phase63e-claim-b psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SELECT phase63e.claim_attempt('identity-queued',clock_timestamp(),interval '30 seconds');" \
  >"$TMP_DIR/claim-b.out" &
CLAIM_B_PID=$!
wait "$CLAIM_A_PID"
wait "$CLAIM_B_PID"

CLAIM_WINS="$(cat "$TMP_DIR/claim-a.out" "$TMP_DIR/claim-b.out" | grep -c '^t$' || true)"
CLAIM_LOSSES="$(cat "$TMP_DIR/claim-a.out" "$TMP_DIR/claim-b.out" | grep -c '^f$' || true)"
CLAIM_STATE="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT status || ':' || lease_generation::text FROM phase63e.workflow_step_attempts WHERE id='identity-queued';")"
if [[ "$CLAIM_WINS" != "1" || "$CLAIM_LOSSES" != "1" || "$CLAIM_STATE" != "running:1" ]]; then
  echo "FAIL: conditional claim race violated single-winner generation fencing."
  cat "$TMP_DIR/claim-a.out" "$TMP_DIR/claim-b.out"
  echo "state=$CLAIM_STATE wins=$CLAIM_WINS losses=$CLAIM_LOSSES"
  exit 1
fi
echo "PASS: two concurrent workers produced exactly one claim and one lease-generation increment."

# Hold the next-attempt row while a separate session attempts to mutate its identity.
PGAPPNAME=phase63e-identity-lock-holder psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "BEGIN; SELECT id FROM phase63e.workflow_step_attempts WHERE id='replay-next' FOR UPDATE; SELECT pg_sleep(3); COMMIT;" \
  >"$TMP_DIR/identity-holder.out" 2>&1 &
LOCK_PID=$!

sleep 0.2
set +e
PGAPPNAME=phase63e-identity-mutator psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SET statement_timeout='8s'; UPDATE phase63e.workflow_step_attempts SET idempotency_key='forged-concurrent-key' WHERE id='replay-next';" \
  >"$TMP_DIR/mutator.out" 2>"$TMP_DIR/mutator.err" &
OTHER_PID=$!
set -e

wait_for_lock_waiters "phase63e-identity-mutator" 1
wait "$LOCK_PID"
LOCK_PID=""
set +e
wait "$OTHER_PID"
mutator_status=$?
set -e
OTHER_PID=""

if [[ "$mutator_status" -eq 0 ]] || ! grep -q "attempt_identity_immutable" "$TMP_DIR/mutator.err"; then
  echo "FAIL: concurrent identity mutation was not rejected by the immutability trigger."
  cat "$TMP_DIR/mutator.out" "$TMP_DIR/mutator.err"
  exit 1
fi

stored_key="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT idempotency_key FROM phase63e.workflow_step_attempts WHERE id='replay-next';")"
if [[ "$stored_key" != "step-attempt:v1:run-replay:step-replay:2" ]]; then
  echo "FAIL: rejected concurrent identity mutation changed the stored key."
  exit 1
fi

echo "PASS: concurrent identity mutation waited for the row lock and was rejected without changing identity."
echo "phase-63e-two-session-concurrency-passed"
