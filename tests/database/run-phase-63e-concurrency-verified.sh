#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must point to disposable PostgreSQL}"
: "${PGDATABASE:?PGDATABASE must be the dedicated Phase 63E database}"
: "${PGUSER:?PGUSER must be set}"
[[ "$PGDATABASE" == "infinitex_phase63e" ]] || { echo "REFUSING: wrong database"; exit 2; }

tmp="$(mktemp -d)"
holder=""
mutator=""
cleanup() {
  for pid in "$mutator" "$holder"; do
    if [[ -n "$pid" ]]; then kill "$pid" >/dev/null 2>&1 || true; wait "$pid" >/dev/null 2>&1 || true; fi
  done
  rm -rf "$tmp"
}
trap cleanup EXIT

wait_for_waiters() {
  local prefix="$1" count="$2" observed
  for _ in $(seq 1 60); do
    observed="$(psql -X -qAt -v ON_ERROR_STOP=1 -c \
      "SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE '$prefix%' AND wait_event_type='Lock';")"
    [[ "$observed" -ge "$count" ]] && return 0
    sleep 0.1
  done
  echo "FAIL: PostgreSQL lock wait not observed for $prefix"
  return 1
}

# Hold the original attempt while two retry-replay sessions queue behind it.
PGAPPNAME=phase63e-replay-holder psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "BEGIN; SELECT id FROM phase63e.workflow_step_attempts WHERE id='replay-original' FOR UPDATE; SELECT pg_sleep(3); COMMIT;" \
  >"$tmp/replay-holder.out" 2>&1 &
holder=$!
sleep 0.2

PGAPPNAME=phase63e-replay-a psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SET statement_timeout='8s'; SELECT phase63e.fail_and_schedule_retry('replay-original','owner-replay',1,clock_timestamp(),'unused-a');" \
  >"$tmp/replay-a.out" 2>"$tmp/replay-a.err" &
replay_a=$!
PGAPPNAME=phase63e-replay-b psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SET statement_timeout='8s'; SELECT phase63e.fail_and_schedule_retry('replay-original','owner-replay',1,clock_timestamp(),'unused-b');" \
  >"$tmp/replay-b.out" 2>"$tmp/replay-b.err" &
replay_b=$!

wait_for_waiters phase63e-replay- 2
wait "$holder"
holder=""
wait "$replay_a"
wait "$replay_b"
for file in "$tmp/replay-a.out" "$tmp/replay-b.out"; do
  [[ "$(tr -d '[:space:]' < "$file")" == "already_scheduled:replay-next" ]] || {
    cat "$tmp/replay-a.out" "$tmp/replay-a.err" "$tmp/replay-b.out" "$tmp/replay-b.err"
    echo "FAIL: concurrent retry replay did not resolve to the same next attempt"
    exit 1
  }
done
echo "PASS: concurrent retry replay serialized on the original-attempt row."

# Two workers race to claim the same queued attempt; one wins and generation increments once.
PGAPPNAME=phase63e-claim-a psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SELECT phase63e.claim_attempt('identity-queued',clock_timestamp(),interval '30 seconds');" >"$tmp/claim-a.out" &
claim_a=$!
PGAPPNAME=phase63e-claim-b psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SELECT phase63e.claim_attempt('identity-queued',clock_timestamp(),interval '30 seconds');" >"$tmp/claim-b.out" &
claim_b=$!
wait "$claim_a"
wait "$claim_b"
wins="$(cat "$tmp/claim-a.out" "$tmp/claim-b.out" | grep -c '^t$' || true)"
losses="$(cat "$tmp/claim-a.out" "$tmp/claim-b.out" | grep -c '^f$' || true)"
state="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT status || ':' || lease_generation::text FROM phase63e.workflow_step_attempts WHERE id='identity-queued';")"
[[ "$wins" == "1" && "$losses" == "1" && "$state" == "running:1" ]] || {
  echo "FAIL: claim race invariant violated (wins=$wins losses=$losses state=$state)"
  exit 1
}
echo "PASS: conditional claim race had one winner and one generation increment."

# Hold next-attempt row; concurrent identity mutation must wait then fail at trigger.
PGAPPNAME=phase63e-next-holder psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "BEGIN; SELECT id FROM phase63e.workflow_step_attempts WHERE id='replay-next' FOR UPDATE; SELECT pg_sleep(3); COMMIT;" \
  >"$tmp/next-holder.out" 2>&1 &
holder=$!
sleep 0.2

set +e
PGAPPNAME=phase63e-identity-mutator psql -X -v ON_ERROR_STOP=1 -qAt \
  -c "SET statement_timeout='8s'; UPDATE phase63e.workflow_step_attempts SET idempotency_key='forged-concurrent-key' WHERE id='replay-next';" \
  >"$tmp/mutator.out" 2>"$tmp/mutator.err" &
mutator=$!
set -e

wait_for_waiters phase63e-identity-mutator 1
wait "$holder"
holder=""
set +e
wait "$mutator"
status=$?
set -e
mutator=""

if [[ "$status" -eq 0 ]] || ! grep -q 'attempt_identity_immutable' "$tmp/mutator.err"; then
  cat "$tmp/mutator.out" "$tmp/mutator.err"
  echo "FAIL: concurrent identity mutation was not rejected"
  exit 1
fi
stored="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "SELECT idempotency_key FROM phase63e.workflow_step_attempts WHERE id='replay-next';")"
[[ "$stored" == "step-attempt:v1:run-replay:step-replay:2" ]] || {
  echo "FAIL: stored identity changed after rejected mutation"
  exit 1
}
echo "PASS: identity mutation waited on the next-attempt lock and was rejected without mutation."
echo "phase-63e-two-session-concurrency-passed"
