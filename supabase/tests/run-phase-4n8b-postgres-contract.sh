#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to the disposable PostgreSQL service}"
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*) ;;
  *)
    echo "REFUSED: this destructive fixture runner only accepts localhost PostgreSQL." >&2
    exit 64
    ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
READY_FILE="$TMP_DIR/session-a-holds-parent.lock"
export READY_FILE
trap 'rm -rf "$TMP_DIR"' EXIT

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/fixtures/phase-4n8b-contract-schema.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20261120000000_phase_4n8b_transactional_step_fencing.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/phase-4n8b-transactional-step-fencing.test.sql"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
insert into public.workflows (id, owner_id)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
insert into public.workflow_runs (id, workflow_id, owner_id, status, attempt)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'running',
  1
);
insert into public.workflow_steps (id, workflow_id) values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');
SQL

# Session A holds the parent row lock. Session B is launched only after the
# lock-ready marker exists, so B must wait behind A at the RPC serialization row.
cat > "$TMP_DIR/session-a.sql" <<'SQL'
begin;
select id from public.workflow_runs
where id = '30000000-0000-4000-8000-000000000001'
for update;
\! touch "$READY_FILE"
select pg_sleep(1);
select public.simula_transition_workflow_step(
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  1, 'start', '{"session":"A"}'::jsonb, null, null
);
select pg_sleep(1);
commit;
SQL

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$TMP_DIR/session-a.sql" >"$TMP_DIR/session-a.log" 2>&1 &
SESSION_A_PID=$!

for _ in $(seq 1 200); do
  if [[ -f "$READY_FILE" ]]; then break; fi
  if ! kill -0 "$SESSION_A_PID" 2>/dev/null; then
    cat "$TMP_DIR/session-a.log" >&2
    wait "$SESSION_A_PID" || true
    echo "Session A exited before acquiring its test lock." >&2
    exit 1
  fi
  sleep 0.05
done
if [[ ! -f "$READY_FILE" ]]; then
  kill "$SESSION_A_PID" 2>/dev/null || true
  echo "Timed out waiting for Session A lock marker." >&2
  exit 1
fi

if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "
  select public.simula_transition_workflow_step(
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    1, 'start', '{\"session\":\"B\"}'::jsonb, null, null
  );
" >"$TMP_DIR/session-b.log" 2>&1; then
  echo "FAIL: concurrent same-generation Session B unexpectedly succeeded." >&2
  cat "$TMP_DIR/session-b.log" >&2
  exit 1
fi

wait "$SESSION_A_PID" || {
  cat "$TMP_DIR/session-a.log" >&2
  exit 1
}
grep -q "workflow_step_attempt_superseded" "$TMP_DIR/session-b.log" || {
  cat "$TMP_DIR/session-b.log" >&2
  echo "FAIL: Session B did not fail with the expected stale/duplicate-generation error." >&2
  exit 1
}

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
do $assert$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.workflow_step_runs
  where run_id = '30000000-0000-4000-8000-000000000001'
    and step_id = '40000000-0000-4000-8000-000000000001'
    and attempt = 1
    and status = 'running';
  if v_count <> 1 then
    raise exception 'expected exactly one committed generation-1 step start; found %', v_count;
  end if;
end
$assert$;

update public.workflow_runs
set attempt = 2
where id = '30000000-0000-4000-8000-000000000001'
  and attempt = 1;
SQL

if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "
  select public.simula_transition_workflow_step(
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    1, 'succeed', null, '{\"stale\":true}'::jsonb, null
  );
" >"$TMP_DIR/stale.log" 2>&1; then
  echo "FAIL: stale generation completion unexpectedly succeeded." >&2
  exit 1
fi
grep -q "workflow_step_attempt_superseded" "$TMP_DIR/stale.log" || {
  cat "$TMP_DIR/stale.log" >&2
  echo "FAIL: stale completion returned an unexpected error." >&2
  exit 1
}

# Verify transaction rollback removes the uncommitted step start.
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
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.workflow_step_runs
  where run_id = '30000000-0000-4000-8000-000000000001'
    and step_id = '40000000-0000-4000-8000-000000000002';
  if v_count <> 0 then
    raise exception 'rolled-back step start unexpectedly persisted';
  end if;
end
$assert$;

-- A newer generation may replace the older row and complete it.
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

echo "PASS: isolated PostgreSQL contract checks completed."
echo "SCOPE: synthetic RPC contract fixture; not production-schema compatibility evidence."
