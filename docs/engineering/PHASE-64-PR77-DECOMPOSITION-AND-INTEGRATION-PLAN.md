# Phase 64 — PR #77 Decomposition and Canonical Integration Plan

**Status:** DECOMPOSITION INVENTORY VERIFIED; EXTRACTION NOT YET EXECUTED  
**Date:** 2026-11-21  
**Source PR:** #77, open draft  
**Source branch:** `engineering/phase-52-1k-clean-room-replay-preparation`  
**Source head:** `445aa24e24dcaa9b7d6519a56ec5ec48e2811180`  
**Common base:** `main` at `4538bd0cceb3d2ee6adbaf36777047108229cf3c`  
**Target:** small, dependency-aware review slices; no production mutation

## 1. Decision

PR #77 has exactly 106 changed paths. Do not merge it as one unit and do not discard/rewrite it. Preserve it as the source-of-truth evidence branch while extracting independently reviewable slices into new branches rooted at the recorded common base.

The 106 paths have been classified into five mutually exclusive inventory groups:

| Group | Paths | Intended slice |
|---|---:|---|
| A — Migration provenance and integrity | 35 | Recovered SQL payloads, exact SHA-256 manifest, candidate classification, integrity/provenance/side-effect validators and tests |
| B — Disposable replay harness | 11 | Reconstructed noncanonical baseline, replay runner, security/replay fixture documentation and tests |
| C — Schema Contract V2 | 16 | Read-only capture, contract validator/snapshot, catalog evidence and database contract workflow |
| D — Product/UI and app CI | 19 | React UI, theme, accessibility test, app CI, package/build and Vercel configuration |
| E — Cross-cutting evidence and supporting tests | 25 | Historical evidence, schema diff, bootstrap findings, routine metadata, read-only capture/security tests and supporting documentation |
| **Total** | **106** | **All source paths accounted for** |

No file was omitted from the inventory. Exact source paths were obtained from GitHub's complete paginated changed-file listing for PR #77.

## 2. Exact source inventory by slice

### Slice A — Migration provenance and integrity (35 paths)

Includes:

- `docs/database/MIGRATION-LEDGER-RECOVERY-MANIFEST.json`
- `docs/database/MIGRATION-PROVENANCE-CLASSIFICATION.json`
- `docs/database/MIGRATION-RECOVERY.md`
- `docs/database/PHASE-4N19-CROSS-BRANCH-MIGRATION-PROVENANCE.md`
- `docs/database/PHASE-52.1A-MIGRATION-PROVENANCE.md`
- `docs/database/PHASE-52.1H-MIGRATION-PROVENANCE-AND-REPLAY.{json,md}`
- `docs/database/migration-side-effect-policy.json`
- `scripts/audit-migration-side-effects.mjs`
- `scripts/check-migration-integrity.mjs`
- `scripts/verify-migration-provenance.mjs`
- `scripts/verify-recovered-migration-manifest.mjs`
- All 20 SQL paths under `supabase/migrations/` (19 ledger-recovered payloads plus one separately classified candidate)
- `tests/database/check-migration-integrity.test.mjs`
- `tests/database/migration-provenance.test.mjs`
- `tests/database/migration-side-effect-audit.test.mjs`

**Gate:** manifest SHA-256 validation, exact migration classification, duplicate/version/path rejection, candidate remains `PROPOSED_NOT_APPLIED`, and side-effect policy tests pass. No SQL execution against a hosted project.

### Slice B — Disposable replay and security harness (11 paths)

Includes:

- `docs/database/PHASE-52.1B-POSTGRES-SECURITY-TESTS.md`
- `docs/database/PHASE-52.1C-MIGRATION-REHEARSAL.md`
- `docs/database/PHASE-52.1D-RECONSTRUCTED-BASELINE.{json,md}`
- `docs/database/PHASE-52.1K-CLEAN-ROOM-REPLAY-PREPARATION.{json,md}`
- `docs/database/PHASE-52.1L-DISPOSABLE-POSTGRES-REPLAY-EVIDENCE.{json,md}`
- `scripts/rehearse-migration-chain.mjs`
- `tests/database/phase-52-1d-assert-workflow-baseline.sql`
- `tests/database/phase-52-1d-reconstructed-workflow-baseline.sql`

**Dependencies:** Slice A's migration files, manifest and validators; cross-cutting PostgreSQL security/replay tests in Slice E.

**Gate:** fresh disposable PostgreSQL 17 environment, exact manifest verification before execution, fail-fast replay, no production credentials/network route, explicit noncanonical fixture classification, cleanup and exact-head evidence.

### Slice C — Schema Contract V2 and read-only catalog gate (16 paths)

Includes:

- `.github/workflows/database-contract.yml`
- `docs/database/PHASE-4N21-CATALOG-CONTRACT-CAPTURE.md`
- `docs/database/PHASE-51.6L-COMPLETE-CATALOG-CONTRACT.md`
- `docs/database/PHASE-52.1E-LIVE-CATALOG-EVIDENCE.{json,md}`
- `docs/database/PHASE-52.1G-NORMALIZED-CATALOG-REPORT.md`
- `docs/database/PHASE-52.1G-NORMALIZED-LIVE-CATALOG.json`
- `docs/database/PHASE-52.1M-SCHEMA-CONTRACT-V2-READINESS.{json,md}`
- `docs/database/READ-ONLY-CATALOG-CAPTURE.md`
- `docs/database/RPC-CONTRACT.md`
- `docs/database/live-schema-metadata.snapshot.json`
- `scripts/check-database-contract.mjs`
- `supabase/contracts/capture-database-contract.readonly.sql`
- `supabase/contracts/database-contract.snapshot.json`
- `tests/database/check-database-contract.test.mjs`

**Dependencies:** provenance evidence from Slice A and explicit classification of the reconstructed baseline from Slice B.

**Gate:** V2 schema validation remains fail-closed. The existing V1 snapshot must not be relabeled or manually promoted. A complete, authorized, metadata-only V2 capture must remain pending genuine human review. No secrets, application rows, or writes.

### Slice D — Product UI and app CI (19 paths)

Includes:

- `.github/workflows/app-ci.yml`
- `docs/engineering/PHASE-53.1-MOBILE-NAV-ACCESSIBILITY-CI.{json,md}`
- `docs/engineering/PHASE-53.2-DEPENDENCY-AUDIT-AND-DEV-SERVER-HARDENING.{json,md}`
- `docs/engineering/PHASE-53.3-LATEST-CI-AND-DATABASE-GATE-STATUS.{json,md}`
- `package.json`
- `src/App.tsx`
- `src/components/AgentList.tsx`
- `src/components/LogStream.tsx`
- `src/components/PipelineBoard.tsx`
- `src/components/Sidebar.tsx`
- `src/components/TopBar.tsx`
- `src/hooks/useTheme.ts`
- `src/styles/global.css`
- `tests/app/sidebar-accessibility.test.mjs`
- `vercel.json`
- `vite.config.ts`

**Gate:** inspect dependency and lockfile implications, validate responsive/mobile navigation and accessibility behavior, run existing app tests, lint and production build. No deployment.

### Slice E — Cross-cutting evidence and supporting tests (25 paths)

Includes:

- `docs/database/PHASE-4N10-GITHUB-EVIDENCE-AND-RECOVERY-REPORT.md`
- `docs/database/PHASE-4N14-CONTRACT-VALIDATOR-HARDENING.md`
- `docs/database/PHASE-4N16-MIGRATION-INTEGRITY-DEEP-FIX.md`
- `docs/database/PHASE-4N17-CROSS-BRANCH-ARTIFACT-PROVENANCE.md`
- `docs/database/PHASE-4N18-CI-SOURCE-READINESS-CLASSIFICATION.md`
- `docs/database/PHASE-4N20-LIVE-LEDGER-RECOVERY.md`
- `docs/database/PHASE-52.1F-SCHEMA-RECONCILIATION.{json,md}`
- `docs/database/PHASE-52.1G-SCHEMA-DIFF.json`
- `docs/database/PHASE-52.1I-HISTORICAL-SOURCE-RECOVERY.{json,md}`
- `docs/database/PHASE-52.1J-CANONICAL-BOOTSTRAP-INVESTIGATION.{json,md}`
- `docs/database/PHASE-52.1N-DISPOSABLE-CI-EVIDENCE.{json,md}`
- `docs/database/PHASE-52.1O-ROUTINE-METADATA-CI-EVIDENCE.{json,md}`
- `docs/database/SCHEMA-PROVENANCE.md`
- `supabase/contracts/README.md`
- `tests/database/catalog-capture-readonly.test.mjs`
- `tests/database/phase-52-1b-postgres-security.sql`
- `tests/database/phase-52-1b-postgres-security.test.mjs`
- `tests/database/phase-52-1c-migration-rehearsal.test.mjs`
- `tests/database/phase-52-1c-platform-bootstrap.sql`
- `tests/database/platform-api-key-column-grants.test.mjs`

**Handling:** E is not a standalone merge unit. Attach each evidence artifact and test to its owning slice (A, B, or C) after dependency review. Keep a path-to-slice mapping and ensure every one of the 25 paths lands exactly once. The API-key grants test belongs with the candidate migration's security review, not as production grant authorization.

## 3. Dependency order and proposed extraction sequence

1. **A — provenance/integrity.** Establish the recovered migration inputs and their explicit status first.
2. **B — disposable replay/security.** Consume A's exact migration inputs. Keep reconstructed baseline labeled noncanonical.
3. **C — schema contract.** Consume A/B evidence. Keep V2 source-readiness gate blocked until the authoritative capture and reviewer approval exist.
4. **D — product/UI.** Can be reviewed independently, but app CI must be rerun against the final combined candidate.
5. **Integration checkpoint.** Compare each slice to the current integration base; inspect conflicts and cross-slice assumptions; do not batch-merge.
6. **Phase 51/60/62 workflow stack.** Integrate only after the canonical schema contract is reviewed and the branch graph is understood.

## 4. Extraction mechanics

For every extracted slice:

- Create a new branch from a recorded integration-base SHA.
- Copy exact source file bytes from PR #77's recorded head; do not hand-retype SQL or manifests.
- Record source path, source blob SHA, destination blob SHA, and source commit for each copied file.
- Verify byte-for-byte blob equivalence for all copied files.
- Do not alter migration contents, timestamps, order, hashes, classifications, or side-effect policy during extraction.
- Do not drop any path. A source-to-destination coverage check must prove every PR #77 path is either assigned exactly once or explicitly retained in the original evidence PR.
- Run slice-specific tests plus combined CI on exact candidate SHA.
- Preserve PR #77 as the historical source until all replacement slices are reviewed and an authorized maintainer decides what to do with it.

If a slice needs changes beyond exact extraction, make those changes in a subsequent fix commit with separate review evidence; do not mix them with byte-preserving extraction.

## 5. Why no blind cherry-pick or merge

The Phase 52 branch and Phase 51/60 branch are divergent. Their histories contain overlapping but differently evolved database, workflow and worker contracts. GitHub compare showed divergence when comparing the stacks directly. A merge commit can introduce duplicated migrations, stale snapshots, conflicting workflow semantics, or incompatible app/worker implementations.

Do not resolve conflicts by choosing one entire branch side. Review semantic ownership path by path.

## 6. Existing blockers that remain blockers

- Schema Contract V2 is not authoritative/review-approved; current committed snapshot is V1.
- Phase 52 replay uses a reconstructed noncanonical baseline.
- Original Git blob provenance of recovered migrations is not established; ledger-statement-to-recovered-file exact matches are recorded separately.
- The separately classified API-key hardening migration remains candidate-only and production approval is not granted.
- Phase 60 has no concrete production PostgreSQL adapter.
- Phase 62 uses a synthetic schema, not live-schema compatibility proof.
- Deployed/tracked worker drift remains unresolved.
- No production migration, worker rollout, cron change, or deployment is approved.

## 7. Acceptance checklist

- [ ] All 106 source paths assigned exactly once across A–E.
- [ ] Each slice has a recorded source SHA and base SHA.
- [ ] Every extracted file passes blob-equivalence verification.
- [ ] Migration manifest and candidate classifications unchanged.
- [ ] No SQL runs against hosted Supabase.
- [ ] Disposable replay and security tests pass on exact slice head.
- [ ] V2 validator remains fail-closed until real review.
- [ ] Product/UI tests and build pass on exact D head.
- [ ] Combined CI passes on the candidate integration SHA.
- [ ] PR #77 remains preserved until replacement slices are reviewed.
- [ ] Human review and merge authorization recorded separately.

## 8. Safety and execution boundary

This phase is a decomposition plan and inventory only. It does not copy or rewrite the 106 source files, modify PR #77, run migrations, access Supabase, change secrets/grants/RLS/cron, merge PRs, or deploy.

**Phase 64 result: INVENTORY PASS; EXTRACTION NOT STARTED.** The next implementation action is Slice A exact-byte extraction, followed by its own integrity CI.

## 9. Cross-cutting E assignment — completed

The 25 Group E paths have now been assigned exactly once to their owning slices and extracted with exact source/destination Git blob SHA equality.

### E → A — migration provenance and recovery (7 paths)

- `docs/database/PHASE-4N10-GITHUB-EVIDENCE-AND-RECOVERY-REPORT.md`
- `docs/database/PHASE-4N16-MIGRATION-INTEGRITY-DEEP-FIX.md`
- `docs/database/PHASE-4N17-CROSS-BRANCH-ARTIFACT-PROVENANCE.md`
- `docs/database/PHASE-4N18-CI-SOURCE-READINESS-CLASSIFICATION.md`
- `docs/database/PHASE-4N20-LIVE-LEDGER-RECOVERY.md`
- `docs/database/PHASE-52.1I-HISTORICAL-SOURCE-RECOVERY.json`
- `docs/database/PHASE-52.1I-HISTORICAL-SOURCE-RECOVERY.md`

Destination: PR #96 / `engineering/phase-64a-migration-provenance`.

### E → B — disposable replay and security (8 paths)

- `docs/database/PHASE-52.1J-CANONICAL-BOOTSTRAP-INVESTIGATION.json`
- `docs/database/PHASE-52.1J-CANONICAL-BOOTSTRAP-INVESTIGATION.md`
- `docs/database/PHASE-52.1N-DISPOSABLE-CI-EVIDENCE.json`
- `docs/database/PHASE-52.1N-DISPOSABLE-CI-EVIDENCE.md`
- `tests/database/phase-52-1b-postgres-security.sql`
- `tests/database/phase-52-1b-postgres-security.test.mjs`
- `tests/database/phase-52-1c-migration-rehearsal.test.mjs`
- `tests/database/phase-52-1c-platform-bootstrap.sql`

Destination: PR #97 / `engineering/phase-64b-disposable-replay`.

### E → C — schema contract and catalog evidence (10 paths)

- `docs/database/PHASE-4N14-CONTRACT-VALIDATOR-HARDENING.md`
- `docs/database/PHASE-52.1F-SCHEMA-RECONCILIATION.json`
- `docs/database/PHASE-52.1F-SCHEMA-RECONCILIATION.md`
- `docs/database/PHASE-52.1G-SCHEMA-DIFF.json`
- `docs/database/PHASE-52.1O-ROUTINE-METADATA-CI-EVIDENCE.json`
- `docs/database/PHASE-52.1O-ROUTINE-METADATA-CI-EVIDENCE.md`
- `docs/database/SCHEMA-PROVENANCE.md`
- `supabase/contracts/README.md`
- `tests/database/catalog-capture-readonly.test.mjs`
- `tests/database/platform-api-key-column-grants.test.mjs`

Destination: PR #98 / `engineering/phase-64c-schema-contract-v2`.

### Boundary notes

- The original 16-path C inventory includes `live-schema-metadata.snapshot.json`; it was extracted with B as an explicit C dependency and is inherited unchanged by C. It is not a second E artifact.
- `.github/workflows/phase-64b-disposable-replay.yml` is a newly authored B-slice CI workflow, not one of the 106 source paths.
- The 19-path D inventory is independent and remains in PR #99.
- No E artifact is a standalone merge unit. All 25 have an owner and exact extraction evidence.

**E assignment result: 25/25 assigned exactly once; no unassigned source paths remain.**

