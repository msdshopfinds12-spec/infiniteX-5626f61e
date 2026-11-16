# InfiniteX Repair and Completion Roadmap

**Baseline:** source inspection on 2026-11-16  
**Branch:** `feature/infiniteX-platform-integrations`  
**Rule:** repair verified gaps before adding new platforms or integrations.

## Phase 0 — Freeze and baseline

- [ ] Confirm branch and working tree before any source edit.
- [ ] Record Node.js version and package manager.
- [ ] Verify root and API lockfile status; do not use floating dependency installs for release builds.
- [ ] Run root lint/typecheck and build.
- [ ] Run API typecheck, tests and build.
- [ ] Save complete command output and exit codes.
- [ ] No deployment, migration, billing or merge.

**Exit gate:** reproducible baseline with failures categorized.

## Phase 1 — Backend correctness and tenant isolation

- [ ] Review all routes and repository queries for tenant/resource ownership.
- [ ] Verify RLS with the exact non-owner, non-BYPASSRLS application database role.
- [ ] Confirm the DB role cannot bypass tenant policies.
- [ ] Review user provisioning and tenant mapping lifecycle.
- [ ] Test task idempotency collisions with different payloads; ensure same key cannot silently return a different request's task.
- [ ] Confirm agent IDs are owned by the same tenant and authorization is enforced.
- [ ] Review cancellation vs worker-claim race conditions.
- [ ] Review AI usage persistence failure and provider billing reconciliation.
- [ ] Add integration tests with an isolated disposable database.

**Exit gate:** tenant-isolation tests pass under production-equivalent role and repository behavior.

## Phase 2 — Task execution design

The current task route returns `execution: queued_no_worker_configured`. Do not label queued records as running/completed.

- [ ] Specify worker runtime and deployment target.
- [ ] Add atomic claim/lease mechanism.
- [ ] Add heartbeat/lease expiry and stale-task recovery.
- [ ] Add bounded retry/backoff and dead-letter state.
- [ ] Make task execution idempotent.
- [ ] Define cancellation semantics and race handling.
- [ ] Add per-tenant concurrency/usage limits.
- [ ] Add audit events and operational metrics.

**Exit gate:** queue-to-worker integration tests pass, including retries, crashes, cancellation and duplicate delivery.

## Phase 3 — Conversation and AI product functionality

- [ ] Define conversation/message schema and retention policy.
- [ ] Define API contract for create/list/get/rename/archive conversations.
- [ ] Enforce tenant ownership on every conversation/message query.
- [ ] Add pagination and bounded message size.
- [ ] Choose SSE or WebSocket based on actual streaming requirements.
- [ ] Implement cancellation, reconnect, error and retry states.
- [ ] Persist assistant/user messages safely.
- [ ] Add token/usage metering from provider responses; do not invent usage.
- [ ] Add moderation/safety and output rendering controls appropriate to product scope.

**Exit gate:** end-to-end authenticated conversation flow with persistence, ownership and streaming tests.

## Phase 4 — Frontend integration

- [ ] Keep React 18 baseline unless a separate major-version migration is approved.
- [ ] Do not install Lumen React v5 into React 18; catalog metadata indicates React >=19 and motion ^14 peer requirements.
- [ ] Choose a React-18-compatible UI approach or plan a separately tested React 19 migration.
- [ ] Confirm Auth0 tenant domain, SPA client ID, API audience and exact callback origins.
- [ ] Integrate Authorization Code + PKCE and request API access tokens.
- [ ] Keep tokens out of localStorage and logs.
- [ ] Add typed API client and structured error mapping.
- [ ] Build responsive chat layout, message history, composer, stop/retry and empty/error states.
- [ ] Add keyboard and screen-reader checks.

**Exit gate:** browser tests pass for login, logout, protected routes, API access, error handling and mobile viewport.

## Phase 5 — MCP developer tooling (optional)

- [ ] Keep existing GitHub connector.
- [ ] Add Context7 only if docs lookup is a recurring need.
- [ ] Choose one browser tool: Playwright MCP, Playwright CLI, or Chrome DevTools MCP.
- [ ] Keep Auth0/Supabase/Cloudflare MCP disconnected until target account/platform is confirmed.
- [ ] Use read-only and least-privilege scopes first.
- [ ] Record server version, license, transport, permission scope and rollback procedure.
- [ ] Never expose MCP credentials to the browser.

**Exit gate:** MCP security review and a successful harmless read-only test.

## Phase 6 — Quality, security and release

- [ ] Unit, API integration, contract and browser tests.
- [ ] Typecheck and production build.
- [ ] Dependency/license audit and secret scan.
- [ ] Threat model and authorization review.
- [ ] RLS/tenant isolation tests.
- [ ] WCAG 2.2 AA-oriented accessibility checks.
- [ ] Performance and mobile responsiveness checks.
- [ ] Backup/restore and rollback plan.
- [ ] Production environment configuration review.
- [ ] Human release approval before deploy.

## Explicit non-goals until approved

No automatic migration, production DB write, paid plan activation, DNS change, secret rotation, merge, deployment or destructive operation is authorized by this roadmap.


---

## Source-level issue confirmed in task repository — 2026-11-16

The current `createTask` implementation handles a unique-key conflict by selecting and returning the existing task. It does not compare the existing row's `agent_id` and `input` against the new request. Therefore, reusing the same tenant-scoped idempotency key for a different request can silently return an unrelated earlier task.

**Required repair before worker implementation:**
1. Normalize the idempotency payload deterministically (agent ID + canonical JSON input).
2. On conflict, compare the stored request payload with the incoming payload.
3. Return the existing task only when the request is identical.
4. Return a deterministic 409 conflict for same key + different payload.
5. Add repository integration tests for same-key/same-payload and same-key/different-payload cases.
6. Preserve tenant isolation and ensure agent ownership is enforced by the composite tenant/agent foreign key and authorization checks.

The current task contract test validates only the Zod request schema; it does not exercise database idempotency behavior. This repair should be a focused source-code patch, reviewed and tested before adding a worker.
