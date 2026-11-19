# Phase 6 — Secure Agent Capability Integration

**Status:** PARTIAL IMPLEMENTATION — automated verification pending  
**Target branch:** `feat/infiniteX-zero-budget-implementation`  
**Release state:** BLOCKED pending implementation, tests, audit, and human release approval  
**Budget constraint:** ₱0-first; no paid provider, hosted worker, or new billable service by default

## 1. Objective

Connect InfiniteX's existing agent registry, policy layer, local adapter runtime, task lifecycle, and Task Center through explicit contracts while preserving a deny-by-default security model. The first deliverable is a useful local-only workflow. External model providers and remote execution remain optional, disabled, and separately approved.

## 2. Non-goals and hard boundaries

- No arbitrary code execution, shell access, dynamic imports, filesystem access, or unrestricted network access.
- No claim that a JavaScript module is an OS-level sandbox.
- No client-side approval treated as server authorization.
- No secrets, provider keys, or privileged credentials in browser bundles.
- No silent provider calls, paid usage, billing activation, database migration, production deployment, merge, or changes to `main`.
- No copying third-party repository code until license, provenance, dependency, and security review are complete.
- No fabricated AI capability: deterministic local adapters must be labelled as local tools, not model inference.

## 3. Target architecture

```text
React / PWA Task Center
        |
        | authenticated, versioned request
        v
API boundary (server-only)
  - identity verification
  - request schema validation
  - request size limits
  - rate / concurrency limits
        |
        v
Authorization + Approval Policy
  - deny by default
  - server-side permission check
  - capability allowlist
  - approval bound to task + action + expiry
        |
        v
Agent Orchestrator
  - registry lookup
  - capability contract validation
  - bounded execution
  - cancellation / timeout
        |
        +----------------------+
        |                      |
        v                      v
Local Adapter Runtime     Optional Provider Adapter
  - text.metrics            - disabled by default
  - task.preview            - explicit configuration
  - pure bounded work       - secret server-side only
        |                      |
        +-----------+----------+
                    v
             Task Event Store
       - validated state transitions
       - append-oriented event model
       - redacted structured audit records
                    |
                    v
              Task Center UI
```

The diagram is a target design, not a claim that these services already exist.

## 4. Security invariants

1. **Deny by default:** unknown agent IDs, capabilities, versions, permissions, and task states are rejected.
2. **Server authority:** authorization is recomputed at the server boundary; UI state is presentation only.
3. **Least privilege:** each capability declares input/output schemas, maximum payload sizes, timeout, concurrency ceiling, and required permission.
4. **No ambient authority:** adapters receive only validated input and a narrow execution context; never pass process, filesystem, environment, or unrestricted fetch objects.
5. **Bounded work:** enforce request bytes, output bytes, execution deadline, and queue/concurrency limits.
6. **Safe cancellation:** cancellation is cooperative and state transitions are idempotent; a cancellation request does not imply a task has stopped until confirmed.
7. **Audit hygiene:** never store access tokens, secrets, raw credentials, or unbounded user payloads in events.
8. **Replay resistance:** approval records are scoped to task ID, action, capability version, user identity, and expiry; one approval cannot authorize a different task.
9. **Deterministic local mode:** local capability execution must remain network-free and reproducible.
10. **Honest status:** report queued, running, succeeded, failed, cancelled, or timed-out only when the corresponding transition is confirmed.

## 5. Versioned contracts to define before implementation

### Agent descriptor

- `id`: stable, namespaced identifier
- `version`: semantic version
- `label`: display-only name
- `capabilities`: explicit capability IDs
- `inputSchema` / `outputSchema`: strict schemas
- `permissions`: explicit permission identifiers
- `limits`: input bytes, output bytes, timeout, concurrency
- `executionMode`: `local` or separately approved `remote`

### Task request

- `schemaVersion`
- `taskId` (server-issued or validated idempotency key)
- `agentId` + `agentVersion`
- `capabilityId`
- `input`
- `approvalRef` when the policy requires approval

### Task event

- `eventId`, `taskId`, `sequence`, `occurredAt`
- `type`, `fromState`, `toState`
- `actorType`, pseudonymous `actorRef`
- `capabilityId`, `capabilityVersion`
- bounded, redacted `metadata`
- `schemaVersion`

Do not introduce a persistent database dependency until the repository's current backend choice, free-tier limits, and migration approval are confirmed. The first implementation may use an in-memory repository interface for tests and local demo mode, explicitly labelled non-durable.

## 6. Task lifecycle

Allowed transitions must be explicit and tested:

- `pending_approval -> rejected`
- `pending_approval -> queued` only after server-side approval
- `queued -> running`
- `running -> succeeded`
- `running -> failed`
- `queued -> cancelled`
- `running -> cancelling -> cancelled` only after cooperative stop is confirmed
- `running -> timed_out` only after deadline enforcement is observed

Terminal states are immutable. Duplicate transition requests must be idempotent or rejected without duplicating side effects. Unknown transitions fail closed.

## 7. Implementation sequence and acceptance criteria

### 6A — Architecture and contract baseline

- Map existing exports and imports for registry, policy, orchestrator, runtime, lifecycle, and UI.
- Record actual interfaces and avoid duplicate abstractions.
- Define versioned contracts and threat model.
- Acceptance: every target module and integration point is linked to an existing file or explicitly marked new.

### 6B — Agent capability integration

- Connect registry lookup to the existing capability allowlist.
- Validate descriptors and inputs at the boundary.
- Reject unknown, disabled, or version-mismatched capabilities.
- Acceptance: positive and negative contract tests cover every registered capability.

### 6C — Authorization and approval

- Introduce server-verifiable approval records, scoped to the task/action/capability and expiry.
- Keep UI approval as an intent signal only.
- Acceptance: forged, expired, replayed, cross-task, and unauthorized approvals are rejected.

### 6D — Bounded execution

- Add an async execution adapter only where the current runtime contract requires it.
- Enforce deadline, output bound, concurrency bound, and cooperative cancellation.
- Acceptance: timeout, cancellation race, duplicate request, adapter throw, and overload tests pass.

### 6E — Audit and persistence seam

- Define an append-oriented event repository interface and redaction policy.
- Provide in-memory implementation for tests/demo.
- Persistent adapter remains blocked until backend selection and migration approval.
- Acceptance: event ordering, state transition integrity, redaction, and failure behavior are tested.

### 6F — InfiniteX interface

- Show capability type, local/provider mode, permission, approval state, and task state.
- Provide accessible pending/running/success/failure/cancelled states.
- Avoid implying a local tool is an autonomous AI agent.
- Acceptance: keyboard, screen-reader labels, mobile layout, and error-state tests pass.

### 6G — Verification and release assessment

- Run formatting/lint/type checks, unit and integration tests, browser tests, accessibility checks, production build, dependency audit, and secret scan where available.
- Record exact commit SHA and workflow run IDs.
- Acceptance: all required checks pass on the final branch head; no unresolved critical/high security findings; release remains blocked until human approval.

## 8. Free-first implementation alternatives

| Need | Preferred first option | Constraint |
|---|---|---|
| Local capability execution | Existing local adapter runtime | Keep bounded and deterministic |
| Task repository in tests | In-memory repository interface | Not durable; label clearly |
| Local development API | Existing server runtime if compatible | No new hosted service assumed |
| Persistence | Defer backend selection | No migration until explicit approval |
| AI inference | No provider by default | Use provider adapter only after cost, privacy, and key handling review |
| Background work | In-process bounded queue for demo | Not durable across restarts |
| Production queue | Evaluate only after backend and hosting review | May incur cost; blocked by ₱0 policy |

## 9. Repository reuse policy

Other repositories may contribute ideas, test patterns, or independently licensed modules only after:
- repository identity and source commit are recorded;
- license and attribution obligations are verified;
- dependencies and transitive licenses are reviewed;
- secrets, network behavior, execution privileges, and telemetry are inspected;
- compatibility and maintenance burden are assessed;
- a human approves importing the code.

Do not combine repositories wholesale or treat multiple AI systems as one executable intelligence. Reuse verified components through narrow, testable interfaces.

## 10. Current evidence and unresolved items

- Existing local runtime capabilities: `text.metrics` and `task.preview` were previously inspected.
- Existing branch CI: prior workflow runs reported 48/48 frontend checks and 10/10 browser/accessibility checks. Re-run against the final Phase 6 head before claiming Phase 6 verification.
- Existing runtime is not an OS sandbox.
- Backend/database selection and durable persistence are not confirmed.
- Real identity provider and server API deployment are not confirmed.
- Physical Android install/offline behavior is not yet verified.
- Branch divergence from `main` must be reconciled in a separate review; do not force-push or merge as part of this phase.

## 11. Phase 6C implementation note — approval primitive

The branch now contains `server/ai/approval-authority.mjs`, with tests in `tests/approval-authority.test.mjs`.

Implemented behavior:
- opaque random tokens are returned once; only SHA-256 token digests are retained in memory;
- each grant is bound to principal subject, task ID, action, capability ID, and capability version;
- grants expire and are single-use;
- forged, replayed, cross-principal, cross-task, cross-action, cross-capability, and cross-version attempts are rejected;
- storage is bounded and does not evict live approvals to make room.

**Critical limitation:** this is an in-memory approval primitive, not user authentication, not a deployed API, and not durable across process restarts. The principal MUST be derived by verified server authentication middleware. Never trust a subject or approval decision supplied directly by the browser. It is not yet wired into a production execution route or the Task Center.

## 12. Phase 6C execution-service implementation note

The branch also contains `server/ai/approved-capability-service.mjs`, with tests in `tests/approved-capability-service.test.mjs`.

The service composes the approval authority with the local capability executor:
- an injected server-side authorization callback must authorize approval and execution separately;
- an injected trusted task-state reader must confirm the task is awaiting approval;
- an approval is consumed once and is bound to the principal, task, action, capability, and version;
- an injected atomic task-claim callback must move/claim the task so concurrent grants cannot execute the same task twice;
- a consumed grant is not restored after execution failure (fail-closed behavior);
- adapter errors are normalized to avoid leaking internal messages.

**Critical limitation:** this is a server-side service primitive, not an HTTP route, authentication middleware, or durable task repository. The callbacks must be implemented against trusted server identity and task state before exposure to a client. Current test callbacks are synthetic fixtures, not production authorization.

## 13. Change-control gates

This plan authorizes implementation only on `feat/infiniteX-zero-budget-implementation`. It does not authorize:
- changes to `main`;
- force push, branch deletion, or merge;
- deployment or production configuration changes;
- billing or paid services;
- database migrations or destructive data operations.

Any such action requires a separate explicit approval.

---
**Engineering rule:** PLAN → BUILD → TEST → AUDIT → RELEASE APPROVAL. No phase is marked complete without evidence from the exact commit being assessed.
