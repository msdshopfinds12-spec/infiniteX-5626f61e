# InfiniteX Platform Engineering Plan

**Status:** Planning baseline only — not an implementation or release approval  
**Baseline:** PR #55 head `91e55c1dd2a8023fe10ca73acf6590759228ce31`  
**Target:** Incremental, testable, free-tier-first platform engineering  
**Rule:** No production mutation, database migration, secret rotation, merge, paid upgrade, or deployment without explicit human approval.

## 1. Executive direction

Build InfiniteX as a modular web application with independently testable boundaries. Preserve the existing React/Vite dashboard and its explicit demo-mode indicators until each live capability is implemented and verified. Do not replace working UI with placeholder “AI” controls or claim integrations that are not connected.

Recommended sequence:

1. Reproducible build and repository baseline
2. Supabase client and authentication foundation
3. Authorization and database contract verification
4. Typed data-access services
5. Workflow execution integration
6. AI provider/model adapter layer
7. Agent orchestration with bounded tools
8. Observability, auditability, accessibility, and UX hardening
9. Release readiness and human approval

## 2. Target architecture

```text
React + TypeScript + Vite
  ├─ App shell / responsive dashboard
  ├─ Feature modules
  │   ├─ Authentication
  │   ├─ Projects
  │   ├─ Workflows
  │   ├─ Agents
  │   └─ Settings
  ├─ Application services (use cases)
  ├─ Domain types and validation
  ├─ Infrastructure adapters
  │   ├─ Supabase client
  │   ├─ Auth adapter
  │   ├─ Data repositories
  │   ├─ AI provider adapters
  │   └─ Telemetry adapter
  └─ UI state and query/cache boundary

Supabase
  ├─ Auth
  ├─ PostgreSQL + RLS
  └─ Existing approved schema/functions

External AI providers
  └─ Server-side gateway / edge boundary
      ├─ Provider selection
      ├─ Secret isolation
      ├─ Rate and budget limits
      └─ Audit metadata
```

The browser is an untrusted environment. It may contain only public configuration and publishable/anon credentials. Never expose service-role keys, secret API keys, database passwords, worker secrets, or privileged tokens in frontend bundles.

## 3. Proposed source layout

This is a target layout, not a claim that these files already exist.

```text
src/
  app/
    AppProviders.tsx
    router.tsx
    RequireAuth.tsx
  features/
    auth/
      AuthProvider.tsx
      auth-service.ts
      auth.types.ts
      AuthScreen.tsx
    projects/
    workflows/
    agents/
    settings/
  domain/
    errors/
    schemas/
    entities/
  lib/
    supabase/
      client.ts
      config.ts
      errors.ts
      database.types.ts
    validation/
    observability/
  services/
    project-service.ts
    workflow-service.ts
    agent-service.ts
  components/
    layout/
    dashboard/
    feedback/
  tests/
    unit/
    integration/
    security/
```

Keep feature modules cohesive. Avoid a generic “mega service”, global mutable state, circular imports, duplicated Supabase clients, and direct database calls from presentation components.

## 4. Security invariants

- Authentication establishes identity; it does not grant access by itself.
- PostgreSQL Row-Level Security (RLS) is the authorization boundary for user-owned records.
- Derive identity from the verified session / `auth.uid()`; never trust a client-supplied owner identifier.
- Validate all untrusted input at the boundary with runtime schemas.
- Keep privileged operations server-side and narrowly scoped.
- Do not weaken existing grants or revoke existing permissions as a shortcut; review the complete call path and intended user experience first.
- Clear user-scoped caches and subscriptions on sign-out and account switch.
- Do not render protected data until session restoration is complete.
- Treat route guards as UX controls, not database security.
- Apply least privilege, bounded pagination, request limits, and safe error messages.
- Never log credentials, access tokens, secrets, or sensitive user payloads.

## 5. Authentication implementation contract

Implement only after dependency installation and lockfile generation in a real Node environment.

Required behavior:
- One typed Supabase client singleton.
- Session restoration on application startup.
- Sign-in, sign-up, sign-out, and session-change handling.
- Loading, unauthenticated, authenticated, and recoverable-error states.
- Protected application routes with a clear sign-in path.
- Account-switch cleanup for user-specific caches and listeners.
- No privileged key in client configuration.
- Tests for expired/missing sessions and auth state transitions.

Do not implement password-reset email flows, OAuth providers, MFA UX, or account deletion until their redirect URLs, provider configuration, rate limits, and recovery behavior are explicitly designed and tested.

## 6. Data and workflow integration contract

- Treat generated database types as a snapshot, not proof that the live database matches.
- Compare schema, function signatures, grants, and RLS policies against an approved database contract before relying on them.
- Keep read and write repositories separate where permissions differ.
- Scope every user-facing query to the authenticated identity and enforce the same ownership at the database layer.
- Do not connect workflow mutations while the relevant database contract is awaiting human approval.
- For worker claims, preserve the reviewed identity, row-locking, bounded-batch, and service-role-only internal execution invariants. Test concurrency and two-user isolation before production use.
- Use idempotency keys and explicit state transitions for retryable operations; do not infer success from a client timeout.

## 7. AI and agent execution boundary

AI model calls must be treated as untrusted, fallible external operations.

- Use provider adapters behind a server-side boundary.
- Keep provider secrets out of the browser and repository.
- Enforce per-user authorization, request budgets, rate limits, timeouts, and output-size limits.
- Validate tool arguments against strict schemas before execution.
- Use explicit allowlists for tools and resources.
- Require human approval for consequential actions.
- Record model/provider, latency, token/cost metadata where available, outcome, and redacted error category.
- Separate model-generated proposals from deterministic application code.
- Do not let model output directly execute SQL, alter permissions, publish deployments, or modify secrets.

A model router is not “multi-model intelligence” unless providers, fallback policy, budget behavior, and evaluation tests are actually implemented.

## 8. Quality gates

Run in a writable Node.js environment against the exact candidate commit:

1. `npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run test:edge-function-security` (if present in package scripts)
5. `npm run build`
6. Dependency and secret scanning supported by repository CI
7. Review test artifacts and exact commit SHA

Add tests for:
- Auth state restoration and sign-out
- Two-user isolation
- RLS denial for cross-owner reads/writes
- Invalid and expired sessions
- Workflow claim concurrency and bounded batches
- Permission parity between declared contract and deployed function
- Retry/idempotency and worker attempt fencing
- UI loading, empty, error, and narrow-screen states

A passing frontend build does not prove backend authorization. A passing static test does not prove live Supabase parity. Record these as separate evidence.

## 9. Free-first alternatives

| Need | Preferred option | Fallback | Constraint |
|---|---|---|---|
| Node environment | GitHub Codespaces if quota is available | StackBlitz or another browser IDE | Verify available free quota and supported Node version |
| Dependency resolution | Local/browser Node with npm | CI workflow | Never hand-write a lockfile |
| Database testing | Synthetic test users in isolated test project | Mocked unit tests for frontend behavior | Mocks do not prove RLS |
| AI provider | Free-tier provider only after current limits are verified | Mock adapter for development | No paid upgrade or surprise billing |
| Deployment | Existing free deployment quota | Local preview / CI artifact | No repeated deploy attempts when quota is exhausted |

Do not assume a free tier is unlimited or currently available. Check account limits before execution.

## 10. Delivery phases and exit criteria

### Phase A — Reproducibility
Exit only when Node version, package manager, lockfile, clean install, lint, tests, and build are evidenced for one exact commit.

### Phase B — Authentication
Exit only when auth lifecycle tests pass, no secrets are bundled, and session transitions are handled without leaking user data.

### Phase C — Authorization and data
Exit only when the approved schema and live grants/RLS are compared, two-user isolation is tested, and negative authorization tests pass.

### Phase D — Workflows
Exit only when claim concurrency, batch limits, idempotency, retries, and worker fencing are verified in an isolated environment.

### Phase E — AI/agents
Exit only when tool permissions, server-side secret isolation, budgets, rate limits, human approval gates, and failure handling are tested.

### Phase F — Release
Exit only after security review, accessibility review, operational checklist, rollback plan, and explicit human release approval.

## 11. Evidence ledger

For every phase, record:
- Status: `VERIFIED`, `PARTIAL`, `BLOCKED`, or `NOT TESTED`
- Exact commit SHA
- Commands executed and exit codes
- CI run URLs and test artifact references
- Environment and dependency versions
- Known limitations and unresolved risks
- Reviewer and approval record

Never mark a phase complete based on code presence, a mock, a screenshot, or an unverified claim.

## 12. Current baseline status

| Area | Status | Reason |
|---|---|---|
| Existing React/Vite shell | PARTIAL | Existing dashboard is explicitly demo-mode |
| Public Supabase config validation | PARTIAL | Validation code exists; live client integration is not established |
| Supabase SDK and lockfile | BLOCKED | Must resolve dependencies in a real Node environment |
| Authentication lifecycle | NOT TESTED | No verified implementation evidence |
| RLS / two-user isolation | NOT TESTED | Requires isolated backend tests |
| Workflow worker concurrency | NOT TESTED | Requires concurrent integration tests |
| AI provider routing | NOT TESTED | No verified live provider integration |
| Production release | BLOCKED | Requires all gates and explicit human approval |

## 13. Immediate next action

Open a writable Node.js 22 environment for this branch. Implement Phase A first, then Phase B. Keep this pull request Draft until the actual code, exact-head CI, and review evidence are available.

**No production migration, secret change, merge, paid upgrade, or deployment is authorized by this plan.**
