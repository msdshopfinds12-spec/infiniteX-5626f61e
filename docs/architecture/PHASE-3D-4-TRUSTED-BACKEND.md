# Phase 3D-4 — Trusted Backend Execution Boundary

Status: **PLAN / ARCHITECTURE GATE**  
Branch: `feat/phase-3d4-trusted-backend`  
Base: `ec4263d5a36a44d0afe9dfebd2b0141675d788ef`  
Scope: documentation and security contracts only. No runtime backend, migration, secret, paid service, deployment, PR merge, or provider call is introduced by this commit.

## 1. Objective

Move trust decisions and privileged execution out of the browser. The React client is an untrusted presentation layer. A server-side identity, workspace membership, policy decision, quota decision, and explicit approval must precede every protected operation.

This phase does **not** claim production authentication, durable audit storage, RLS enforcement, live AI connectivity, or production readiness.

## 2. Candidate reconciliation — evidence-based constraints

| Candidate | Observed evidence | Decision |
|---|---|---|
| `feat/provider-neutral-billing-sandbox` | Root package declares Node >=22 and backend test scripts; its package dependency versions differ from the Phase 3D-3 baseline. | Primary candidate for targeted code review, not a merge source. Verify exact server modules, lockfile, runtime compatibility, auth/session flow, transaction boundaries, and tests before selective porting. |
| `gh-20/secure-backend-foundation` | README documents bearer auth plus client-supplied `X-Tenant-ID`; root package is a Python workspace. | Do not adopt tenant selection from the request header. Tenant identity must be resolved from verified server-side identity and membership. |
| `feat/infiniteX-phase-3b-agent-adapters` | Root package contains AI gateway/adapter typecheck script; dependency versions differ from Phase 3D-3. | Reuse concepts only after reviewing server-side policy, provider cancellation, secret handling, and failure behavior. No live provider is presumed. |

Compatibility is **unverified**. Do not merge any candidate wholesale. Do not copy lockfiles or replace the Phase 3D-3 dependency graph without a separate dependency review.

## 3. Trust boundary

```text
Browser / React UI (untrusted)
  -> HTTPS API boundary
  -> session authentication
  -> server-derived principal
  -> workspace membership + role authorization
  -> request schema + CSRF + origin policy
  -> capability / tool policy
  -> quota + rate + budget admission
  -> explicit approval for consequential actions
  -> isolated execution adapter
  -> scoped repository / database access
  -> redacted, access-controlled audit event
```

The browser may submit a workspace identifier as a *requested resource selector*. It must never establish authorization by itself. The API must verify the authenticated principal's active membership and required role for that resource on every request.

## 4. Non-negotiable security invariants

1. **Identity:** accept only server-verified session identity. Never trust user IDs, roles, tenant IDs, or membership claims supplied solely in request JSON or headers.
2. **Workspace authorization:** resolve membership server-side for every protected request. Deny by default. Enforce object-level authorization, not only route-level authentication.
3. **Sessions:** use high-entropy opaque tokens; store only a cryptographic hash server-side; rotate on authentication; revoke on logout, expiry, credential change, and detected compromise. Cookie sessions must be Secure, HttpOnly, and an appropriate SameSite value.
4. **CSRF:** for cookie-authenticated state changes, require a synchronizer token or equivalent robust defense and validate Origin/Referer according to deployment policy. SameSite is defense-in-depth, not the only control.
5. **CORS:** allow only explicitly configured trusted origins. Never use wildcard origins with credentialed requests.
6. **Input validation:** validate method, content type, size, schema, identifiers, and enum values at the server boundary. Reject unknown privileged fields rather than silently trusting them.
7. **Database:** use parameterized queries and least-privilege database roles. RLS must derive tenant scope from trusted database session context or verified claims, not a caller-controlled tenant header. Test both positive and negative cross-workspace access.
8. **AI execution:** model output is untrusted data, never policy. Tool names and arguments must be checked against a server-owned allowlist and schema. No arbitrary shell, eval, dynamic code execution, unrestricted URL fetch, or implicit repository write.
9. **Approval:** GitHub writes, deployments, migrations, billing changes, destructive actions, and other consequential mutations require an explicit, scoped, time-bounded approval bound to the exact action and target. Approval is not transferable to a changed payload.
10. **Secrets:** provider keys and signing secrets are server-only, never Vite-prefixed or embedded in client bundles. Never log secrets, session tokens, raw authorization headers, or sensitive prompt/output content.
11. **Abuse controls:** apply per-principal and per-workspace rate limits, concurrency limits, request deadlines, and enforceable quotas before provider execution. Fail closed if required budget state is unavailable.
12. **Audit:** record actor, workspace, action, target, policy decision, approval reference, correlation ID, and outcome with data minimization. Protect integrity and access; do not represent in-memory diagnostics as durable audit storage.
13. **Failure behavior:** no automatic retry for non-idempotent mutations. Use idempotency keys where retries are explicitly supported. Propagate AbortSignal to upstream providers and bound server-side work; a timeout race alone does not terminate remote work.
14. **Errors:** return stable, non-sensitive error codes. Keep stack traces, SQL details, provider errors, and internal policy rationale out of client responses.

## 5. Proposed module boundaries

Names are provisional until the current tree and candidate source are inspected.

- `server/config/`: environment parsing, startup validation, production fail-closed checks.
- `server/auth/`: session lifecycle, CSRF, identity resolution.
- `server/workspaces/`: membership and role checks.
- `server/policy/`: capability policy and approval requirements.
- `server/limits/`: rate, concurrency, quota, and budget admission.
- `server/db/`: repositories and transaction boundaries.
- `server/audit/`: redaction, event schema, durable sink interface.
- `server/ai/`: orchestrator, provider-neutral adapter contract, cancellation.
- `server/tools/`: typed allowlisted tool registry and approval-gated executors.
- `api/`: thin transport handlers; no business authorization logic duplicated in UI.

Do not create these directories blindly. First map existing paths and port only the minimum compatible modules.

## 6. Phase gates

### 3D-4A — Reconciliation and threat model
- Inventory exact source paths and tests on each candidate branch.
- Compare runtime, dependencies, lockfiles, API contracts, and frontend assumptions.
- Produce a file-level port/reject matrix and threat model.
- Exit: candidate selection is justified by source evidence; no unresolved critical design contradiction.

### 3D-4B — Runtime and configuration
- Add server runtime only after compatibility review.
- Validate required environment variables at startup; fail closed in production.
- Keep local development configuration separate; commit placeholders only.

### 3D-4C — Authentication and authorization
- Implement and test session lifecycle, CSRF, origin policy, membership lookup, and role enforcement.
- Exit: unauthenticated, expired, revoked, wrong-role, and cross-workspace requests are denied.

### 3D-4D — Persistence and audit
- Define repository interfaces and transaction ownership.
- Review SQL and RLS policies before any migration is proposed.
- Migration files may be drafted only in a separately reviewed change; never apply them in this phase without separate approval.

### 3D-4E/4F — AI execution and controls
- Connect the existing orchestrator only through server-side policy.
- Add adapter contracts, abort propagation, bounded concurrency, quotas, and redacted audit.
- Keep providers disabled until a separately approved configuration and cost review.

### 3D-4G — Frontend integration
- Replace mock calls only after stable API contracts exist.
- UI status must distinguish unavailable, disabled, unauthorized, pending approval, running, failed, and completed.
- Never expose secrets or imply that a mock is a live provider.

### 3D-4H — Verification and release audit
- Run build, lint, unit, integration, authorization, CSRF, RLS, dependency, and secret-scanning checks.
- Record exact commands, commit SHA, results, and limitations.
- Release remains blocked until human approval.

## 7. Required test matrix

| Control | Required negative test |
|---|---|
| Authentication | Missing, malformed, expired, revoked session |
| Authorization | Valid user without workspace membership |
| Tenant isolation | User A cannot read or mutate Workspace B |
| Role enforcement | Viewer cannot invoke write capability |
| CSRF / origin | Missing token, invalid token, untrusted origin |
| Input boundary | Oversized body, invalid schema, unknown privileged field |
| Tool policy | Unknown tool, disallowed capability, model-injected tool request |
| Approval | Missing, expired, replayed, or payload-mismatched approval |
| Quotas | Exhausted quota and unavailable quota store fail closed |
| Provider safety | Abort propagation, timeout, upstream error redaction |
| Audit | Secret/token redaction and unauthorized audit read denied |
| Idempotency | Duplicate mutation request does not execute twice |

## 8. CI expectations

- Keep CI least-privilege: read-only permissions by default; grant write permissions only to a narrowly scoped job that needs them.
- Pin third-party Actions to reviewed full commit SHAs where practical.
- Use dependency lockfiles and deterministic install commands.
- Run secret scanning, dependency audit, typecheck, lint, unit tests, and build.
- Do not expose secrets to untrusted pull-request code. Avoid `pull_request_target` checkout/execution of contributor-controlled code.
- CI green is evidence for the checks that ran, not proof of production security.

## 9. Approval and prohibited operations

This branch authorization covers only creation of the branch and reviewable implementation commits within the stated scope.

Not authorized by this phase: database migration application, secret creation or rotation, paid services, provider calls that can incur charges, PR creation/merge, deployment, production data access, destructive GitHub operations, or changes to unrelated branches.

Any such operation requires separate explicit approval.

## 10. Verification record

- Branch existence: verified by GitHub branch search and creation response.
- Base commit: verified as `ec4263d5a36a44d0afe9dfebd2b0141675d788ef`.
- Candidate package metadata: inspected on the three named branches.
- Runtime implementation: **NOT IMPLEMENTED**.
- Tests/build: **NOT RUN**.
- Database/RLS: **NOT VERIFIED**.
- Live AI providers: **NOT CONNECTED**.
- Deployment/migration/merge: **NOT PERFORMED**.
