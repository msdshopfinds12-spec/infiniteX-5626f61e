#!/usr/bin/env bash
# Retry npm ci only for classified transient registry/network failures.
# Deterministic dependency, lifecycle-script, and lockfile failures fail immediately.
set -Eeuo pipefail

readonly DEFAULT_MAX_RETRIES=2
readonly DEFAULT_INITIAL_DELAY=3
readonly MAX_ALLOWED_RETRIES=4
readonly MAX_ALLOWED_DELAY=30

fail() {
  printf 'CI_RECOVERY_ERROR: %s\n' "$*" >&2
  exit 2
}

max_retries="${CI_NPM_MAX_RETRIES:-$DEFAULT_MAX_RETRIES}"
initial_delay="${CI_NPM_RETRY_DELAY_SECONDS:-$DEFAULT_INITIAL_DELAY}"

[[ "$max_retries" =~ ^[0-4]$ ]] || fail "CI_NPM_MAX_RETRIES must be an integer from 0 to 4"
[[ "$initial_delay" =~ ^[1-9][0-9]?$ ]] || fail "CI_NPM_RETRY_DELAY_SECONDS must be an integer from 1 to 99"
(( initial_delay <= MAX_ALLOWED_DELAY )) || fail "CI_NPM_RETRY_DELAY_SECONDS must not exceed $MAX_ALLOWED_DELAY"

command -v npm >/dev/null 2>&1 || fail "npm is not installed"
command -v mktemp >/dev/null 2>&1 || fail "mktemp is not available"

work_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
log_file="$(mktemp "$work_dir/infinitex-npm-ci.XXXXXX")"
trap 'rm -f "$log_file"' EXIT

is_transient_failure() {
  grep -Eiq \
    'ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|socket hang up|network timeout|\bHTTP[ /]?(429|502|503|504)\b|status code 429|status code 502|status code 503|status code 504' \
    "$log_file"
}

print_sanitized_log() {
  # Do not print environment variables or raw npm config. Redact common
  # credential-bearing fields before exposing npm output in CI logs.
  sed -E \
    -e 's/(Authorization:)[^[:cntrl:]]*/\1 [REDACTED]/Ig' \
    -e 's/((:_authToken=|_authToken=|_password=|password=))[^[:space:]]*/\1[REDACTED]/Ig' \
    -e 's#(https?://)[^/@[:space:]]+:[^/@[:space:]]+@#\1[REDACTED]@#g' \
    "$log_file"
}

attempt=0
while :; do
  attempt=$((attempt + 1))
  : > "$log_file"
  printf 'CI_RECOVERY: npm ci attempt %s/%s\n' "$attempt" "$((max_retries + 1))"

  set +e
  npm ci --no-audit --no-fund >"$log_file" 2>&1
  status=$?
  set -e

  if (( status == 0 )); then
    printf 'CI_RECOVERY: npm ci completed successfully on attempt %s\n' "$attempt"
    print_sanitized_log
    exit 0
  fi

  printf 'CI_RECOVERY: npm ci exited with status %s\n' "$status" >&2
  print_sanitized_log >&2

  if ! is_transient_failure; then
    printf 'CI_RECOVERY: failure is not classified as transient; stopping without retry\n' >&2
    exit "$status"
  fi

  if (( attempt > max_retries )); then
    printf 'CI_RECOVERY: transient failure exhausted retry budget; stopping\n' >&2
    exit "$status"
  fi

  delay=$(( initial_delay * (2 ** (attempt - 1)) ))
  printf 'CI_RECOVERY: classified transient network/registry failure; retrying in %s seconds\n' "$delay" >&2
  sleep "$delay"
done
