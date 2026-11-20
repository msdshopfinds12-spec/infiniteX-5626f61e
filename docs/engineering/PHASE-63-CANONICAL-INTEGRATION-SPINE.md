# Phase 63 — Canonical Integration Spine and Repository Reconciliation

**Status:** READ-ONLY REPOSITORY RECONCILIATION COMPLETE; INTEGRATION PLAN ONLY  
**Date:** 2026-11-21  
**Base:** `main` at `4538bd0cceb3d2ee6adbaf36777047108229cf3c`  
**Scope:** Git history, branch topology, open PR stacks, database provenance evidence, and CI results  
**Production authorization:** NONE

## 1. Executive decision

Do not start another migration-recovery implementation and do not merge the existing draft PRs as a batch.

The repository already contains a substantial Phase 52 database-provenance and disposable-replay stack. The recent Phase 60–62 work exists on a separate, divergent workflow-engine stack. The highest-risk problem is now **integration topology and evidence reconciliation**, not absence of migration tooling.

The next safe move is to establish one reviewed integration spine from `main`, split oversized changes into reviewable dependency slices, and rerun combined application/database CI on exact commits. No schema adapter or production migration should be built against a synthetic schema or a stale V1 snapshot.

## 2. Verified repository and PR topology

Repository: `msdshopfinds12-spec/infiniteX-5626f61e`  
Default branch: `main`  
Main SHA inspected: `4538bd0cceb3d2ee6adbaf36777047108229cf3c`

| PR | Head branch | Base branch | Head SHA | State |
|---|---|---|---|---|
| #77 | `engineering/phase-52-1k-clean-room-replay-preparation` | `main` | `445aa24e24dcaa9b7d6519a56ec5ec48e2811180` | Open draft |
| #87 | `docs/phase-58-attempt-contract-reconciliation` | `main` | `a3da4a9ba2b5283ea7f2f276dfbdf299a18aaf71` | Open draft |
| #91 | `feat/phase-60-transactional-retry-orchestration` | `feat/phase-51-durable-workflow-engine` | `c46e64d20e7d93ba212490cc357e1ff0b7d6b953` | Open draft |
| #92 | `docs/phase-61-schema-contract-v2` | `feat/phase-51-durable-workflow-engine` | `4aff3c4b0e16ac1b9d42c83de02810e376c3f044` | Open draft |
| #93 | `test/phase-62-postgres-contract-harness` | `feat/phase-60-transactional-retry-orchestration` | `e751b5d6d41181d296250734920e8b94de0ba482` | Open draft |

All five inspected PRs remain unmerged. Do not interpret an open/draft PR or a mergeable flag as approval to merge.

### Branch divergence evidence

GitHub compare results show:

- `feat/phase-51-durable-workflow-engine` is 212 commits ahead of `main`.
- Comparing `engineering/phase-52-1k-clean-room-replay-preparation` against `feat/phase-51-durable-workflow-engine` reports **diverged**: 157 commits ahead on the Phase 52 side and 212 commits behind it.
- Comparing `feat/phase-60-transactional-retry-orchestration` against the Phase 52 branch reports **diverged**: 225 commits ahead on the Phase 60 side and 157 commits behind it.

These are not safe fast-forward relationships. A blind merge or cherry-pick can duplicate or overwrite application, auth, worker, migration, and contract changes. Build a file-level and commit-level integration map before combining them.

## 3. Existing database provenance work — do not duplicate

The Phase 52 branch already contains:

- 19 ledger-recovered SQL migration payloads under `supabase/migrations/`.
- `MIGRATION-LEDGER-RECOVERY-MANIFEST.json` with per-file SHA-256 values and source limitations.
- `MIGRATION-PROVENANCE-CLASSIFICATION.json` separating the candidate API-key migration from the 19 recovered ledger entries.
- Offline migration-integrity, provenance, side-effect, and read-only catalog validators.
- PostgreSQL 17 disposable migration replay tooling.
- Disposable catalog and security behavior tests.
- Schema Contract V2 read-only capture SQL and a fail-closed validator.

Important provenance semantics:

1. The 19 files are recovered payloads from the applied database migration ledger.
2. Their exact ledger-statement-to-recovered-file matches are recorded as verified.
3. Original historical Git blob equivalence is **NOT VERIFIED**.
4. The recovered ledger contains no rollback SQL bodies.
5. The API-key column-hardening migration is separately classified as `PROPOSED_NOT_APPLIED`, `NOT_VERIFIED_LIVE`, and `NOT_GRANTED`.
6. Never relabel recovered payloads as original Git source or apply them to the source production database.

### Existing disposable replay evidence

The Phase 52.1O report and exact PR #77 head workflow run show:

- Application CI: PASS — run [44766597392](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44766597392).
- Disposable PostgreSQL 17 migration-chain replay: PASS.
- Recovered migration files replayed: 19.
- Disposable catalog execution: PASS.
- Disposable PostgreSQL security behavior tests: PASS.
- Offline provenance and validator tests: PASS.
- Database Contract Gate: FAIL at the intentional source-readiness enforcement step — run [44766597311](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44766597311).

The failure is not evidence that the disposable SQL replay failed. The job breakdown shows the replay, catalog, and security jobs passed. The offline contract gate remains merge-blocking because the committed snapshot is V1/incomplete and has not been replaced with an authoritative, reviewed V2 capture.

### Canonicality limitation

The replay uses a separately classified reconstructed workflow baseline. It is explicitly disposable and noncanonical. Therefore:

- Replay PASS does not prove that the 19 recovered migrations alone build the canonical production schema from an empty database.
- Disposable security tests do not prove live Supabase parity.
- A fresh V2 capture from the independently verified intended project, followed by real human review, remains required.
- Do not weaken the validator, edit V1 to look like V2, or fabricate reviewer approval.

## 4. Phase 60–62 evidence — useful but separate

### Phase 60 / PR #91

The transactional retry orchestration contract is application-level code with an adapter interface and in-memory fake. Exact-head GitHub Actions run [44776405013](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44776405013) passed.

This does not provide a production PostgreSQL adapter.

### Phase 61 / PR #92

The schema reconciliation document records the existing workflow projection, RLS/grant findings, cron infrastructure, and deployed-versus-tracked worker drift. Exact-head quality gate [44777494648](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44777494648) passed.

It is a design/evidence document, not approval to migrate or deploy.

### Phase 62 / PR #93

The disposable PostgreSQL 17 attempt/outbox contract harness verifies synthetic retry, idempotency, rollback, fencing, owner mismatch, retry exhaustion, cancellation separation, terminal immutability, and a two-session claim race.

Exact-head runs passed:

- [Quality gates — 44778692170](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44778692170)
- [PostgreSQL contract — 44778692216](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44778692216)

The schema is synthetic and isolated under `phase62`. It is not a production migration and does not prove compatibility with the live workflow tables.

## 5. Critical integration risks

| Risk | Evidence | Required control |
|---|---|---|
| Divergent PR stacks | Phase 52 and Phase 51/60 histories diverged | Build a dependency-aware integration branch; no blind merge |
| Oversized Phase 52 PR | PR #77 changes 106 files, +25,711/-434 | Split into independently reviewable slices where possible |
| Legacy contract snapshot | V1 snapshot; V2 validator requires V2 | Keep DB Contract Gate blocked until authoritative V2 review |
| Noncanonical replay baseline | Reconstructed disposable fixture | Preserve noncanonical label; do not treat as production bootstrap |
| Recovered SQL provenance | Ledger payloads, not verified original Git blobs | Preserve recovery classification and SHA-256 manifest |
| Synthetic Phase 62 schema | Test-only `phase62` schema | Reconcile adapter against reviewed real schema before implementation |
| Worker source drift | Phase 61 inspection records deployed/tracked mismatch | Re-fetch deployed versions and tracked source before rollout |
| Existing step projection | `UNIQUE (run_id, step_id)` on `workflow_step_runs` | Keep projection; do not reuse it as append-only attempt history |
| Active cron workers | Existing scheduled jobs | No cron edits until worker rollout and rollback are reviewed |

## 6. Canonical integration strategy

### Gate A — Freeze and inventory

- Keep PRs #77, #87, #91, #92, and #93 open and draft.
- Record exact head SHAs and CI results.
- Inventory every changed path and commit dependency.
- Detect duplicate implementations and conflicting versions of shared worker/domain code.
- Preserve the existing migration provenance and side-effect policy.

### Gate B — Decompose the oversized database stack

Review PR #77 and extract coherent, independently testable slices without changing SQL payload bytes:

1. Migration recovery manifest, classification, integrity and side-effect validators.
2. Disposable migration replay harness and its reconstructed-baseline evidence.
3. Disposable PostgreSQL security behavior suite.
4. Schema Contract V2 capture SQL, validator, and fail-closed readiness documentation.
5. Remaining application/auth/frontend changes, reviewed separately.

Each slice must preserve its dependency and provenance metadata. Do not delete or silently omit any original PR #77 changes.

### Gate C — Establish the canonical integration branch

- Use `main` as the common ancestor and preserve it unchanged until slice reviews pass.
- Build a new integration branch from a recorded `main` SHA.
- Integrate only reviewed, logically complete slices in dependency order.
- Prefer small, auditable PRs over a single 25k-line change.
- Do not rewrite existing PR branches or force-push them as part of this documentation phase.
- Re-run application CI and database contract gates after each integration slice.

### Gate D — Integrate durable attempts

Only after the canonical schema evidence is available:

- Rebase/reconstruct the Phase 58/60/62 work as a new reviewed stack on the canonical integration base; preserve original PRs as evidence.
- Keep logical attempt number, run claim generation, lease generation, idempotency key, and outbox delivery count distinct.
- Implement the actual PostgreSQL adapter using the verified live foreign keys, constraints, grants, RLS, routines, and existing projection.
- Prove atomic attempt terminalization + next-attempt insert + projection update + outbox insert in one database transaction.
- Test duplicate delivery, process restart, lease expiry, concurrent claim, stale worker, cancellation, owner isolation, and rollback.
- Do not perform provider/network side effects inside the database transaction.

### Gate E — Worker parity and integration

- Re-fetch both deployed Edge Function versions through authorized read-only inspection.
- Compare exact deployed source with tracked worker source.
- Resolve source drift in Git before deployment.
- Replace in-memory retry loops with durable database orchestration only after adapter and integration tests pass.
- Enforce real execution timeout and cancellation semantics.
- Keep cron secrets and Vault values out of source, logs, and test artifacts.
- No worker deployment or cron mutation without a separate explicit approval.

### Gate F — Product and release verification

- Validate real frontend flows against trusted API contracts; remove demo/static behavior only when a verified replacement exists.
- Verify mobile responsiveness, keyboard/accessibility behavior, loading/error/empty states, and authorization boundaries.
- Run unit, integration, security, database, and browser-level tests on exact candidate SHA.
- Complete independent code/security review and rollback rehearsal.
- Require human release approval before merge or deployment.

## 7. Acceptance criteria for declaring the integration spine ready

- [ ] Branch topology and PR dependency graph reviewed.
- [ ] Phase 52 oversized changes decomposed and their source payloads preserved.
- [ ] Migration provenance manifest and side-effect audit pass.
- [ ] Authoritative Schema Contract V2 captured from the intended project.
- [ ] Project identity, scope, role/grant, RLS, routine, trigger, extension and type metadata independently reviewed.
- [ ] Database Contract Gate passes on the exact candidate SHA.
- [ ] Canonical empty-database replay or a clearly justified canonical bootstrap path is established; reconstructed fixture remains separately classified.
- [ ] Phase 60 adapter uses actual verified schema, not the synthetic Phase 62 schema.
- [ ] PostgreSQL concurrency, idempotency, fencing, rollback and tenant-isolation tests pass.
- [ ] Deployed and tracked worker sources are reconciled.
- [ ] Frontend/API integration is verified end-to-end.
- [ ] Independent review and explicit release approval recorded.

## 8. Safety boundaries

This phase is documentation and GitHub metadata only.

- No Supabase project connection or database writes.
- No migration execution or schema change.
- No RLS/policy/grant/function/cron changes.
- No secrets or Vault values read.
- No Edge Function or Vercel deployment.
- No merge, force-push, branch deletion, or billing change.
- No provider execution.

## 9. Current decision

**Phase 63 repository reconciliation: PASS for discovery; integration remains BLOCKED.**

The best next implementation is not another standalone database harness. It is a carefully decomposed canonical integration spine that brings the already-existing Phase 52 provenance/replay controls together with the Phase 51/60 durable workflow domain and Phase 62 attempt tests.

Do not claim InfiniteX is complete or production-ready until all acceptance criteria above are supported by exact-head evidence.
