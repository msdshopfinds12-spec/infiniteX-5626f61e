# Phase 52 — Trusted Workflow API Implementation Plan

**Status:** IMPLEMENTATION IN PROGRESS — Draft PR #65; enqueue remains fail-closed pending database idempotency work. No production migration, grants, RLS changes, secret changes, or deployment.  
**Parent baseline:** Phase 51 Draft PR #63, head `29526e345d53a9564d7a6edd8fff06d444d04e22`  
**Plan branch:** `feat/phase-52-trusted-workflow-api-plan`  \n**Implementation branch:** `feat/phase-52-workflow-api-contract-auth`  
**Objective:** Define a narrow, authenticated browser-facing API for enqueue, status, cancellation, and idempotency while preserving the existing worker trust boundary.

## 1. Evidence-based starting point

Inspected at the Phase 51 PR head:

- `src/features/workflows/workflow-run-request.ts` provides an immutable JSON-only request containing only `workflow_id` and `input`.
- `supabase/functions/simula-workflow-worker/index.ts` authenticates a user JWT with `auth.getUser(token)`, derives `ownerId` from the verified user, and claims work through the existing user-worker RPC. This endpoint is an executor/claim path, not a browser enqueue API.
- `supabase/functions/simula-workflow-cron-worker/index.ts` uses a separately verified internal worker secret and service-role client. It must remain server-to-server only.
- The Phase 51 inventory says the current UI does not call a trusted enqueue endpoint and still displays demo pipeline/telemetry.
- The Phase 51.3 attempt ledger is design-only. Durable attempt persistence and its migration are not implemented.
- The current database type snapshot is not proof of the live schema, RPC definitions, grants, or populated-data compatibility.

These facts constrain the API design. They do not authorize a database change.

## 2. Scope

### In scope

1. Enqueue a workflow run for a workflow owned by the authenticated caller.
2. Retrieve a safe status projection for a run owned by the authenticated caller.
3. Request cancellation through an atomic owner-checked server operation.
4. Enforce owner-scoped idempotency and request-fingerprint conflict behavior.
5. Return stable, bounded response DTOs with no internal worker secrets.
6. Add contract, authorization, and integration tests using synthetic owners and disposable infrastructure.

### Explicitly out of scope

- Worker claiming, execution, retry scheduling, leases, heartbeats, attempt-ledger persistence, and crash recovery (Phase 53).
- Frontend dashboard wiring (Phase 54).
- Production schema changes, production grants/RLS changes, secret changes, and production deployment.
- Arbitrary code, shell, URL fetching, dynamic imports, or user-defined executable actions.
- Exposing the existing user worker or cron worker as a public enqueue/status endpoint.

## 3. Recommended architecture

Browser -> authenticated `simula-workflow-api` Edge Function -> narrow trusted database operations -> existing durable run records.

Keep the user worker and cron worker as separate internal execution paths. The API must never return service-role credentials, worker secrets, lease tokens, lease-token hashes, internal claim generations, or raw exception stacks.

Preferred implementation shape: one Edge Function with explicit route/method dispatch, subject to a small routing spike proving Supabase Edge Function path behavior:

| Operation | Proposed route | Method |
|---|---|---|
| Enqueue | `/functions/v1/simula-workflow-api/runs` | POST |
| Read status | `/functions/v1/simula-workflow-api/runs/{runId}` | GET |
| Request cancellation | `/functions/v1/simula-workflow-api/runs/{runId}/cancel` | POST |

If path routing is awkward in the deployed gateway, use one explicit operation discriminator with the same request/response schemas. Do not create several functions merely for cosmetic REST naming.

## 4. Trust and authorization contract

- Require a valid Supabase access token in the Authorization bearer header.
- Verify identity server-side using the supported Supabase Auth verification path (`auth.getUser(token)`); never trust a decoded JWT alone.
- Derive `owner_id` exclusively from the verified user ID.
- Ignore or reject client-supplied `owner_id`, `status`, `attempt`, worker identity, lease fields, output, error, timestamps, or lifecycle fields.
- Before enqueue, verify that the workflow exists, belongs to the caller, is active/not archived, and has a valid executable configuration.
- For status and cancellation, include both run ID and verified owner ID in the database predicate or call a narrowly scoped owner-checking RPC.
- Do not use a browser-supplied workflow/run ID as proof of ownership.
- Worker-only claim/recovery RPCs remain inaccessible to anon/authenticated roles.
- Never place a service-role key in Vite variables, browser bundles, responses, logs, or client-side configuration.

## 5. Request and response contracts

### 5.1 Enqueue request

The only accepted business fields are:

```ts
type EnqueueWorkflowRunRequest = Readonly<{
  workflow_id: string;
  input: Json;
}>;
```

- Reuse `createWorkflowRunRequest`; do not use generated `workflow_runs.Insert` from the browser.
- Require an opaque `Idempotency-Key` header, validated for length and allowed characters. Proposed initial range: 8–128 ASCII characters; confirm client generation and gateway limits during implementation.
- Reject unknown top-level fields and all client lifecycle/ownership fields.
- Bound body bytes, nesting depth, array length, object key count, and serialized input size. Final limits must be reconciled with existing worker limits and product needs before implementation.
- Return `202 Accepted` for a newly queued run; return the existing logical run for a same-key/same-fingerprint replay.
- Return `409 Conflict` when a key is reused with a different canonical request fingerprint.

### 5.2 Status response

Expose only a versioned, allowlisted DTO, for example:

```ts
type WorkflowRunStatusDto = Readonly<{
  id: string;
  workflow_id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  safe_error_code: string | null;
  steps: ReadonlyArray<{
    step_id: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    attempt_number?: number;
    started_at: string | null;
    finished_at: string | null;
    safe_error_code: string | null;
  }>;
}>;
```

This is a target contract, not a claim that the current database supports every field or status. Reconcile exact status vocabulary, relationships, and fields with live schema and worker source before coding. Never return raw error messages, arbitrary output JSON, internal logs, owner IDs, lease data, or worker secrets by default.

### 5.3 Cancellation response

Cancellation is a request, not proof that an in-flight synchronous action has already stopped. Return the authoritative persisted state and a stable result such as `cancellation_requested`, `already_terminal`, or `not_found`. Use compare-and-set semantics so cancellation and completion races have one database winner. Do not expose whether another owner's run exists.

## 6. Idempotency and atomicity

Enqueue idempotency is separate from worker delivery and per-step attempt idempotency.

Required behavior:

1. Scope the idempotency key to the verified owner.
2. Canonicalize the validated request deterministically and compute a cryptographic request fingerprint server-side.
3. Enforce uniqueness in PostgreSQL; read-before-write alone is insufficient.
4. In one database transaction, create or resolve the idempotency record and queued run.
5. Same owner + same key + same fingerprint returns the same logical run.
6. Same owner + same key + different fingerprint returns conflict without mutation.
7. Different owners may use the same opaque key without collision or information leakage.
8. Database/transaction retries must not create duplicate runs.

The current Phase 51.3 attempt ledger does not itself prove that an enqueue-idempotency relation already exists. Inspect live tables, constraints, functions, and consumers before selecting a new table, existing unique key, or additive migration. Prefer a narrow transactional RPC over multiple non-atomic browser/API writes.

## 7. Error model and HTTP behavior

Use stable machine-readable codes and generic messages:

| HTTP | Condition |
|---:|---|
| 200 | Status read or idempotent replay |
| 202 | New run accepted / cancellation request accepted |
| 400 | Malformed JSON or invalid request contract |
| 401 | Missing or invalid authentication |
| 403 | Authenticated caller lacks permission |
| 404 | Run/workflow unavailable to this owner (avoid cross-owner existence leaks) |
| 409 | Idempotency key reused with a different fingerprint or invalid state transition |
| 413 | Request exceeds configured byte limit |
| 415 | Unsupported content type |
| 429 | Rate limit exceeded |
| 500 | Generic internal error with server-side correlation ID |

Do not return database error text, SQL, stack traces, tokens, or secrets. Log a correlation ID, stable error code, and redacted metadata only.

## 8. CORS, input, and abuse controls

- Reuse the repository's shared CORS policy; allow only configured application origins.
- Reject disallowed origins; do not use wildcard origins with credentialed requests.
- Require JSON content type for POST operations.
- Apply request byte limits before parsing and strict schema validation after parsing.
- Add owner-scoped rate limits for enqueue and cancellation; define the storage/atomicity mechanism before implementation.
- Bound workflow input and step counts; reject unsupported or archived workflows.
- Use no arbitrary external URL fetch, arbitrary code execution, shell, or dynamic evaluation.
- Ensure all error and response paths set `Cache-Control: no-store` for authenticated run data.
- Avoid leaking run existence through different status codes or timing where practical.

## 9. Database/API boundary decisions required before implementation

The following are blocking review items, not assumptions:

- [ ] Re-query live schema for workflows, workflow_runs, workflow_steps, workflow_step_runs, and workflow_logs.
- [ ] Inspect primary/unique keys, foreign keys, delete actions, check constraints, and actual status values.
- [ ] Inspect exact definitions and EXECUTE grants for existing enqueue/claim/cancel/status RPCs.
- [ ] Inspect RLS policies and table grants for anon, authenticated, and service_role.
- [ ] Inventory every frontend, Edge Function, RPC, cron, and automation consumer of run lifecycle fields.
- [ ] Confirm whether a suitable owner-scoped enqueue idempotency key/record already exists.
- [ ] Decide cancellation semantics for queued, claimed, running, and terminal runs.
- [ ] Reconcile request/output limits and runtime/database timeout limits.
- [ ] Decide whether status reads use owner-scoped RLS queries or narrow read RPCs.
- [ ] Verify that all writes are atomic and worker-only operations remain worker-only.

No migration SQL should be authored until these checks are complete.

## 10. Implementation work packages

### WP52.1 — Contract and route spike
- Add typed request/response schemas and route parsing.
- Test method, path, content type, body limits, malformed JSON, and CORS.
- No database writes.

### WP52.2 — Authentication and owner derivation
- Verify JWT with Supabase Auth.
- Derive owner server-side.
- Add missing/invalid/expired token and forged-owner tests.
- No service-role use until the required trusted operation is explicitly designed.

### WP52.3 — Enqueue + idempotency
- Implement one atomic trusted database operation after schema review.
- Add same-key replay, changed-payload conflict, concurrent duplicate, and cross-owner key tests.
- No direct browser table insert.

### WP52.4 — Status projection
- Implement owner-scoped safe DTO.
- Test Owner A/B isolation, nonexistent IDs, forged IDs, and response redaction.

### WP52.5 — Cancellation
- Implement atomic compare-and-set cancellation.
- Test cancellation/completion races, queued cancellation, already-terminal runs, and unauthorized requests.

### WP52.6 — Disposable integration verification
- Use synthetic Owner A and Owner B only.
- Run against an isolated/disposable Supabase project with test credentials.
- Verify database constraints, RLS, grants, RPC execution permissions, idempotency under concurrency, and audit-log redaction.
- Record exact commands, commit, environment type, and results.

## 11. Required test matrix

- [ ] Anonymous request is rejected.
- [ ] Invalid/expired JWT is rejected.
- [ ] Forged owner_id is rejected or ignored; verified owner always wins.
- [ ] Owner A cannot enqueue Owner B workflow.
- [ ] Owner A cannot read/cancel Owner B run.
- [ ] Same key + same request returns one logical run.
- [ ] Same key + different request returns 409 with no second run.
- [ ] Concurrent duplicate enqueue creates exactly one run.
- [ ] Unknown request fields and lifecycle fields are rejected.
- [ ] Oversized and deeply nested payloads fail closed.
- [ ] Archived workflow cannot be enqueued.
- [ ] Status DTO excludes internal secrets, stack traces, raw error text, and lease fields.
- [ ] Cancellation races with completion and exactly one terminal outcome wins.
- [ ] Browser cannot execute internal claim/recovery RPCs.
- [ ] CORS rejects untrusted origins.
- [ ] Rate limiting is owner-scoped and race-safe.
- [ ] Logs contain correlation IDs and safe error codes only.

## 12. Acceptance criteria

Phase 52 may be marked IMPLEMENTED only when:
- The API contracts are implemented and versioned.
- All writes use trusted, atomic database operations.
- Owner identity is server-derived on every operation.
- Idempotency is database-enforced and concurrency-tested.
- Status responses are owner-scoped and redacted.
- Cancellation semantics are tested under races.
- Disposable integration tests pass with synthetic owners.
- CI passes on the exact implementation commit.
- Security review records no unresolved critical/high findings.

Phase 52 is not production-ready merely because TypeScript lint or unit tests pass. Phase 53 worker integration and Phase 54 frontend wiring remain separate gates.

## 13. Rollback and release controls

- Keep the API disabled/unrouted until its disposable integration suite passes.
- Use additive schema changes only after separate approval and compatibility review.
- Prefer a reversible function/code rollback; document any schema objects that cannot be safely removed.
- Do not enable production traffic until human approval.
- No merge, production migration, secret change, deployment, or release is authorized by this plan.

## 14. Current status

| Area | Status |
|---|---|
| Phase 52 architecture and contract | DOCUMENTED |
| Route/auth implementation | NOT IMPLEMENTED |
| Enqueue/idempotency persistence | NOT IMPLEMENTED |
| Status/cancellation API | NOT IMPLEMENTED |
| Disposable integration tests | NOT RUN |
| Production schema changes | NOT AUTHORIZED |
| Production deployment / merge | NOT AUTHORIZED |

**Safety:** This commit is a planning artifact only. It makes no runtime, database, permission, secret, billing, deployment, merge, or release change.


## 10. Live database verification update

See [PHASE-52-LIVE-DATABASE-CONTRACT-VERIFICATION.md](./PHASE-52-LIVE-DATABASE-CONTRACT-VERIFICATION.md) for the read-only inspection of Ashaa-INX. The live contract confirms owner-scoped RLS, authenticated INSERT/SELECT but no authenticated UPDATE on workflow_runs, a server-managed insert trigger, and the absence of API idempotency columns. This supersedes the earlier note that live schema/RPC/grants were not yet verified.

PR #65 now contains the initial Edge Function contract/authentication, owner-scoped status reads, and queued-only cancellation. Enqueue intentionally returns 501 until the proposed atomic idempotency schema/RPC is reviewed and tested. The new endpoints have not been deployed or runtime-tested.
