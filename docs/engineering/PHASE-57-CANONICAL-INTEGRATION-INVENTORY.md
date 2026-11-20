# Phase 57 — Canonical Integration Inventory

**Snapshot date:** 2026-11-21  
**Repository:** `msdshopfinds12-spec/infiniteX-5626f61e`  
**Inventory branch:** `engineering/phase-57-integration-inventory` (documentation-only, based on `main`)  
**Decision status:** REVIEW REQUIRED — no integration branch has been authorized.

## 1. Executive decision

InfiniteX currently has several draft implementation lineages. They are not safe to merge independently. The strongest low-risk strategy is:

1. Treat PR #77 as the **database-source recovery and disposable-verification candidate spine**, not as a production-ready application release.
2. Retain PRs #78, #79 and #81 as the stacked dependency/database-evidence work on that spine. Their exact-head checks are useful evidence, but the V2 live-schema gate remains blocked.
3. Treat PRs #60 → #62 → #63 → #64 → #65 as a separate authentication/authorization/workflow-API lineage. Port compatible backend modules and contracts onto a future integration candidate only after a file-level and behavior-level review.
4. Do not merge PR #72 independently: PR #77 already changes the same frontend shell and styles. Compare the actual implementations and select one UI source, then port only missing behavior.
5. Do not use PR #71 as a package/configuration source until its Vite and deployment settings are reconciled with the Vite 8 dependency baseline in PR #78.
6. Keep enqueue disabled. PR #65 intentionally returns 501 until transactional idempotency persistence and concurrency tests exist.
7. Preserve the Schema Contract V2 fail-closed gate. A disposable capture passing is not evidence of hosted-project parity.

This document is an inventory and sequencing proposal. It does not authorize merge, cherry-pick, migration, deployment, or production access.

## 2. Repository and PR state observed

Repository metadata: public repository; default branch `main`; write permission available to the connected GitHub identity. The default branch is used only as the base for this documentation branch.

| PR | Base → head | Scope / evidence | Integration disposition |
|---|---|---|---|
| #60 | `eng/infinitex-unified-ui-backend-2026-11-20` → `eng/infinitex-p0-p1-auth-2026-11-20` | Auth SDK, recovery, fail-closed bootstrap, client capability UX contract; exact-head CI recorded successful | Backend/auth source candidate; do not take its whole App/CSS/package diff blindly |
| #62 | #60 head → `feat/phase-50-trusted-authorization` | JWT verification, deny-by-default authorization endpoint, CORS/request boundary; latest documentation commit CI not confirmed in PR body | Dependent on #60; preserve 503 policy-unavailable behavior until role governance exists |
| #63 | #62 head → `feat/phase-51-durable-workflow-engine` | Retry policy, attempt-ledger design, worker hardening; retry persistence/lease recovery still incomplete | Dependent on #62; pure policy is reusable, but not a durable engine yet |
| #64 | #63 head → `feat/phase-52-trusted-workflow-api-plan` | Workflow API plan and workflow CI filters; PR reports mergeable=false | Plan-only; resolve ancestry and workflow filters before any retarget |
| #65 | #64 head → `feat/phase-52-workflow-api-contract-auth` | Validated API contract, verified JWT identity, owner-scoped status, queued-only cancel; enqueue returns 501 | Candidate API boundary; retain 501 until database idempotency is implemented and proven |
| #71 | `engineering/phase-51-6l-complete-catalog-contract-v2` → `engineering/phase-51-7-vite-ci-hardening` | Application CI, package manifest and Vercel config | Configuration candidate only; compare against PR #78 before selecting |
| #72 | #71 head → `engineering/phase-52-0-functional-frontend` | Demo-truthful frontend, search/filter, responsive UI, disabled execution | Do not merge as a separate UI stack if #77 is selected; compare component behavior and port deltas only |
| #73 | #72 head → `engineering/phase-52-1a-migration-provenance` | Migration provenance and verification tests | Historical parent in the database recovery lineage |
| #74 | #73 head → `engineering/phase-52-1b-postgres-security-tests` | Disposable PostgreSQL owner-isolation/security fixture | Retain tests and evidence; do not treat fixture as hosted RLS proof |
| #75 | #74 head → `engineering/phase-52-1c-migration-rehearsal` | Disposable migration-chain rehearsal | Retain exact migration rehearsal evidence |
| #76 | #75 head → `engineering/phase-52-1d-reconstructed-baseline` | Explicitly noncanonical reconstructed workflow baseline | Do not promote reconstructed baseline as canonical hosted schema |
| #77 | `main` → `engineering/phase-52-1k-clean-room-replay-preparation` | 106 changed files: recovered migrations, database provenance, V2 capture readiness, frontend, package/Vite config and tests | Best candidate database-source recovery spine; still draft and V2-blocked |
| #78 | #77 head → `engineering/phase-54-vite8-security-remediation` | Vite 8.3.8, React plugin 6.3.0, regenerated lockfile; zero-audit/build evidence recorded | Preferred dependency baseline subject to review of exact lockfile and CI |
| #79 | #78 head → `engineering/phase-55-disposable-database-replay` | Non-cancelling disposable migration replay and Owner A/B security tests; exact-head runs recorded successful | Keep stacked with #77/#78; disposable-only evidence |
| #81 | #79 head → `engineering/phase-56-catalog-completeness` | Read-only catalog capture completeness, V2 validator and disposable PostgreSQL capture smoke; application CI recorded successful | Keep draft; live V2 capture and independent review remain blockers |

**PR #80:** lookup returned GitHub 404. No PR #80 is included in this inventory; confirm whether it was deleted, renumbered, or never created before relying on references to it.

## 3. Confirmed overlap and risk matrix

| Hotspot | PRs / lineages | Risk | Required treatment |
|---|---|---|---|
| `src/App.tsx`, `src/styles/global.css` | #60, #72, #77 | High — auth bootstrap, demo shell and layout may overwrite one another | Choose one shell baseline; manually port auth state and UI behavior in small reviewed changes |
| `package.json`, `package-lock.json` | #60, #63, #77, #78; also #71 | Critical — lockfile is a generated resolution graph, not a mergeable text list | Select one manifest, regenerate lockfile from it, then run install/audit/typecheck/test/build on exact candidate SHA |
| `.github/workflows/infinitex-quality-gates.yml` | #60, #62, #63, #64 | High — branch filters, permissions, concurrency and job coverage can be lost | Reconcile workflow as one complete file; preserve least-privilege permissions and non-cancelling critical database gates |
| `.github/workflows/app-ci.yml`, database workflows | #71, #73–#81 | High — workflow triggers and required checks vary by stacked base | Define one authoritative trigger matrix; verify exact PR-head runs after final integration |
| Supabase Edge Functions / shared auth | #60, #62, #63, #65 | Critical — identity parsing, policy decisions and worker trust boundaries must agree | One shared strict Bearer parser; JWT identity verified server-side; no caller-supplied owner/role; fail closed |
| Workflow persistence | #63, #65, #77 | Critical — retry policy and API exist without complete transactional persistence | Keep enqueue disabled until schema, RPC, unique idempotency constraint, attempt history and concurrency behavior pass disposable tests |
| Frontend demo / workflow actions | #72, #77, #60 | High — UI could imply live execution or auth when only demo state exists | Keep DEMO / NOT CONNECTED labels; do not expose live action until trusted API is verified |
| Database contract snapshot | #77, #81 | Critical — committed V1 snapshot is not the required reviewed V2 capture | Do not bypass validator, relabel V1, or infer hosted parity from disposable PostgreSQL |

## 4. Canonical integration target (proposal, not current state)

```text
main
└── candidate/integration-spine (create only after human approval)
    ├── source baseline: PR #77 (database provenance + app baseline)
    ├── dependency baseline: PR #78 (Vite 8 + reviewed lockfile)
    ├── disposable verification: PR #79 (migration replay + Owner A/B fixture)
    ├── catalog contract: PR #81 (V2 capture query + validator; live gate blocked)
    ├── backend ports: reviewed subsets from #60 → #62 → #63 → #65
    └── frontend: select #77 shell or port verified deltas from #72; no wholesale duplicate merge
```

This target is deliberately a *single integration spine*. The PRs above remain evidence/source branches until their changes are accounted for. Do not delete or close source branches merely because a port is complete.

## 5. Required trust-boundary contract

- Browser authentication uses the official Supabase client/session lifecycle. Browser capability checks are UX only.
- Every Edge Function independently verifies the Supabase JWT and derives the subject from the verified user.
- Authorization is deny-by-default. Until role governance and capability mapping are reviewed, the authorization endpoint must not grant privileged capabilities.
- RLS remains mandatory for user-scoped reads. Service-role credentials stay server-only and are restricted to narrowly reviewed operations.
- Browser payloads cannot set `owner_id`, role, permissions, run lifecycle state, worker claims, or result fields.
- Enqueue must be one atomic server-side transaction/RPC with a unique idempotency key and request hash. A preflight read followed by insert is not sufficient.
- Status and cancellation must be owner-scoped. Cancellation must use a conditional queued-state transition; it must not pretend to preempt an already-running worker.
- Durable retry requires append-only attempt history, lease fencing, heartbeat/expiry recovery, bounded retry policy, provider idempotency and deterministic crash/replay tests.
- API responses must be allowlisted DTOs; never expose API-key hashes, raw secrets, internal errors, or unfiltered workflow input/output.

## 6. Sequenced integration plan and gates

### Gate A — Inventory freeze
- [x] Confirm default branch and repository identity.
- [x] Retrieve PR metadata and changed-path lists for the listed implementation lineages.
- [x] Record branch ancestry and the high-risk shared-file hotspots.
- [ ] Confirm the missing/unknown PR #80 reference.
- [ ] Independent reviewer validates this inventory against current GitHub heads.

### Gate B — Select source baseline
- [ ] Human approves PR #77 as the source-recovery candidate baseline.
- [ ] Review #77's complete migration provenance, V1/V2 contract files and app shell.
- [ ] Review #78 lockfile and Vite 8 compatibility.
- [ ] Review #79 disposable replay/security artifacts and #81 capture semantics.
- [ ] Select exactly one UI shell; account for all #72 deltas.

### Gate C — Backend integration candidate
- [ ] Compare #60 auth files against baseline; port only reviewed modules and minimal bootstrap wiring.
- [ ] Integrate #62 authorization endpoint without enabling unverified roles/capabilities.
- [ ] Integrate #63 worker changes only after reviewing actual worker behavior and database dependencies.
- [ ] Integrate #65 API contract; keep enqueue 501 until persistence gates pass.
- [ ] Resolve #64 divergent ancestry and workflow-filter changes explicitly.
- [ ] No production secrets, live writes, migrations or deployment.

### Gate D — Database authority
- [ ] Obtain explicit separate authorization for a metadata-only live catalog capture.
- [ ] Use least-privilege read-only credentials and verify project identity out-of-band.
- [ ] Capture a fresh V2 snapshot without application rows, secrets or function bodies.
- [ ] Independent SQL reviewer verifies query scope and output.
- [ ] Compare capture to recovered migration provenance; document every difference.
- [ ] Human approves parity report. Until all are complete, production-dependent schema work remains BLOCKED.

### Gate E — Durable workflow proof
- [ ] Add reviewed additive idempotency schema/RPC in a disposable database only.
- [ ] Prove concurrent duplicate requests create one run.
- [ ] Prove Owner A cannot read/cancel Owner B's run.
- [ ] Prove cancellation-vs-claim races have one deterministic winner.
- [ ] Prove retry attempt history is append-only and retry limits are enforced.
- [ ] Prove lease fencing, heartbeat expiry, worker crash recovery and replay behavior.
- [ ] Keep live enqueue disabled until independent review.

### Gate F — Integrated QA and release
- [ ] Run `npm ci`, dependency audit, lint/typecheck, unit tests and production build on the exact candidate SHA.
- [ ] Run Edge Function contract/security tests and disposable PostgreSQL suites.
- [ ] Run mobile-width keyboard/accessibility and browser integration QA.
- [ ] Verify no demo data is presented as live telemetry.
- [ ] Independent code/security review and human merge approval.
- [ ] Separate deployment approval, post-deploy smoke plan and rollback plan.

## 7. Current status and explicit non-claims

| Area | Status | Evidence boundary |
|---|---|---|
| Repository identity/default branch | VERIFIED | GitHub repository metadata |
| PR ancestry and selected path inventory | PARTIAL — inventory captured | Does not prove semantic compatibility or conflict-free merge |
| Dependency remediation | VERIFIED ON PR #78 HEAD (per recorded run) | Not yet validated on a unified candidate SHA |
| Disposable migration replay | VERIFIED ON PR #79 HEAD (per recorded runs) | Disposable database only; not hosted schema parity |
| Catalog V2 validator/capture smoke | VERIFIED ON PR #81 HEAD (per recorded runs) | Live V2 capture and review remain blocked |
| Live Schema Contract V2 parity | BLOCKED | Fresh reviewed live V2 snapshot missing |
| Unified frontend/backend branch | NOT CREATED | No PR merge or cherry-pick performed |
| Trusted transactional enqueue | BLOCKED / NOT IMPLEMENTED | PR #65 returns 501; idempotency persistence absent |
| Durable retry/lease/recovery | PARTIAL | Pure retry policy exists; durable runtime proof absent |
| Production AI agents | NOT VERIFIED | No production model/agent execution proven |
| Release readiness | NOT READY | Integrated candidate and release gates absent |

## 8. Safety and change log

This branch contains documentation only. No application code, SQL, migration, workflow, dependency, secret, repository setting, branch protection, deployment configuration, or production data was changed.

No PR was merged, no branch was deleted, no database was accessed, no migration was run against a hosted project, no Edge Function was deployed, no Vercel deployment was triggered, and no billing action was taken.

**Next permitted action:** independent review of this inventory and explicit human selection of the candidate source baseline. Only then create the actual integration branch from the approved commit.
