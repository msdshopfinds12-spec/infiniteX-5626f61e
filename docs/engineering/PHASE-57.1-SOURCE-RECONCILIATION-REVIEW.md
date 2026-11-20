# Phase 57.1 — Source-Level Reconciliation Review

**Repository:** msdshopfinds12-spec/infiniteX-5626f61e  
**Review date:** 2026-11-21  
**Parent inventory:** Phase 57 / PR #83  
**Related remediation issue:** #84  
**Review mode:** GitHub PR metadata, unified diffs and exact branch-head source reads  
**Disposition:** REVIEW FINDINGS RECORDED — NO SOURCE PORTS OR MERGES

## 1. Executive decision

Do not create the production integration branch by merging PRs #60, #63, #65, #72 and #77 as whole units. They represent separate frontend lineages, authentication boundaries, worker runtime behavior, and database-source recovery work.

Preferred candidate architecture:
- Application and database provenance baseline: PR #77.
- Dependency resolution: PR #78, after removing write-capable CI mutation behavior and verifying exact Node/Vite/plugin compatibility on the candidate SHA.
- Database verification artifacts: PR #79 and PR #81, kept stacked with #77/#78; no live V2 approval is inferred.
- Authentication source: selectively port provider/session modules from PR #60; keep server authorization deny-by-default until the role source is authoritative.
- Workflow API: selectively port PR #65 strict request/DTO contract and owner-scoped status/cancel behavior; enqueue remains 501.
- Worker runtime: PR #63 is not ready to be called a durable retry engine. Pure policy and attempt-domain modules are useful, but retry behavior is not wired into the worker.
- Frontend: select one shell (PR #77 lineage) and port only reviewed deltas from PR #72. Then add PR #60 auth integration without overwriting the chosen shell.

## 2. Concrete source-level findings

### F-01 — Runtime worker does not execute the retry policy

**Severity:** HIGH — functional correctness / reliability  
**Source:** PR #63 head a9568b5cdbf1405f55d3c85304f18ad897920e0a  
**Files:** supabase/functions/simula-workflow-worker/index.ts, src/features/workflows/retry-policy.ts, src/features/workflows/attempt-ledger.ts

Observed:
- Worker Step type includes retry_limit and the database query selects retry_limit and timeout_seconds.
- Worker imports executeWithinStepBudget, but does not import or call decideStepRetry.
- No runtime reference to retry_limit exists after the step is loaded.
- On action failure, the worker records the step as failed and ultimately transitions the workflow run to failed; it does not schedule a persisted retry attempt.
- The attempt-ledger module documents invariants for persistence adapters, but the inspected worker does not use it as a durable retry scheduler.

**Conclusion:** retry policy is currently a domain/pure-logic artifact, not an operational retry implementation. Do not advertise automatic retries as implemented.

**Required implementation:**
1. Define a bounded failure taxonomy: retryable transient, terminal validation/permission, timeout, provider rate limit, and unknown.
2. Persist attempt rows and next-eligible execution time transactionally.
3. Interpret retry_limit consistently as retries after the initial attempt; test the boundary explicitly.
4. Use scheduler/queue redelivery and database next_attempt_at, not in-process sleeping.
5. Ensure idempotency for external side effects before enabling provider/tool actions.
6. Add deterministic crash/replay, duplicate delivery, concurrent claim and stale-generation tests in disposable PostgreSQL.
7. Keep enqueue disabled until all above are independently reviewed.

Issue #84 tracks this remediation.

### F-02 — Dependency remediation workflow has repository write authority

**Severity:** HIGH — CI supply-chain / change-control  
**Source:** PR #78 head 266d55a15fd732462b8c6dcaeee1541b92f8be81  
**File:** .github/workflows/dependency-remediation.yml

Observed:
- Workflow declares permissions: contents: write.
- It generates dependency manifests, commits them from the runner and pushes to the triggering branch.
- It exposes workflow_dispatch and uses a broad engineering/phase-54-* push branch pattern.

**Conclusion:** ordinary dependency verification is coupled to source mutation and receives more repository authority than needed.

**Preferred fix:**
- Set repository permissions to contents: read.
- Generate lockfile candidates in CI and upload them as artifacts.
- Apply dependency changes through a reviewed commit/PR, not an implicit CI push.
- If bot-generated PRs are later desired, isolate that into a separately reviewed workflow using a narrowly scoped GitHub App credential and explicit branch/PR controls.
- Keep verification workflows read-only.

Issue #84 tracks this remediation.

### F-03 — PR #65 correctly keeps enqueue disabled; cancellation is a privileged path requiring explicit race proof

**Severity:** HIGH — authorization / workflow lifecycle  
**Source:** PR #65 head 776e97ffc892dedb4aeb449d136ac80b3af47926  
**Files:** supabase/functions/simula-workflow-api/index.ts, supabase/functions/simula-workflow-api/workflow-api-contract.mjs

Positive controls observed:
- Access token is checked through Supabase Auth getUser(token).
- Browser request schema rejects unknown fields and caller-supplied lifecycle/owner fields.
- Status response uses an explicit DTO allowlist.
- Status reads use the user-scoped client.
- Cancellation uses a conditional update constrained by run ID, verified owner ID and status = queued.
- Enqueue returns HTTP 501 pending atomic idempotency persistence.

Remaining proof required:
- Verify the exact hosted and candidate schema has the expected owner/status columns and RLS policies.
- Prove cancellation-vs-worker-claim race behavior with two concurrent database sessions.
- Verify service-role access is isolated to this one operation and secrets are only server-side.
- Ensure the worker claim and completion transitions use compatible status/generation predicates.
- Keep 501 until unique idempotency storage, request-hash conflict behavior and concurrent duplicate tests pass.

Do not replace the 501 with a direct insert or a preflight-read-then-insert sequence.

### F-04 — Authentication UI snapshot is not authoritative authorization

**Severity:** HIGH — trust boundary  
**Source:** PR #60 head 7606e9fb574acc57138baa02ff36407ae0bd61d5 and PR #62 head f4d08b55159aa1200321f17321754f07cb7ae458  
**Files:** src/features/auth/authorization.ts, supabase/functions/authorization/index.ts

Observed:
- Client capability evaluation explicitly describes itself as a UI projection, not a security boundary.
- PR #62 documents a verified-identity endpoint that returns 503 with no permissions while authoritative membership/role data is unavailable.

**Conclusion:** auth/session modules are a useful reusable frontend foundation, but a signed-in user is not yet a privileged workspace user. Keep protected API operations independently authorized and fail closed.

Required before granting capabilities:
- Identify and document canonical membership/role tables and policy semantics.
- Validate against reviewed Schema Contract V2.
- Add owner/tenant isolation and forbidden-field tests.
- Ensure every sensitive Edge Function checks policy server-side; never trust React state or browser permission arrays.

### F-05 — Frontend overlap is a shell-level conflict, not a safe additive merge

**Severity:** MEDIUM/HIGH — integration correctness  
**Sources:** PR #60, PR #72 and PR #77  
**Files:** src/App.tsx, src/styles/global.css, shared components

Observed:
- PR #60 adds authentication gating and account/session UI to src/App.tsx.
- PR #72 restructures the same app shell, search, local-draft affordance, truthful demo messaging and component props.
- PR #77 also carries the frontend shell/components and CSS in its database-source recovery branch.

**Decision:** use one frontend shell baseline only. Proposed choice is PR #77 shell, with selective behavior ports:
1. Preserve PR #72 truthful demo labels, accessible navigation/search and disabled execution affordances where absent from selected shell.
2. Port PR #60 auth/session provider and screens as isolated modules.
3. Wire auth state into one app boundary; avoid duplicating App.tsx or global CSS wholesale.
4. Add integration tests for anonymous, loading, authenticated-demo, recovery and auth-error states.
5. Keep sample metrics/logs/pipelines visibly marked as demo data.

### F-06 — Quality workflow cancellation policy needs reconciliation

**Severity:** MEDIUM — CI evidence integrity  
**Sources:** PR #60 / #63 quality workflow and PR #77 application/database workflows  
**Files:** .github/workflows/infinitex-quality-gates.yml, .github/workflows/app-ci.yml, .github/workflows/database-contract.yml

Observed:
- InfiniteX quality workflow and application CI use cancel-in-progress: true.
- Database replay / catalog workflows are designed with non-cancelling behavior.

**Decision:** separate fast feedback jobs from authoritative evidence jobs. It is acceptable to cancel superseded lint/build jobs, but database replay, migration integrity and required security evidence should not be silently cancelled by a newer push. The final workflow should make this distinction explicit and preserve exact-SHA evidence.

## 3. File-level source ownership proposal

| File / subsystem | Preferred source | Port / merge rule |
|---|---|---|
| src/App.tsx | PR #77 shell candidate | One shell only; manually port auth/demo deltas |
| src/styles/global.css | PR #77 shell candidate | One stylesheet baseline; port reviewed responsive/auth rules |
| src/features/auth/** | PR #60 | Reuse isolated modules and tests; wire once |
| src/lib/supabase/client.ts | PR #60 | Reuse after package/lockfile contract is unified |
| supabase/functions/_shared/bearer-token.mjs | PR #62/#63 | One shared parser; avoid duplicate implementations |
| supabase/functions/_shared/authorization-policy.mjs | PR #62 | Deny by default; grants unavailable until policy source reviewed |
| supabase/functions/_shared/workflow-actions.mjs | PR #63 | Reuse deterministic safe actions; no arbitrary code/provider execution |
| src/features/workflows/retry-policy.ts | PR #63 | Keep as pure policy; wire only through persisted retry state machine |
| supabase/functions/simula-workflow-worker/** | PR #63 | Not production-ready until durable retry/lease proof is complete |
| supabase/functions/simula-workflow-api/** | PR #65 | Reuse contract/status/cancel selectively; retain enqueue 501 |
| package.json / lockfile | PR #78 candidate | One manifest + generated lockfile; verify exact candidate SHA |
| .github/workflows/** | New reconciled workflow set | Rewrite as coherent matrix; do not merge overlapping YAML blindly |
| supabase/contracts/** | PR #81 capture + reviewed V2 | Never replace reviewed V2 with V1 or synthetic fixture output |

## 4. Canonical integration sequence

1. Approve this source review and PR #83 inventory.
2. Resolve #84 retry-runtime and CI write-permission findings.
3. Select exact PR #77 source commit and PR #78 dependency commit; prove intended ancestry and lockfile root agreement.
4. Create a new candidate branch from approved base SHA (not a stale PR head).
5. Integrate database provenance and verification scripts first; preserve the live V2 gate.
6. Reconcile package manifest/lockfile and CI workflow triggers as one reviewed change.
7. Port PR #60 auth modules; wire them into the selected shell with no duplicate UI implementation.
8. Port PR #62 trusted authorization while it remains deny-by-default.
9. Port PR #65 API contract/status/cancel; keep enqueue 501.
10. Rework PR #63 worker retry/lease persistence before enabling worker execution.
11. Port selected PR #72 UX deltas and add integration tests.
12. Run all checks on the exact integration SHA, then request independent review.

## 5. Release blockers (must remain blockers)

- Reviewed Schema Contract V2 from the intended hosted project is missing.
- Authoritative membership/role source is not verified.
- Durable retry scheduling and lease/heartbeat recovery are not proven.
- Atomic enqueue idempotency and concurrent duplicate handling are not implemented.
- Unified frontend/backend candidate SHA does not exist.
- Integrated test/build/security evidence on that candidate SHA does not exist.

## 6. Evidence boundary

This review used GitHub PR metadata, changed-file lists, unified diffs and exact source files from the named PR heads. It did not run npm, Deno, PostgreSQL, browser tests or CI jobs. Static findings are source-review findings, not runtime exploit confirmation.

No application source, SQL, migration, dependency, workflow, secret, repository setting, branch protection, deployment, live database or billing state was changed by this review. No PR was merged and no production action was performed.

**Next safe action:** human review of findings F-01 and F-02, then implement their fixes in isolated source branches with disposable-only tests and read-only CI permissions.


## 7. Supplemental review — cron worker and attempt-ledger contract

A follow-up source read of the full Phase 51 branch found that the retry gap is not isolated to the user-authenticated worker.

### F-07 — The cron worker also ignores retry_limit

**Severity:** HIGH — duplicate execution path / correctness  
**Source:** PR #63 head a9568b5cdbf1405f55d3c85304f18ad897920e0a  
**File:** supabase/functions/simula-workflow-cron-worker/index.ts

Observed:
- The cron worker selects retry_limit and timeout_seconds.
- It uses the same current-state workflow_step_runs row and run attempt generation pattern.
- It does not call decideStepRetry or planNextStepAttempt.
- Its action failure path marks the step and run failed; it does not persist a distinct next attempt or due time.

**Decision:** both worker entry points must be treated as non-retrying until a single shared, trusted persistence adapter is implemented. Do not fix only one worker and leave the other path behaviorally divergent. Prefer one shared orchestration service used by both authenticated and cron entry points, with distinct authentication/authorization adapters.

### F-08 — Attempt-ledger architecture explicitly says persistence is NOT IMPLEMENTED

**Severity:** CRITICAL — implementation readiness / schema safety  
**Source:** PR #63 head  
**Files:** docs/engineering/PHASE-51.3-DURABLE-STEP-ATTEMPT-LEDGER-CONTRACT.md, docs/engineering/PHASE-51.6B-ATTEMPT-LEASE-DOMAIN.md, docs/engineering/PHASE-51-WORKER-STATE-MACHINE-AND-TEST-MATRIX.md

Observed:
- Phase 51.3 marks the ledger contract “Design-only; no migration or production changes” and “Implementation status: NOT IMPLEMENTED”.
- Phase 51.6B states pure domain code is implemented but persistence wiring is NOT IMPLEMENTED.
- The test matrix explicitly says database/worker integration, concurrency and recovery tests remain unimplemented.
- The ledger contract records that existing workflow_step_runs has UNIQUE (run_id, step_id), so it cannot represent immutable retry history by inserting another row for the same logical step without a reviewed schema change.
- It explicitly warns not to reinterpret workflow_runs.attempt or workflow_step_runs.attempt as the new logical step-attempt counter.

**Conclusion:** adding a call to the pure retry helper inside either worker is not a safe fix. The current schema's one-row-per-run/step projection cannot provide append-only attempt history, durable due scheduling, atomic queue/attempt/projection updates, or lease recovery. The correct implementation requires a reviewed additive persistence contract and disposable database migration/test evidence.

**Hard stop:** no migration SQL or worker persistence adapter should be authored against guessed columns, FK targets, delete actions, uniqueness scopes, or grants. The reviewed hosted V2 snapshot remains required before migration design can be finalized.

### F-09 — Retry jitter formula needs documentation consistency

The pure retry helper implements capped multiplicative jitter:
`rawDelay * (1 - jitterRatio + 2 * jitterRatio * random())`.
The Phase 51.3 contract records this as the current implementation formula, while older architecture text described additive bounded jitter. Reconcile all architecture and test docs to one formula before runtime integration. This is a documentation consistency issue, not a runtime defect in the pure helper.

## 8. Updated implementation disposition

The correct next code phase is not “wire decideStepRetry directly into worker”. It is:
1. Obtain the reviewed live V2 schema snapshot and inspect the full FK/unique/grant/policy/function surface.
2. Approve a logical-to-physical mapping for append-only attempts, due scheduling, lease fencing, and enqueue idempotency.
3. Implement the persistence adapter/RPCs in a disposable database branch with least-privilege grants.
4. Integrate both worker entry points through the same adapter.
5. Prove concurrency, duplicate delivery, crash recovery, cancellation arbitration, stale lease rejection and provider idempotency.
6. Keep enqueue and external side effects disabled until independent review.

This supplemental review does not authorize a schema migration or worker runtime change.
