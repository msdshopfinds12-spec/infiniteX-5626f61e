# Phase 83 — Frontend Data Access and Authorization Audit

**Status:** VERIFIED IN CI / DRAFT PR OPEN  
**Base:** `phase-82-postgrest-rls-tenant-isolation`  
**Scope:** Browser source, service adapters, API-key Edge Function source, automated contract tests

## Executive result

The reviewed browser data-access layer is deliberately read-only. The frontend uses one typed Supabase browser client, wires authenticated workflow/profile/project read services, avoids caller-supplied owner filters, and relies on PostgreSQL RLS for row authorization. Browser code contains no direct `workflow_runs` mutation and no direct `platform_api_keys` table access.

The API-key browser adapter delegates to the `ashaa-api-key-manager` Edge Function. The server validates the bearer with Supabase Auth, derives `ownerId` from `authData.user.id`, returns only safe metadata, stores a SHA-256 digest, and constrains revoke operations by both key ID and authenticated owner.

## Verified source boundaries

| Area | Source-level result |
|---|---|
| Browser client | Created only after public Supabase URL/publishable-key validation |
| Auth session | Exposes minimal user ID to UI; raw tokens are not copied into app state |
| Profiles | Read-only safe projection; no role/email fields; no caller-selected identity |
| Projects | Read-only metadata projection; no `user_id` or project JSON content |
| Workflows | Read-only workflows, run summaries, and log summaries; RLS remains authoritative |
| Workflow execution request | Immutable JSON DTO containing only `workflow_id` and `input`; server must derive owner and lifecycle state |
| API-key browser service | Uses authenticated function invocation; no direct table access |
| API-key Edge Function | Verifies user, derives owner server-side, returns metadata only, hashes the raw key before storage |
| UI truthfulness | Overview metrics, sample agents/logs/pipelines, and security posture remain labeled demo or unverified |

## Product completeness gaps — not represented as working features

1. Workflow listing and run-history reading are connected; a verified browser-to-server workflow execution endpoint is not wired into the app.
2. The API-key manager source and browser adapter exist, but the adapter is not currently wired into the main app's Security view.
3. Dashboard metrics, AI-agent registry/runtime, sample logs, pipeline board, and security posture are demo/static or unverified.
4. No evidence in this phase proves the API-key Edge Function is deployed or has production secrets/configuration.
5. No live user authentication, live RLS, live Edge Function, live billing, or Vercel deployment was tested here.

## Verified CI result

- Phase 83 workflow run [44829778746](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44829778746): **SUCCESS**
- Exact tested commit: `0826b316695fd9e486b962fe0416c6cc79bbca3c`
- Six Phase 83 source-contract tests: passed.
- Existing worker HTTP boundary, worker runtime parity, Edge Function security, and full Node regression suite: passed.
- Production lint/type-check: passed.
- Production build: passed.

The first runs exposed brittle source-test assumptions about comment formatting and wording; the assertions were corrected to match the actual source contract rather than changing application behavior.

## Automated regression guard

`tests/security/phase-83-frontend-data-access-contract.test.mjs` verifies:
- Main entry wiring of the reviewed authenticated services.
- Safe profile/project/workflow/API-key projections.
- Absence of browser-side workflow-run mutations and direct API-key table access.
- Workflow run request DTO shape.
- API-key Edge Function owner derivation and safe response projection.
- Honest demo/read-only UI status labels.

## Security interpretation

- RLS is still the authorization boundary. UI route checks, request keys, and client-side filtering are not security controls.
- The Phase 82 disposable PostgREST test verifies representative tenant boundaries, not every table or every privileged RPC.
- The API-key Edge Function source is not a substitute for deployed-runtime verification, function-level tests, rate limiting, or operational monitoring.
- No production migrations, GRANT/REVOKE changes, policy changes, secrets, deployment, or data mutations were made.

## Next phase

Phase 84 should implement a narrowly scoped workflow-run request endpoint and integration tests only after a design review of the existing claim/insert RPCs, queue semantics, idempotency keys, and rate limits. It must not permit browser clients to write `owner_id`, status, attempt, output, or worker lifecycle timestamps. The execution UI must remain disabled until that endpoint and its auth/RLS contract pass disposable integration tests.
