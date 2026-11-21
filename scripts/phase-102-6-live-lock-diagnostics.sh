#!/usr/bin/env bash
# Read-only, disposable-CI-only PostgreSQL activity/lock sampler for Phase 102.6.
# Emits lock metadata and blocker relationships; never emits SQL text or row contents.
set -euo pipefail

duration_seconds="${1:-45}"
if [[ ! "$duration_seconds" =~ ^[0-9]+$ ]] || (( duration_seconds < 1 || duration_seconds > 45 )); then
  echo "PHASE1026_DIAGNOSTICS_BLOCKED: duration must be an integer from 1 to 45 seconds" >&2
  exit 2
fi

# Hard boundary: never connect to hosted, production, or non-rehearsal databases.
if [[ "${PGHOST:-}" != "127.0.0.1" ||
      "${PGPORT:-}" != "5432" ||
      "${PGDATABASE:-}" != "infinitex_rehearsal" ||
      "${PGUSER:-}" != "supabase_admin" ]]; then
  echo "PHASE1026_DIAGNOSTICS_BLOCKED: expected loopback infinitex_rehearsal connection only" >&2
  exit 2
fi

sample_count=$((duration_seconds * 4))
for ((sample = 1; sample <= sample_count; sample++)); do
  psql -X -v ON_ERROR_STOP=1 -At -F '|' -c "
    SELECT
      'PHASE1026_ACTIVITY',
      to_char(clock_timestamp(), 'HH24:MI:SS.MS'),
      a.pid,
      coalesce(a.application_name, ''),
      coalesce(a.state, ''),
      coalesce(a.wait_event_type, ''),
      coalesce(a.wait_event, ''),
      coalesce(round(extract(epoch FROM clock_timestamp() - a.query_start)::numeric * 1000)::text, ''),
      coalesce(round(extract(epoch FROM clock_timestamp() - a.xact_start)::numeric * 1000)::text, ''),
      coalesce(array_to_string(pg_blocking_pids(a.pid), ','), ''),
      coalesce(a.backend_type, '')
    FROM pg_catalog.pg_stat_activity AS a
    WHERE a.datname = current_database()
      AND a.pid <> pg_backend_pid()
      AND (a.state = 'active' OR a.xact_start IS NOT NULL
           OR cardinality(pg_blocking_pids(a.pid)) > 0)
    ORDER BY a.pid;

    SELECT
      'PHASE1026_LOCK',
      to_char(clock_timestamp(), 'HH24:MI:SS.MS'),
      l.pid,
      coalesce(a.application_name, ''),
      l.locktype,
      coalesce(n.nspname || '.' || c.relname, ''),
      l.mode,
      l.granted,
      coalesce(l.transactionid::text, ''),
      coalesce(l.page::text, ''),
      coalesce(l.tuple::text, ''),
      coalesce(array_to_string(pg_blocking_pids(l.pid), ','), '')
    FROM pg_catalog.pg_locks AS l
    LEFT JOIN pg_catalog.pg_stat_activity AS a ON a.pid = l.pid
    LEFT JOIN pg_catalog.pg_class AS c ON c.oid = l.relation
    LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE l.database = (SELECT oid FROM pg_catalog.pg_database
                        WHERE datname = current_database())
      AND (
        l.relation = 'public.workflow_runs'::regclass
        OR l.locktype IN ('transactionid', 'tuple')
        OR NOT l.granted
      )
    ORDER BY l.pid NULLS LAST, l.locktype, l.granted;
  " || {
    echo "PHASE1026_DIAGNOSTICS_SAMPLE_ERROR: read-only PostgreSQL lock query failed" >&2
    exit 1
  }
  sleep 0.25
done
