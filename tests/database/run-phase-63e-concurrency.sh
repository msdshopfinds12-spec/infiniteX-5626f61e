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
    if [[ -n "$pid" ]]; then kill "$pid" >/dev/null 2>&1 || true; wait "$pid" >/dev/null 2>&1 || true; fi
  done
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

wait_for_lock_waiter() {
  local app_name="$1"
  for _ in $(seq 1 60); do
    local waiting
    waiting="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
      "SELECT count(*) FROM pg_stat_activity WHERE application_name = '$app_name' AND wait_event_type = 'Lock';")"
    if [[ "$waiting" -ge 1 ]]; then return 0; fi
    sleep 0.1
  done
  echo "FAIL: session $app_name never entered a PostgreSQL lock wait."
  return 1
}

# Two independent sessions replay the same failed attempt. The original-attempt
# row lock serializes the calls; both must return the same already-scheduled row.
PGAPPNAME=phase63e-replay-lock-holder psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "BEGIN; SELECT id FROM phase63e.workflow_step_attempts WHERE id='replay-original' FOR UPDATE; SELECT pg_sleep(3); COMMIT;" \
  >"$TMP_DIR/holder.out" 2>&1 &
LOCK_PID=$!

for _ in $(seq 1 60); do
  held="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
    "SELECT count(*) FROM pg_stat_activity WHERE application_name='phase63e-replay-lock-holder' AND state='active';")"
  [[ "$held" -ge 1 ]] && break
  sleep 0.1
done

PGAPPNAME=phase63e-replay-contender psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SET statement_timeout='8s'; SELECT phase63e.fail_and_schedule_retry('replay-original','owner-replay',1,clock_timestamp(),'concurrent-unused-id');" \
  >"$TMP_DIR/replay.out" 2>"$TMP_DIR/replay.err" &
OTHER_PID=$!

wait_for_lock_waiter phase63e-replay-contender
wait "$LOCK_PID"
LOCK_PID=""
wait "$OTHER_PID"
OTHER_PID=""

if [[ "$(tr -d '[:space:]' < "$TMP_DIR/replay.out")" != "already_scheduled:replay-next" ]]; then
  echo "FAIL: concurrent replay returned an unexpected result."
  cat "$TMP_DIR/replay.out" "$TMP_DIR/replay.err"
  exit 1
fi
echo "PASS: independent replay session waited on original-attempt row lock and replayed the same next attempt."

# A second session attempts to mutate a queued next-attempt identity while another
# transaction holds its row lock. It must wait, then be rejected by the trigger.
PGAPPNAME=phase63e-identity-lock-holder psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "BEGIN; SELECT id FROM phase63e.workflow_step_attempts WHERE id='replay-next' FOR UPDATE; SELECT pg_sleep(3); COMMIT;" \
  >"$TMP_DIR/identity-holder.out" 2>&1 &
LOCK_PID=$!

for _ in $(seq 1 60); do
  held="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
    "SELECT count(*) FROM pg_stat_activity WHERE application_name='phase63e-identity-lock-holder' AND state='active';")"
  [[ "$held" -ge 1 ]] && break
  sleep 0.1
done

set +e
PGAPPNAME=phase63e-identity-mutator psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SET statement_timeout='8s'; UPDATE phase63e.workflow_step_attempts SET idempotency_key='forged-concurrent-key' WHERE id='replay-next';" \
  >"$TMP_DIR/mutator.out" 2>"$TMP_DIR/mutator.err" &
OTHER_PID=$!
set -e

wait_for_lock_waiter phase63e-identity-mutator
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

if [[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT idempotency_key FROM phase63e.workflow_step_attempts WHERE id='replay-next';")" != "step-attempt:v1:run-replay:step-replay:2" ]]; then
  echo "FAIL: rejected concurrent identity mutation changed the stored key."
  exit 1
fi

echo "PASS: concurrent identity mutation waited for the row lock and was rejected without changing identity."
echo "phase-63e-two-session-concurrency-passed"
