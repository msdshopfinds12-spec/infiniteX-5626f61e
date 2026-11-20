# Phase 84 — Safe Authenticated Workflow Run Enqueue

**Status:** IMPLEMENTED IN ISOLATED CANDIDATE / CI VERIFICATION PENDING  
**Base:** `phase-83-frontend-data-access-audit`  
**Scope:** New database RPC migration, authenticated Edge Function, disposable PostgREST integration tests

## Objective

Provide a safe server-side enqueue boundary so the browser never inserts `workflow_runs` directly or supplies tenant ownership and worker-managed lifecycle fields.

## Request contract

`POST /functions/v1/simula-workflow-run-request`

Accepted JSON keys only:
- `workflow_id`: UUID of an owned active workflow
- `request_id`: client-generated UUID used as an idempotency key
- `input`: JSON object, default `{}`, maximum 16 KiB

The endpoint authenticates the bearer through Supabase Auth and calls `public.simula_enqueue_workflow_run` using the authenticated user client. It does not accept `owner_id`, status, attempt, output, error, or lifecycle timestamps.

## Database enforcement

The new `simula_enqueue_workflow_run` function:
- Is `SECURITY DEFINER` with an empty `search_path`.
- Derives the owner exclusively from `auth.uid()`.
- Verifies that the workflow belongs to that owner and is active.
- Serializes per-owner queue admission with a transaction-scoped advisory lock.
- Caps queued + running jobs at 10 per owner.
- Rejects non-object or oversized input.
- Uses the request UUID as the workflow-run primary key for idempotency.
- Returns the existing row on an exact replay; rejects reuse with a different owner, workflow, or payload.
- Inserts only a queued run with attempt 0 and null worker-owned output/error/timestamps.
- Grants execution to `authenticated`; revokes it from `PUBLIC` and `anon`.

## Edge Function behavior

- Validates the user session and owner UUID.
- Rejects unknown request fields and malformed UUIDs.
- Applies streamed request-body and JSON-input size limits.
- Maps database errors to sanitized HTTP responses (401/400/404/409/413/429/500).
- Returns only run ID, status, creation time, and replay indicator.
- Does not expose service-role credentials or any privileged data.

## Integration coverage

The Phase 84 disposable CI test must verify:
1. Owner A can enqueue an active workflow they own.
2. A new request returns HTTP 201 and a queued run.
3. Exact retries return HTTP 200 with `replayed=true` and do not create duplicates.
4. Reusing a request ID with different input returns HTTP 409.
5. Owner A cannot enqueue owner B's workflow.
6. Caller-supplied `owner_id` is rejected.
7. Oversized input is rejected.
8. Owner B can enqueue only their own workflow.
9. PostgreSQL stores the correct owner and safe initial lifecycle state.

## Safety boundary

- Migration is a candidate in this branch and is replayed only in the disposable PostgreSQL 17 CI database.
- No live Supabase migration, grant change, Edge Function deployment, secret change, or production data mutation is performed.
- The enqueue endpoint creates a queued job; it does not claim that the worker has executed it. Worker dispatch/trigger behavior and the user-facing Run Now flow require a separate verified phase.
- No merge or deployment is authorized.

## Next phase

Phase 85 should wire a browser workflow-run service and UI state to this endpoint, then verify worker dispatch and eventual run-history updates. The UI must distinguish `queued`, `running`, `succeeded`, and `failed`, and must not show success until persisted worker results are read back.
