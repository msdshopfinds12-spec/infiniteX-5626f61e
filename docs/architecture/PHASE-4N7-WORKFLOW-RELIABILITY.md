# Phase 4N.7 — Workflow Worker Reliability Remediation

**Status:** Phase 4N.7 implementation verified by Phase 4N.8A CI on the integrated branch; production release not approved  
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


## 8. Phase 4N.7-A implementation update

**Implementation status:** Shared foundation committed; worker integration remains pending.

Files added on `feat/phase-4n7-workflow-reliability`:
- `supabase/functions/_shared/worker-security.mjs`
- `supabase/functions/_shared/worker-security.test.mjs`
- `supabase/functions/_shared/worker-security.deno.ts`

The helper layer now includes:
- Claimed-run shape and owner binding.
- Parent-workflow ID and owner binding.
- Bounded queue batch limit.
- Strict timeout validation with a default of 30 seconds and maximum of 300 seconds.
- Monotonic deadline creation and deadline assertion.
- UTF-8 JSON payload byte-limit validation.
- Streamed request-body byte enforcement, fatal UTF-8 decoding, and explicit malformed-body/read-failure results.

The package manifest now exposes `npm run test:edge-worker-security`.

A least-privilege GitHub Actions workflow was added at `.github/workflows/phase-4n7-worker-security.yml`. It grants only `contents: read`, pins checkout to an immutable action commit, and runs the Node regression command. The Actions run result has not yet been independently retrieved; therefore CI status remains **NOT VERIFIED**.

### Local test evidence

An isolated Node.js v22.16.0 harness exercising the same helper behavior passed **7/7 tests**:
- Claimed-run and tenant-owner binding
- Batch-limit bounds
- Timeout validation
- Monotonic deadline behavior
- UTF-8 payload bounds and serialization rejection
- Actual streamed request byte limit
- Malformed JSON, invalid UTF-8, and empty-body behavior

This isolated harness is not a checkout-based execution of the committed repository files. The committed repository test suite and Deno suite remain **NOT RUN** pending a verified CI execution environment.

### Updated status matrix

| Area | Status | Evidence |
|---|---|---|
| Shared Node/Deno helper files | IMPLEMENTED | Files committed on Phase 4N.7 branch |
| Timeout policy primitives | IMPLEMENTED | Validation/deadline/payload-bound helpers and regression cases |
| Node test command | IMPLEMENTED | Package script added |
| Isolated local behavior checks | PARTIAL / PASS | 7/7 in temporary Node v22.16.0 harness; not a repo checkout |
| GitHub Actions workflow | IMPLEMENTED | Workflow file committed; run result not independently retrieved |
| Committed Node regression suite | NOT VERIFIED | Must run in GitHub Actions or repository checkout |
| Deno regression suite | NOT RUN | Deno runtime not available in local verification environment |
| Worker integration | NOT STARTED | Both worker entrypoints still require selective port and integration |
| API-key manager integration | NOT STARTED | Requires worker source and shared CORS integration |
| Database schema / child-step ownership | BLOCKED | No authoritative schema evidence found in inspected repository paths |
| Merge / deployment | NOT AUTHORIZED | Remains outside this phase |

**Next gate:** integrate the helpers into the authenticated and cron worker entrypoints only after porting the exact shared CORS dependency and verifying all required RPC/table contracts. Do not add an `owner_id` predicate to `workflow_steps` without schema evidence.


## 9. Phase 4N.7-B/C/F integration update

**Implementation status:** Worker entrypoints and API-key manager have been ported to the isolated Phase 4N.7 branch and selectively integrated with the new shared helpers.

Files added:
- `supabase/functions/simula-workflow-worker/index.ts`
- `supabase/functions/simula-workflow-cron-worker/index.ts`
- `supabase/functions/ashaa-api-key-manager/index.ts`
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/_shared/cors.test.mjs`

### Worker behavior changes

Both workflow workers now:
- Validate `timeout_seconds` using the shared bounded policy (default 30 seconds; maximum 300 seconds).
- Execute each deterministic local action once; the old retry loop has been removed.
- Check a monotonic deadline before and after action execution.
- Enforce a 64 KiB JSON input/output bound for each local action.
- Retain existing workflow/run owner checks and status transitions.
- Keep the cron worker's `x-simula-worker-secret` header and `simula_verify_worker_secret` RPC unchanged.

**Timeout limitation:** This is cooperative deadline enforcement, not preemption. A synchronous JavaScript action that blocks the isolate cannot be forcibly interrupted by an AbortSignal or `Promise.race()`. Payload bounds constrain the current simple transformation actions. Any future CPU-heavy or asynchronous external action must run behind an independently cancellable worker/job boundary and have a separately designed idempotency contract.

### API-key manager and CORS

The API-key manager was ported with authenticated user lookup, owner-scoped key list/revoke operations, one-time raw key return, SHA-256 digest storage, and bounded streamed JSON parsing. The exact-origin CORS helper denies browser origins not present in `INFINITEX_ALLOWED_ORIGINS`; non-browser requests without an Origin header remain allowed by design.

### Regression wiring

Package scripts now include:
- `npm run test:edge-function-cors`
- `npm run test:edge-worker-security`
- `npm run test:edge-function-security`

The GitHub Actions workflows pin Node.js 22.16.0 and use least-privilege `contents: read`. The Phase 4N.8A integrated branch was verified on exact head `9d6ac04f2bf5ec4d3765f12468b4a1dd777f0753` by run [#44597625333](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44597625333) and PR run [#44597796899](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44597796899). Both completed successfully. Node tests: 16 passed (6 CORS + 10 worker-security); Deno tests: 6 passed; all three Edge Function type checks and `npm run build` passed.

### Updated status matrix

| Area | Status | Evidence |
|---|---|---|
| Shared security and budget helpers | IMPLEMENTED | Committed helper module |
| Node regression suite | VERIFIED | 10/10 passed on exact integrated head |
| Deno regression suite | VERIFIED | 6/6 passed on exact integrated head |
| Exact-origin CORS policy and tests | VERIFIED | 6/6 passed on exact integrated head |
| Authenticated workflow worker | VERIFIED | Deno type check passed on exact integrated head |
| Cron workflow worker | VERIFIED | Deno type check passed on exact integrated head |
| API-key manager | VERIFIED | Deno type check passed on exact integrated head |
| Step execution budget | IMPLEMENTED (COOPERATIVE) | Pre/post deadline checks and JSON byte bounds; no hard preemption |
| Retry semantics | IMPLEMENTED for current local actions | Retry loop removed; each deterministic local action executes once |
| Workflow child-step schema ownership | BLOCKED | Authoritative schema not yet found; no speculative owner column filter added |
| Supabase RPC and table contracts | NOT VERIFIED | Requires authoritative migrations/schema and deployment config |
| GitHub Actions | VERIFIED | Runs #44597625333 and #44597796899 passed on exact head `9d6ac04f644b936de935000c993c47c91587af06` |
| Merge / production deployment | NOT AUTHORIZED | Explicitly out of scope |

**Next required gate:** complete review of the Phase 4N.8A attempt-generation fencing diff, verify the production CORS allowlist/configuration separately, and retain the existing release gate. The CI results above establish code-level build/test/type-check evidence; they do not establish production deployment or live end-to-end workflow behavior.


## 10. Follow-up hardening: bound step configuration

A second review found that the initial cooperative action budget bounded the workflow input and output but did not include the per-step configuration object. Both workflow workers now pass a combined `{ input, config }` envelope into the byte-limit check before invoking the action. This prevents oversized step configuration from bypassing the intended 64 KiB pre-execution bound.

Latest change commits:
- Authenticated worker: `24911f9384fddd51114b3bd0d7f68b5edb37407e`
- Cron worker: `74ff776a8ce3cac0506c425e6e7245c94e301d66`

## 11. CI and deployment signal review

The commit status endpoint previously reported Vercel checks as failed with a build-rate-limit upgrade URL for multiple linked projects. This is a provider/account build-capacity signal, not evidence of an application compile failure. The Phase 4N.8A GitHub Actions push and pull-request runs both passed on the same exact head. No Vercel deployment was attempted or authorized.

Do not bypass this limit by changing billing, switching production projects, or deploying through another provider without explicit approval. The free-first alternatives are to run the committed Node tests in a local/online Node 22 environment, use GitHub Actions when the run can be inspected, and defer Vercel deployment until its build capacity is available.
