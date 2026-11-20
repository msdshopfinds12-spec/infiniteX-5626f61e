#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST must point to the disposable PostgreSQL instance}"
: "${PGDATABASE:?PGDATABASE must name the isolated Phase 63 test database}"
: "${PGUSER:?PGUSER must be set}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCHEMA="${ROOT}/tests/database/phase-63-retry-idempotency-schema.sql"
SEED="${ROOT}/tests/database/phase-63-retry-idempotency-seed.sql"
BASELINE="${ROOT}/tests/database/phase-63-retry-idempotency-baseline.sql"
FIXED="${ROOT}/tests/database/phase-63-retry-idempotency-fixed.sql"
TMP_SCHEMA="$(mktemp)"
trap 'rm -f "${TMP_SCHEMA}"' EXIT

# Mutate only the failed-replay lookup to recreate the pre-fix owner-scoped bug.
MATCHES="$(grep -Fc '     WHERE idempotency_key = v_next_key;' "${SCHEMA}")"
if [[ "${MATCHES}" != "1" ]]; then
  echo "Expected exactly one corrected failed-replay lookup to mutate; found ${MATCHES}" >&2
  exit 1
fi
sed 's/     WHERE idempotency_key = v_next_key;/     WHERE owner_id = p_owner_id AND idempotency_key = v_next_key;/' "${SCHEMA}" > "${TMP_SCHEMA}"

echo "Phase 63D: execute pre-fix baseline mutation"
psql -X -v ON_ERROR_STOP=1 -f "${TMP_SCHEMA}"
psql -X -v ON_ERROR_STOP=1 -f "${SEED}"
psql -X -v ON_ERROR_STOP=1 -f "${BASELINE}"

echo "Phase 63D: execute corrected implementation"
psql -X -v ON_ERROR_STOP=1 -f "${SCHEMA}"
psql -X -v ON_ERROR_STOP=1 -f "${SEED}"
psql -X -v ON_ERROR_STOP=1 -f "${FIXED}"

echo "phase-63-old-vs-fixed-retry-idempotency-regression-passed"
