# Phase 81 — PostgREST Worker HTTP Integration

## Objective

Exercise the authenticated Deno workflow worker through a real local HTTP listener, with Supabase JS requests routed through a disposable PostgREST gateway to a disposable Supabase PostgreSQL 17 database.

This phase closes a gap left by the Phase 77 SQL harness and Phase 71 mocked handler tests.

## Architecture

```text
Deno local HTTP listener
  -> createAuthenticatedWorkerHandler
  -> injected synthetic identity boundary (test-only)
  -> Supabase JS user client
  -> PostgREST JWT role: authenticated
  -> public.simula_claim_workflow_runs()
  -> PostgreSQL queue row lock + owner filter

Worker admin client
  -> PostgREST JWT role: service_role
  -> workflow/step reads
  -> workflow_step_runs writes
  -> workflow_runs terminal update
  -> workflow_logs writes
```

## Test design

- Disposable Supabase PostgreSQL 17 container; migration replay uses the existing provenance-checked rehearsal.
- PostgREST 12.2.12 in a separate disposable container sharing only the PostgreSQL container's network namespace.
- Synthetic user A and user B; a short-lived HS256 test JWT for each required role.
- One queued workflow for owner A and one for owner B.
- Owner A sends a real HTTP POST to a Deno listener bound to loopback.
- The worker claims one row through the actual PostgREST RPC, executes two deterministic safe actions, and persists run, step-run, and log records.
- Test queries PostgreSQL through the service-role PostgREST endpoint and verifies owner B's queue row remains queued.

## Authentication boundary

The worker's existing bearer-token verification normally calls Supabase Auth's `auth.getUser()` endpoint. This local integration does not start the complete Supabase Auth service. Instead, the worker dependency boundary accepts an optional injectable authenticator; the integration injects a strict allowlist check for the synthetic user JWT and owner ID.

The JWT signature and database role are still validated by PostgREST. This proves the HTTP-to-PostgREST-to-PostgreSQL data path, but does not claim a live Supabase Auth service or deployed Edge Function authentication test.

## Safety boundaries

- Only the disposable PostgreSQL database `infinitex_rehearsal` is targeted.
- The JWT signing secret and tokens are generated inside CI, short-lived, synthetic, and never written to repository files or logs.
- No hosted Supabase URL, production credential, live migration, user data, deployment, billing, or production write is used.
- The test fixture modifies only the disposable database to provide a PostgREST authenticator role, JWT-compatible `auth.uid()`, grants, a test-only log sequence, and synthetic rows.
- CI repository permission is read-only.
- Both containers are removed in an `always()` cleanup step.

## Verification required

The Phase 81 workflow must pass all of the following:
1. Existing worker contract and regression suites.
2. Disposable PostgreSQL startup and provenance-checked migration replay.
3. Synthetic fixture setup.
4. PostgREST startup and readiness.
5. Real loopback HTTP request to the Deno worker.
6. Authenticated PostgREST queue claim.
7. Persisted successful workflow run, two successful step-run rows, and three workflow log events.
8. Owner B's queued row remains untouched.
9. Disposable container cleanup.

## Limitations

- This does not start Supabase Auth, GoTrue, Kong, or a deployed Supabase Edge Runtime.
- The identity verification function is injected for this test only; normal production handler defaults remain unchanged.
- This does not establish live hosted Supabase schema parity, production RLS policy completeness, deployment correctness, or production readiness.
- A passing CI run is required before Phase 81 can be marked verified.
