#!/usr/bin/env bash
# Read-only, disposable-CI-only PostgreSQL sampler for Phase 103.4.
# Deliberately captures metadata only; SQL text, row contents, and secrets are omitted.
set -euo pipefail

duration_seconds="${1:-150}"
if [[ ! "$duration_seconds" =~ ^[0-9]+$ ]] || (( duration_seconds < 1 || duration_seconds > 180 )); then
  echo "PHASE1034_DIAGNOSTICS_BLOCKED: duration must be an integer from 1 to 180 seconds" >&2
  exit 2
fi

# Hard boundary: this helper must never run against a hosted or non-test database.
if [[ "${PGHOST:-}" != "127.0.0.1" ||
      "${PGPORT:-}" != "5432" ||
      "${PGDATABASE:-}" != "infinitex_rehearsal" ||
      "${PGUSER:-}" != "supabase_admin" ]]; then
  echo "PHASE1034_DIAGNOSTICS_BLOCKED: expected loopback infinitex_rehearsal connection only" >&2
  exit 2
fi

sample_count=$duration_seconds
for ((sample = 1; sample <= sample_count; sample++)); do
  # Include idle sessions in pool accounting: the detailed activity sample
  # below intentionally focuses on active/transactional/waiting backends.
  psql -X -v ON_ERROR_STOP=1 -At -F '|' -c "
    SELECT
      'PHASE1034_POOL_SAMPLE',
      to_char(clock_timestamp(), 'HH24:MI:SS.MS'),
      count(*) FILTER (WHERE a.backend_type = 'client backend'),
      count(*) FILTER (WHERE a.backend_type = 'client backend' AND a.state = 'active'),
      count(*) FILTER (WHERE a.backend_type = 'client backend' AND a.state = 'idle'),
      count(*) FILTER (WHERE a.backend_type = 'client backend' AND a.state = 'idle in transaction'),
      count(*) FILTER (WHERE a.backend_type = 'client backend' AND cardinality(pg_blocking_pids(a.pid)) > 0),
      current_setting('max_connections')
    FROM pg_catalog.pg_stat_activity AS a
    WHERE a.datname = current_database()
      AND a.pid <> pg_backend_pid();
  " || {
    echo "PHASE1034_POOL_SAMPLE_ERROR: read-only connection-count query failed" >&2
    exit 1
  }

  psql -X -v ON_ERROR_STOP=1 -At -F '|' -c "
    SELECT
      'PHASE1034_LIVE_DB_SAMPLE',
      to_char(clock_timestamp(), 'HH24:MI:SS.MS'),
      a.pid,
      coalesce(a.application_name, ''),
      coalesce(a.state, ''),
      coalesce(a.wait_event_type, ''),
      coalesce(a.wait_event, ''),
      coalesce(round(extract(epoch FROM clock_timestamp() - a.query_start)::numeric * 1000)::text, ''),
      coalesce(round(extract(epoch FROM clock_timestamp() - a.xact_start)::numeric * 1000)::text, ''),
      coalesce(array_to_string(pg_blocking_pids(a.pid), ','), ''),
      coalesce(a.backend_type, ''),
      (SELECT count(*) FROM pg_catalog.pg_locks AS l WHERE l.pid = a.pid AND NOT l.granted),
      (SELECT count(*) FROM pg_catalog.pg_locks AS l WHERE l.pid = a.pid)
    FROM pg_catalog.pg_stat_activity AS a
    WHERE a.datname = current_database()
      AND a.pid <> pg_backend_pid()
      AND (
        a.state = 'active'
        OR a.xact_start IS NOT NULL
        OR cardinality(pg_blocking_pids(a.pid)) > 0
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_locks AS l
          WHERE l.pid = a.pid AND NOT l.granted
        )
      )
    ORDER BY a.query_start NULLS LAST, a.pid;
  " || {
    echo "PHASE1034_LIVE_DB_SAMPLE_ERROR: read-only pg_stat_activity query failed" >&2
    exit 1
  }
  sleep 1
done
