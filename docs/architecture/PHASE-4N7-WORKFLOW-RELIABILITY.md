# Phase 4N.7 — Workflow Worker Reliability Remediation

**Status:** PLAN / source reconciliation complete; implementation not yet verified  
**Target repository:** `msdshopfinds12-spec/infiniteX-5626f61e`  
**Implementation branch:** `feat/phase-4n7-workflow-reliability` (created from current `main`)  
**Reference branch:** `fix/phase-4m2c-deno-tenant-isolation`  
**Production boundary:** No merge, deployment, migration, SQL write, secret change, billing change, or live database mutation is authorized by this phase.

## 1. Decision

Use the current `main` branch as the implementation base and selectively port reviewed worker-security code from Phase 4M2C. Do not merge or rebase the entire Phase 4M2C branch: its history is divergent from `main` (the comparison reports 235 commits unique to the reference branch and 2 commits unique to `main`). Port only files whose dependencies and schema contracts are verified.

The Phase 4M2C reference branch contains:
- `supabase/functions/simula-workflow-worker/index.ts`
- `supabase/functions/simula-workflow-cron-worker/index.ts`
- `supabase/functions/ashaa-api-key-manager/index.ts`
- `supabase/functions/_shared/worker-security.mjs`
- `supabase/functions/_shared/worker-security.deno.ts`
- `supabase/functions/_shared/worker-security.test.mjs`

The shared helper validates claimed-run shape and ownership, parent-workflow ownership, batch limits, and actual streamed JSON body size. The reference branch records a successful historical Deno/Node CI run (#144), but that is not evidence that this new branch has passed CI or that production is updated.

## 2. Confirmed source findings

### F-01 — Step timeout is not enforced

Both workflow workers load `timeout_seconds` from `workflow_steps`, but the current action loop does not enforce a deadline.

The current action registry contains only synchronous, local transformations:
- `pass_through`
- `set_value`
- `merge_json`
- `uppercase_text`
- `lowercase_text`
- `append_text`
- `prepend_text`

A synchronous JavaScript operation cannot be safely preempted by `Promise.race()` or an AbortSignal. Do not claim hard cancellation for this action set. The implementation must:
1. Validate and bound step timeout values.
2. Establish a monotonic per-step deadline.
3. Check the deadline before and immediately after the synchronous action.
4. Bound serialized input/output size so local transformations remain bounded.
5. Define an AbortSignal-based contract before adding any future asynchronous/external action.
6. Add tests proving deadline rejection and size-bound behavior.

If true preemption is required for CPU-heavy work, move that work to an independently terminable worker/process or an external job boundary. Do not simulate cancellation.

### F-02 — Retry loop repeats deterministic local work

The current retry loop reruns the same local synchronous action after any thrown error. These actions have no transient infrastructure failure mode, so retrying validation errors cannot succeed and wastes execution time.

For the current local-only action registry:
- Execute each action once.
- Classify invalid action/config/input as permanent failure.
- Do not retry permanent failures.
- Do not add exponential backoff to synchronous pure transformations.
- Before adding external side-effecting actions, require explicit retry classification, idempotency key design, deduplication, and an integration test for duplicate delivery.

### F-03 — Child-step ownership contract requires schema evidence

The worker verifies the claimed run owner and the parent workflow owner, then queries `workflow_steps` by `workflow_id`. The reference query does not add an `owner_id` predicate.

Do not add `.eq("owner_id", ownerId)` until the actual table definition confirms that `workflow_steps.owner_id` exists. If it does not, enforce the verified parent relationship using the actual foreign key and a schema-supported join/query. If the database schema is not reproducible from the repository, mark the ownership contract BLOCKED and do not invent a migration.

### F-04 — Preserve cron authentication contract

The cron worker uses `x-simula-worker-secret` and the `simula_verify_worker_secret` RPC. Preserve this contract. Do not enable JWT verification or replace the secret mechanism in this work package without a separate reviewed design and explicit approval.

### F-05 — Request size hardening exists in reference code

The shared helper reads the request stream and counts actual bytes, rather than trusting only `Content-Length`. Port this behavior with tests for missing, false, malformed, and oversized content-length cases where supported by the runtime.

## 3. Implementation work packages

| ID | Work | Acceptance criteria |
|---|---|---|
| 4N.7-A | Port shared security helpers and Node/Deno tests | Same helper contract; tests cover malformed inputs, owner mismatch, batch bounds, and actual stream bytes |
| 4N.7-B | Harden authenticated worker | Authenticated owner binding remains; workflow ownership is verified; request body is bounded |
| 4N.7-C | Harden cron worker | Existing custom-secret verification contract remains unchanged; request body is bounded |
| 4N.7-D | Enforce step execution budget | Validated timeout, monotonic deadline checks, bounded payload size, explicit limitation for synchronous execution |
| 4N.7-E | Correct retry semantics | Deterministic local actions run once; permanent failures are not retried |
| 4N.7-F | Harden API-key manager request parsing | Existing authentication and owner scoping preserved; bounded body parser; no secret material in responses/logs |
| 4N.7-G | Regression and type checks | All repository-prescribed Node and Deno commands pass on this branch; evidence captured from actual CI or local execution |

## 4. Required regression commands

Run these only after the code and test changes are complete:

```sh
npm run check:edge-function-security
npm run test:edge-function-cors
npm run test:edge-worker-security
deno test --no-lock supabase/functions/_shared/worker-security.deno.ts
deno check --node-modules-dir=auto --no-lock supabase/functions/simula-workflow-worker/index.ts
deno check --node-modules-dir=auto --no-lock supabase/functions/simula-workflow-cron-worker/index.ts
deno check --node-modules-dir=auto --no-lock supabase/functions/ashaa-api-key-manager/index.ts
npm run build
```

A command listed here is a required test, not evidence that it has already run. Record exact command, exit code, and CI run/commit for every result. Do not mark tests VERIFIED without execution evidence.

## 5. Security and release constraints

- No database migration, SQL/RLS/grant change, or live database write.
- No secrets retrieval, rotation, or configuration change.
- No merge to `main`.
- No deployment or production function update.
- No new paid service or provider call.
- Do not expose service-role keys or worker secrets to browser code.
- Keep tenant ownership checks fail-closed.
- Preserve existing CORS allowlist behavior and custom cron secret authentication.
- Use synthetic test data only.
- Human review remains required before merge, migration, secret changes, or deployment.

## 6. Current status

| Area | Status | Evidence |
|---|---|---|
| Source repository | VERIFIED | Target repository identified |
| Reference worker source | VERIFIED | Files fetched from Phase 4M2C branch |
| Existing shared security helpers | VERIFIED | Node and Deno helper/test files present on reference branch |
| Historical CI evidence | VERIFIED (historical only) | Phase 4M2C documentation records run #144 passing |
| Current `main` contains worker source | NOT PRESENT in inspected paths | Required worker paths returned 404 on `main` |
| Workflow step schema / owner column | BLOCKED | Must verify authoritative SQL/schema before adding an owner filter |
| Timeout enforcement | NOT IMPLEMENTED in reference worker | No deadline check in the current action loop |
| Retry classification | NOT IMPLEMENTED in reference worker | Same local action is retried after all caught errors |
| Phase 4N.7 code changes | NOT STARTED | This commit is the plan and evidence record only |
| Phase 4N.7 tests | NOT RUN | Must run after implementation |
| Merge / deployment | NOT AUTHORIZED | Explicitly out of scope |

## 7. Exit gate

Phase 4N.7 implementation may proceed only with schema-supported ownership checks and tests that reflect the actual action execution model. A green build alone is not production readiness. Complete TEST → AUDIT → human RELEASE APPROVAL as separate gates.
