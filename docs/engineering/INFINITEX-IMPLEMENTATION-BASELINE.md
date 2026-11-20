# InfiniteX Engineering Implementation Baseline

**Status:** Working engineering baseline; not a production-readiness declaration.  
**Branch:** `eng/infinitex-p0-p1-auth-2026-11-20` (implementation branch; PR #60)  
**Frontend source baseline:** PR #48 head `a60d9f9ab1f65bf43ad3a5cef0c94e7cdff48763`; auth safety work tracked in PR #60  
**Default branch at branch creation:** `main` at `4538bd0cceb3d2ee6adbaf36777047108229cf3c`

## 1. Executive decision

Use PR #48 as the current frontend integration candidate because it consolidates the Vite 8 toolchain, truthful demo-mode UI, and mobile accessibility changes. This branch is intentionally based on that exact candidate head so the package identity correction and implementation plan do not duplicate earlier work.

Keep backend and database integration separate until the deployed Supabase schema and deployed Edge Function source are reconciled with repository history.

## 2. Evidence ledger

| Area | Status | Evidence / limitation |
|---|---|---|
| Repository access | VERIFIED | Connected GitHub repository metadata and push permission inspected |
| Frontend candidate | VERIFIED CANDIDATE | PR #48; exact-head GitHub Actions run #44639727844 passed |
| Vite toolchain | VERIFIED CANDIDATE | PR #48 includes Vite 8.3.8 and React plugin 6.1.2 |
| Frontend tests/build | CI PASS ON PR #48 HEAD | Does not imply this new branch has passed CI |
| Demo truthfulness | IMPLEMENTED IN CANDIDATE | UI explicitly labels illustrative data and unavailable integrations |
| Package identity | CORRECTED ON THIS BRANCH | package.json and package-lock root identity changed to `infinitex-workspace`; exact-head CI still required |
| Backend functions | CANDIDATE ONLY | PR #46 is a separate candidate; deployed source parity is not established |
| Database migrations | BLOCKED / UNVERIFIED | Historical bodies for 19 migration ledger entries remain unverified |
| Production schema compatibility | BLOCKED | Synthetic fixture is not the deployed schema |
| Transactional fencing / retries | NOT VERIFIED | Requires real-schema-compatible disposable PostgreSQL tests |
| Vercel deployment | BLOCKED | Prior Vercel checks reported `build-rate-limit`; no successful deployment is claimed |
| Production release | NOT AUTHORIZED | Requires separate explicit approval |

## 3. Current frontend architecture

- React 18 + TypeScript + Vite 8.
- Component composition under `src/components/`.
- Theme behavior under `src/hooks/useTheme`.
- Typed view navigation under `src/types`.
- Node's built-in test runner via `node --test`.
- GitHub Actions runs dependency installation, audit, lint, tests, build, and artifact upload.
- Vercel Analytics package is present; its runtime behavior and consent/privacy requirements must be reviewed before production.

### Demo-mode contract

Until real backend adapters and authorization are verified:
- Sample metrics, agents, logs, and pipeline cards must remain labeled as illustrative.
- Do not display fabricated health, uptime, execution, security, token, or cost measurements.
- Controls without a real server-side implementation must remain disabled or clearly unavailable.
- Never expose service-role keys or provider secrets in browser code.
- A successful UI render must not be represented as a successful AI agent run.

## 4. Target architecture (incremental, free-tier-first)

```text
React + TypeScript (browser)
        |
        | authenticated HTTPS; public anon key only
        v
Supabase Auth + Postgres + RLS
        |
        +---- narrowly scoped RPC / Edge Functions
        |              |
        |              +---- workflow orchestration
        |              +---- model/provider adapters
        |              +---- audit events
        |
        +---- durable workflow/task state

GitHub Actions: lint -> unit/contract tests -> build -> artifact
Vercel: preview/deployment only after explicit release approval
```

### Boundary rules

1. Browser code is untrusted. Enforce authorization in Postgres RLS and server-side functions.
2. Use the Supabase anon/publishable key only in the browser; never put service-role or model-provider secrets in Vite variables.
3. Every mutating operation must authenticate, authorize, validate input, apply idempotency where retries are possible, and write an auditable outcome.
4. Model calls must pass through a server-side adapter with provider allowlists, bounded timeouts, output-size limits, and usage/cost limits.
5. Treat model output and repository content as untrusted input. Validate structured output against schemas before use.
6. Workflow state transitions must be atomic and concurrency-safe. Do not enable retries until idempotency and durable attempt semantics are tested.
7. Logs must redact credentials, tokens, personal data, and sensitive prompts by default.

## 5. Backend and database recovery gates

Before any production migration or Edge Function deployment:

- Recover the original SQL bodies for all historical migration ledger entries from an authoritative source.
- Compare migration history, deployed schema, indexes, constraints, triggers, functions, grants, and RLS policies.
- Compare deployed Edge Function source against the repository candidate; record exact source hashes.
- Inventory every writer of workflow/task state and document lock ordering.
- Validate the proposed migration against a disposable PostgreSQL database built from the authoritative schema, not a hand-written substitute.
- Test duplicate requests, concurrent workers, stale leases, lock contention, retry exhaustion, worker crashes, and rollback.
- Confirm least-privilege grants and authenticated/cron authorization boundaries.
- Produce a reviewed rollback plan and a backup/restore verification record.

**Hard stop:** if authoritative migration SQL or deployed schema evidence is unavailable, do not apply schema changes and do not claim production compatibility.

## 6. Verification matrix

Required exact-head CI checks for this branch:
- `npm ci`
- `npm audit`
- `npm run lint`
- `npm test`
- `npm run build`

Required manual QA before frontend acceptance:
- Android narrow viewport and tablet/desktop responsive checks.
- Keyboard-only navigation and visible focus.
- Screen-reader labels and current-page semantics.
- Reduced-motion preference.
- Disabled controls and demo-mode disclosures.
- Browser console/network review for failed requests, leaked secrets, and misleading live claims.

Required backend QA in a disposable environment:
- RLS positive and negative authorization tests.
- RPC/function input validation and privilege tests.
- Idempotency and duplicate delivery tests.
- Concurrent mutation and stale-worker tests.
- Failure injection, retry limits, timeout, and recovery tests.
- Migration forward/rollback rehearsal.

## 7. Free-first implementation alternatives

| Need | Preferred starting option | Safe fallback |
|---|---|---|
| Frontend | Existing React/Vite stack | Keep current UI demo-only until contracts exist |
| Database/Auth | Existing Supabase project if free-tier capacity is confirmed | Local disposable PostgreSQL for tests; do not silently switch production backend |
| CI | GitHub Actions within available quota | Reproduce commands locally and attach logs; never claim CI pass without run evidence |
| Hosting | Existing Vercel project after rate-limit diagnosis | Preview-only or static artifact review; no surprise provider migration |
| AI inference | Provider adapter with explicit per-provider limits | Mock adapter and synthetic fixtures until provider budget and secret handling are approved |
| Observability | Structured redacted logs and bounded metrics | Minimal logs with explicit retention; no sensitive payload logging |

Do not add paid dependencies, new providers, or recurring services without a cost and approval review.

## 8. Release gates

Release is blocked until all are true:

- [ ] Frontend branch exact-head CI passes.
- [ ] Manual Android, keyboard, and screen-reader QA is recorded.
- [ ] Frontend/backend contracts are documented and tested.
- [ ] Deployed Supabase schema and migration provenance are reconciled.
- [ ] RLS, grants, secrets, and Edge Function authorization are audited.
- [ ] Disposable PostgreSQL concurrency and failure tests pass.
- [ ] Vercel build-rate-limit issue is diagnosed and a real preview deployment succeeds.
- [ ] Production smoke tests, monitoring, backup, rollback, and incident owner are defined.
- [ ] Human approval is recorded for merge, migration, secrets/configuration changes, and production deployment.

## 9. Change log

- Corrected npm package identity from the inherited Bolt starter name to `infinitex-workspace` in `package.json` and the two root identity entries in `package-lock.json`.
- Added this evidence-led implementation baseline.
- No application runtime behavior, database, secrets, deployment configuration, or production resources were changed by this baseline.
