# Phase 3D-4A — Backend Candidate Reconciliation Report

Status: **SOURCE INSPECTION COMPLETE FOR SELECTED FILE SET / COMPATIBILITY NOT APPROVED**  
Target branch: `feat/phase-3d4-trusted-backend`  
Reviewed candidate: `feat/provider-neutral-billing-sandbox`  
Comparison base: `feat/phase-3d3-ai-orchestration-foundation` at `ec4263d5a36a44d0afe9dfebd2b0141675d788ef`

## 1. Executive decision

**Do not merge the candidate branch and do not copy its complete backend wholesale.** The candidate is a substantial, independently evolved implementation, not a small patch on top of Phase 3D-3.

GitHub compare reports:
- Candidate is **191 commits ahead** and **93 commits behind** the Phase 3D-3 branch.
- Compare status: `diverged`.
- Merge base: `76b821789f52aa6f403bacb0508c6c989fdfa3a5`.
- The compare lists backend runtime, identity, database, migration, test, workflow, billing documentation, and frontend changes. This degree of divergence makes a wholesale merge a high-conflict/high-regression choice.

The best path is **selective porting from reviewed source files into the Phase 3D-4 branch**, preserving the Phase 3D-3 frontend/dependency baseline and introducing a server runtime only after explicit contract and CI design.

## 2. Evidence reviewed

### Candidate application and runtime
- `apps/api/README.md`
- `apps/api/package.json`
- `apps/api/src/app.mjs`
- `apps/api/src/config.mjs`
- `apps/api/src/server.mjs`
- `apps/api/src/auth/opaque-token.mjs`
- `apps/api/src/auth/csrf.mjs`
- `apps/api/src/auth/cookie-policy.mjs`
- `apps/api/src/auth/session-service.mjs`
- `apps/api/src/authorization/policy.mjs`
- `apps/api/src/identity/assertion-signer.mjs`
- `apps/api/src/workspaces/membership-repository.mjs`
- selected unit and PostgreSQL integration tests

### Database and CI
- `infra/db/migrations/0001_identity_workspace_foundation.sql`
- `infra/db/migrations/0002_workspace_row_level_security.sql`
- `infra/db/migrations/0003_verified_identity_assertions.sql`
- `infra/db/ci/0002_runtime_role.sql`
- `infra/db/ci/0003_seed_identity_test_key.sql`
- `infra/db/tests/0001_identity_workspace.integration.sql`
- `.github/workflows/self-hosted-api.yml`

### Separate authentication/runtime foundation
- `server/auth/config.mjs`
- `server/http/create-server.mjs`

Inspection was source-level via GitHub file retrieval. No code was executed, no workflow was run, and no database was connected.

## 3. Findings by subsystem

### 3.1 API runtime — useful bootstrap, not yet a business API

The `apps/api` README explicitly scopes the service to liveness/readiness endpoints and says authentication, authorization, database access, rate limiting, CORS, CSRF, request schemas, audit persistence, and monitoring are not yet integrated.

The inspected `apps/api/src/app.mjs` currently:
- accepts only GET and HEAD;
- exposes `/healthz` and `/readyz`;
- returns 404 for other routes;
- has no authentication/session/workspace business route.

**Decision:** reusable transport/bootstrap foundation only after runtime integration tests and configuration review. It is not evidence of a complete trusted backend.

### 3.2 Session primitives — good reusable components, missing production wiring

The opaque token module uses 32 random bytes, stores SHA-256 digests, and compares digest bytes with `timingSafeEqual`. Cookie serialization enforces a `__Host-` name, Secure, HttpOnly, Path=/, and SameSite=Lax/Strict. CSRF token hashing is separated from the raw token.

The session service is dependency-injected and requires a repository interface, but the reviewed set did not establish a production PostgreSQL session repository, login/OIDC callback integration, session rotation workflow, or HTTP middleware wiring.

**Decision:** candidate for selective port with additional adversarial tests; do not call it production authentication.

### 3.3 Workspace authorization — useful policy and repository boundary

The role policy has explicit owner/admin/member/viewer permissions and denies unknown roles/permissions. The membership repository:
- requires an externally authenticated principal;
- binds an identity assertion to a PostgreSQL transaction ID;
- uses parameterized SQL;
- locks workspace and membership rows;
- enforces account/membership active state;
- prevents removal/demotion of the last active owner;
- writes the audit event in the same transaction as the membership mutation.

This is a promising narrow vertical slice. Its trust depends on the caller being a verified authentication boundary and the database verifier being configured correctly.

**Decision:** selectively port only after route-level principal provenance, transaction/role assumptions, RLS behavior, and concurrency tests are independently verified.

### 3.4 Database identity assertions and RLS — sophisticated, high-review subsystem

Migration `0003_verified_identity_assertions.sql` replaces the earlier GUC-only policies with a database verifier that checks a signed assertion, HMAC key state, expiry, transaction ID, database role, and current active membership/account. It creates a non-login verifier owner with BYPASSRLS for the narrowly scoped SECURITY DEFINER verifier.

This is materially stronger than trusting a caller-set workspace/user GUC, but the design is security-sensitive:
- The verifier owner is a privileged BYPASSRLS role.
- The SECURITY DEFINER function, ownership, grants, search_path, extension placement, and key table permissions must be reviewed as a single unit.
- Key provisioning/rotation/revocation and operational recovery need a documented runbook.
- The assertion signer and SQL verifier must remain byte-for-byte contract-compatible.
- The preceding GUC-only migration `0002` must never be treated as the final security boundary by itself.
- RLS must be tested under the actual non-owner runtime role, including forged/missing/expired/replayed/wrong-workspace/wrong-transaction assertions.

**Decision:** retain as a research candidate, not approved for application or production adoption. Keep all migrations unapplied pending a separate explicit migration approval.

### 3.5 CI workflow — useful disposable PostgreSQL pattern, needs hardening review

The candidate workflow provisions a disposable PostgreSQL 17 service, applies candidate migrations, seeds a fixed synthetic test key, and runs Node syntax/unit/integration tests. The fixed key is clearly marked CI-only, which is appropriate for a disposable test database.

Before reuse:
- Pin `actions/checkout` and `actions/setup-node` to reviewed full commit SHAs.
- Confirm workflow permissions remain read-only and no untrusted code receives secrets.
- Confirm path filters cover every dependency that can affect the API/database tests (including shared config and package files).
- Confirm all migrations are applied in a clean disposable database and tests actually fail on SQL/security regressions.
- Confirm workflow runs for pull requests targeting the intended integration branch.
- Do not copy the candidate workflow unchanged: its push filter is hard-coded to the candidate branch name.

**Decision:** port the test strategy, not the workflow verbatim.

## 4. Compatibility and integration risks

| Area | Finding | Status |
|---|---|---|
| Git history | 191 ahead / 93 behind; diverged | **BLOCK wholesale merge** |
| Root package | Candidate root uses Vite 5.4.10; React 18.3.1; TypeScript 5.6.3 | Inspected |
| Candidate API package | Separate `apps/api` package; Node >=22; `pg` 8.16.3 | Inspected |
| Lockfiles | Root and nested API package have separate dependency graphs | Must preserve boundaries |
| Frontend integration | Candidate changes `src/App.tsx`; Phase 3D-3 UI/API contract compatibility not established | Unverified |
| Authentication | Session primitives exist; complete login/OIDC-to-session HTTP wiring not established | Partial |
| Database | Membership repository and SQL migrations exist | Partial |
| RLS | Signed assertion verifier exists in migration 0003 | Source reviewed; not executed |
| Tests | Unit and real-Postgres test sources exist | Not run here |
| Live providers | No evidence from this inspection of live AI provider execution | Unverified |

## 5. Selective-port matrix

| Candidate component | Recommendation | Gate before port |
|---|---|---|
| `apps/api/src/config.mjs`, server bootstrap | **Adapt** | Confirm host binding, production config, graceful shutdown and startup failure behavior |
| `apps/api/src/auth/opaque-token.mjs` | **Port candidate** | Keep canonical base64url checks; add fuzz/boundary tests |
| `apps/api/src/auth/cookie-policy.mjs` | **Port candidate** | Verify proxy/TLS deployment assumptions and cookie lifecycle |
| `apps/api/src/auth/csrf.mjs` | **Port candidate** | Wire to origin validation and state-changing routes |
| `apps/api/src/auth/session-service.mjs` | **Adapt** | Implement and test durable session repository, rotation, expiry, revocation |
| `apps/api/src/authorization/policy.mjs` | **Port candidate** | Bind every decision to server-derived principal and fresh membership |
| `apps/api/src/workspaces/membership-repository.mjs` | **Adapt** | Verify DB role, RLS, signer, concurrency and route authorization |
| `apps/api/src/identity/assertion-signer.mjs` + migration 0003 | **Hold for security review** | Independent crypto/SQL review, key lifecycle, real PostgreSQL adversarial tests |
| `infra/db/migrations/*` | **Do not apply** | Separate migration plan, rollback/recovery plan, explicit approval |
| `.github/workflows/self-hosted-api.yml` | **Adapt** | Pin actions, review path triggers/permissions, test on PRs |
| Candidate frontend edits | **Do not port yet** | Define and verify stable API contract against Phase 3D-3 |

## 6. Required next implementation order

1. Establish exact Phase 3D-4 branch HEAD and preserve its current documentation commit.
2. Add a source-level architecture/contract map for the smallest API vertical slice.
3. Decide one runtime only; avoid parallel duplicate `server/` and `apps/api/` runtimes.
4. Add a persistent session repository and auth middleware behind tests.
5. Add workspace membership lookup and authorization on every protected route.
6. Add transaction-scoped database identity only after independent review of the verifier contract.
7. Add clean-PostgreSQL CI on a dedicated PR branch with read-only workflow permissions.
8. Only then integrate the AI orchestrator behind server-owned policy, quotas, cancellation, and approval gates.

## 7. Release and safety ledger

- Branch compare and divergence: **VERIFIED** by GitHub compare response.
- Selected source files: **INSPECTED**.
- Candidate source execution: **NOT RUN**.
- Candidate unit/integration tests: **NOT RUN**.
- PostgreSQL migrations: **NOT APPLIED**.
- Production identity provider: **NOT CONFIGURED**.
- Production session persistence: **NOT VERIFIED**.
- Frontend-to-API integration: **NOT VERIFIED**.
- AI providers: **NOT CONNECTED / NOT VERIFIED**.
- PR merge/deployment: **NOT PERFORMED**.

**Gate decision:** Phase 3D-4A source review supports selective reuse, not wholesale merge. Proceed to a minimal, test-first Phase 3D-4B design only after the exact target runtime and authentication source-of-truth are chosen.
