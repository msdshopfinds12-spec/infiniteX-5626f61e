#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the disposable PostgreSQL service}"
if [[ "$DATABASE_URL" != "postgresql://postgres:postgres@localhost:5432/postgres" ]]; then
  echo "REFUSED: only the exact disposable PostgreSQL service URL is permitted." >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
READY_FILE="$TMP_DIR/session-a-holds-parent.lock"
B_STARTED_FILE="$TMP_DIR/session-b-is-connected"
export READY_FILE B_STARTED_FILE DATABASE_URL
SESSION_A_PID=""
SESSION_B_PID=""
cleanup() {
  [[ -n "$SESSION_B_PID" ]] && kill "$SESSION_B_PID" 2>/dev/null || true
  [[ -n "$SESSION_A_PID" ]] && kill "$SESSION_A_PID" 2>/dev/null || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/fixtures/phase-4n8b-contract-schema.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261120000000_phase_4n8b_transactional_step_fencing.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/phase-4n8b-transactional-step-fencing.test.sql"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
insert into public.workflows (id, owner_id)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
insert into public.workflow_runs (id, workflow_id, owner_id, status, attempt)
values ('30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001', 'running', 1);
insert into public.workflow_steps (id, workflow_id) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');
SQL

cat > "$TMP_DIR/session-a.sql" <<'SQL'
begin;
select id from public.workflow_runs
where id = '30000000-0000-4000-8000-000000000001'
for update;
\! touch "$READY_FILE"
\! while [ ! -f "$B_STARTED_FILE" ]; do sleep 0.02; done
\! for _ in $(seq 1 200); do if [ "$(psql "$DATABASE_URL" -X -Atc "select count(*) from pg_stat_activity where application_name = 'phase4n8b-session-b' and wait_event_type = 'Lock'")" = "1" ]; then exit 0; fi; sleep 0.05; done; echo "Session B never reached a database lock wait." >&2; exit 1
select public.simula_transition_workflow_step(
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  1, 'start', '{"session":"A"}'::jsonb, null, null
);
commit;
SQL

cat > "$TMP_DIR/session-b.sql" <<'SQL'
\! touch "$B_STARTED_FILE"
select public.simula_transition_workflow_step(
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  1, 'start', '{"session":"B"}'::jsonb, null, null
);
SQL

timeout 30s psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$TMP_DIR/session-a.sql" >"$TMP_DIR/session-a.log" 2>&1 &
SESSION_A_PID=$!

for _ in $(seq 1 200); do
  [[ -f "$READY_FILE" ]] && break
  if ! kill -0 "$SESSION_A_PID" 2>/dev/null; then
    cat "$TMP_DIR/session-a.log" >&2
    wait "$SESSION_A_PID" || true
    echo "Session A exited before acquiring its lock." >&2
    exit 1
  fi
  sleep 0.05
done
if [[ ! -f "$READY_FILE" ]]; then
  echo "Timed out waiting for Session A lock marker." >&2
  exit 1
fi

PGAPPNAME=phase4n8b-session-b timeout 30s psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$TMP_DIR/session-b.sql" >"$TMP_DIR/session-b.log" 2>&1 &
SESSION_B_PID=$!
if wait "$SESSION_B_PID"; then
  SESSION_B_PID=""
  echo "FAIL: same-generation Session B unexpectedly succeeded." >&2
  cat "$TMP_DIR/session-b.log" >&2
  exit 1
fi
SESSION_B_PID=""

wait "$SESSION_A_PID" || {
  SESSION_A_PID=""
  cat "$TMP_DIR/session-a.log" >&2
  exit 1
}
SESSION_A_PID=""

grep -q "workflow_step_attempt_superseded" "$TMP_DIR/session-b.log" || {
  cat "$TMP_DIR/session-b.log" >&2
  echo "FAIL: Session B returned an unexpected error." >&2
  exit 1
}

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
do $assert$
declare v_count integer;
begin
  select count(*) into v_count
  from public.workflow_step_runs
  where run_id = '30000000-0000-4000-8000-000000000001'
    and step_id = '40000000-0000-4000-8000-000000000001'
    and attempt = 1 and status = 'running';
  if v_count <> 1 then
    raise exception 'expected one generation-1 start; found %', v_count;
  end if;
end
$assert$;

update public.workflow_runs set attempt = 2
where id = '30000000-0000-4000-8000-000000000001' and attempt = 1;
SQL

if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "
  select public.simula_transition_workflow_step(
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    1, 'succeed', null, '{\"stale\":true}'::jsonb, null
  );
" >"$TMP_DIR/stale.log" 2>&1; then
  echo "FAIL: stale completion unexpectedly succeeded." >&2
  exit 1
fi
grep -q "workflow_step_attempt_superseded" "$TMP_DIR/stale.log" || {
  cat "$TMP_DIR/stale.log" >&2
  echo "FAIL: stale completion returned an unexpected error." >&2
  exit 1
}

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
begin;
select public.simula_transition_workflow_step(
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  2, 'start', '{"rollback":true}'::jsonb, null, null
);
rollback;

do $assert$
declare v_count integer;
begin
  select count(*) into v_count from public.workflow_step_runs
  where run_id = '30000000-0000-4000-8000-000000000001'
    and step_id = '40000000-0000-4000-8000-000000000002';
  if v_count <> 0 then raise exception 'rolled-back start persisted'; end if;
end
$assert$;

select public.simula_transition_workflow_step(
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  2, 'start', '{"generation":2}'::jsonb, null, null
);
select public.simula_transition_workflow_step(
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  2, 'succeed', null, '{"ok":true}'::jsonb, null
);
SQL

echo "PASS: isolated PostgreSQL 17 contract checks completed."
echo "SCOPE: synthetic contract fixture only; not production schema compatibility evidence."
