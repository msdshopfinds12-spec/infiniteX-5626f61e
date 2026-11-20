# Phase 74 — Deployed Worker Runtime Parity

**Project:** Ashaa-INX (`vepacoemkhudamfaccah`)  
**Repository comparison ref:** `phase-73d/live-schema-runtime-verification`  
**Live capture:** 2026-11-20, read-only Edge Function source retrieval  
**Status:** BLOCKED FOR RELEASE — deployed source differs materially from reviewed GitHub candidate.

## 1. Executive decision

Do not deploy, merge, or declare the workflow runtime complete yet.

Supabase returned the deployed source for all three active Edge Functions. Exact source-text comparison against the reviewed GitHub candidate returned **NO MATCH for all three**. This is not inferred from version labels: it is a direct comparison of the retrieved `index.ts` contents.

The deployed worker functions lack the candidate's attempt-generation compare-and-set protection. Their source contains blind `upsert` writes and terminal updates without attempt-generation filters. A stale worker may therefore overwrite a newer retry generation's step/run state. The candidate source replaces those writes with conditional generation checks.

The deployed API-key manager uses wildcard CORS and unbounded `req.json()`; the candidate uses the shared exact-origin adapter and bounded streamed JSON parser.

No Edge Function was deployed or modified.

## 2. Exact runtime inventory

All three deployed functions were ACTIVE at version 1 during capture.

| Function | Deployed runtime SHA-256 | Git candidate blob SHA | Exact text match |
|---|---|---|---|
| `simula-workflow-worker` | `91e3dcf52d08f2a426476298fbb3e64ef5f29fa99bf7f2adfb24b80c15a37b5e` | `c61f89f4cc5c40fcbf74e4a1b1490366dfe5c628` | NO |
| `simula-workflow-cron-worker` | `c4e7e7aac6a6c9104fc3f8efd8bfed790256a44d3bda521ef5da6488f6b7de26` | `b5360553ac48a4101b96a32d85cdaec8eefc0346` | NO |
| `ashaa-api-key-manager` | `a4b4ce8cc8e47413e22e54a867f306e7ce51b3880d96a953b4638e2729a51da0` | `536006db5de8118fa2e52f8f4488a356b1aab162` | NO |

Runtime SHA values and Git blob SHAs use different identifier formats and are not directly comparable. The exact-text comparison was performed independently.

## 3. Concrete drift evidence

| Safety property | Auth worker live | Auth worker candidate | Cron worker live | Cron worker candidate |
|---|---:|---:|---:|---:|
| Attempt-generation helper | No | Yes | No | Yes |
| Step-start compare-and-set | 0 | 2 | 0 | 2 |
| Attempt-filtered state writes | 0 | 4 | 0 | 4 |
| Blind upsert | 1 | 0 | 1 | 0 |
| Streamed request body limit | No | Yes | No | Yes |

### Worker stale-generation failure mode

The live workers derive a step attempt from the previous step-run record and write it using `upsert`. Their later step completion/failure updates filter by run, step and owner, but not by the claimed attempt generation. Run completion/failure similarly filters by run, owner and running status without requiring the claim generation.

If an older worker resumes after a retry has claimed a newer generation, it can still write stale step/run state. The candidate worker uses:

- `isAttemptGenerationNewer(storedAttempt, candidateAttempt)`
- `.lt("attempt", stepAttempt)` for step-start compare-and-set
- `.eq("attempt", stepAttempt)` for step completion/failure
- `.eq("attempt", run.attempt)` for run completion/failure
- explicit `superseded` outcomes when the generation no longer matches

This is a high-priority correctness and data-integrity issue for retries and concurrent workers.

### Request body handling

The deployed worker sources rely on Content-Length checks and direct JSON parsing. The candidate uses `readJsonBodyLimited`, which measures actual streamed bytes, cancels an oversized stream, validates UTF-8 and rejects malformed JSON. Content-Length alone is not sufficient because requests can omit or misstate it.

### API-key manager

Live source:

- `Access-Control-Allow-Origin: *`
- direct `await req.json()`
- no exact-origin allowlist adapter

Candidate source:

- `corsHeadersForRequest`
- reject disallowed origins
- `readJsonBodyLimited(req, 2048)`
- malformed and oversized requests fail closed

Before rollout, `INFINITEX_ALLOWED_ORIGINS` must be explicitly configured with the exact intended browser origins. Empty configuration intentionally denies browser origins. Cron-to-cron requests without an Origin header remain supported.

## 4. Candidate source contract tests added

New file: `tests/workers/worker-runtime-parity.test.mjs`

The tests enforce:

1. Authenticated worker uses the exact-origin CORS adapter and streamed body limit.
2. Cron worker authenticates the shared secret and uses bounded JSON parsing.
3. Both worker handlers use attempt-generation fencing on step-start, step terminal writes, and run terminal writes.
4. Blind step-run upserts are prohibited in the candidate handlers.
5. API-key manager uses bounded parsing and no wildcard CORS.
6. Shared CORS logic is exact-match and fails closed for unconfigured browser origins.
7. Shared body parsing measures actual streamed bytes and rejects invalid UTF-8.

These are source-contract checks, not a live deployment test. Existing unit tests separately cover the shared body parser, retry behavior, authentication boundaries, and exact-origin CORS.

## 5. Existing helper behavior already covered

The repository already has focused tests for:

- valid and invalid attempt generations
- stale completion after a newer generation wins
- authenticated owner binding
- cron secret validation
- exact-origin CORS and preview-origin denial
- oversized streamed JSON, malformed JSON and invalid UTF-8
- bounded retries, retryable error classification and elapsed-time limits

Phase 74 adds handler-level wiring checks so a future refactor cannot leave safe helpers implemented but unused by the HTTP handlers.

## 6. Safe rollout strategy

Do not perform a one-shot deployment of all functions.

### Gate A — local/CI verification

- Run worker security unit tests.
- Run auth boundary tests.
- Run new worker runtime parity contract tests.
- Run the full existing test suite and production build in a clean CI environment.
- Verify all candidate imports resolve and shared modules are included in Supabase deployment bundles.

### Gate B — isolated database rehearsal

- Rehearse the candidate API-key column privilege migration in disposable PostgreSQL 17.
- Confirm safe metadata SELECT succeeds and `key_hash` SELECT is denied to authenticated users.
- Confirm only the intended `revoked_at` update remains available.
- Confirm service-role API-key list/create/revoke behavior.
- Run migration rollback/recovery rehearsal on disposable data only.

### Gate C — configuration and operational readiness

- Verify exact `INFINITEX_ALLOWED_ORIGINS` values for intended production browser origin(s).
- Verify cron secret caller, request format, function configuration, and required environment-variable names.
- Confirm service-role credentials remain server-only.
- Confirm scheduled invocation frequency and avoid duplicate cron execution during rollout.
- Define a tested rollback source/version for each function.

### Gate D — human approval

Only after A–C pass, present a function-by-function production rollout plan for explicit approval. No production migration or Edge Function deployment is authorized by this audit.

## 7. Risk register

| ID | Risk | Severity | Required closure |
|---|---|---|---|
| P74-01 | Stale worker can overwrite newer attempt state | HIGH | Deploy and verify attempt-fenced handlers |
| P74-02 | API-key manager wildcard CORS | MEDIUM | Exact-origin policy + config validation |
| P74-03 | Unbounded JSON parsing | MEDIUM | Streamed byte limit + malformed-body tests |
| P74-04 | Candidate and runtime source drift | HIGH | Repeatable release source fingerprint |
| P74-05 | Production configuration unknown | HIGH | Read-only config verification without exposing secret values |

## 8. Safety boundary

- Read-only deployed source retrieval only.
- GitHub branch changes are isolated to this Phase 74 branch.
- No production Edge Function deployment.
- No SQL DDL/DML, GRANT/REVOKE, migration application, secrets retrieval, secret rotation, cron schedule change, Vercel deployment, merge, or billing change.
- Do not mark runtime parity as complete until a post-deployment source comparison confirms exact expected source and a safe smoke test passes.

## 9. Next step

Run the new handler-level source-contract tests alongside existing worker security and authentication tests. Then inspect their CI results and repair any false assumptions in the checks before preparing the isolated database rehearsal.
