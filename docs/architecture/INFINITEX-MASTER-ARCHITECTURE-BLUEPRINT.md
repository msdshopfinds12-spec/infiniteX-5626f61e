# InfiniteX Master Architecture Blueprint

**Status:** PROPOSED TARGET ARCHITECTURE — NOT IMPLEMENTED OR RUNTIME-VERIFIED  
**Scope:** Documentation-only design baseline  
**Repository:** msdshopfinds12-spec/infiniteX-5626f61e

## 1. Product direction

InfiniteX is intended to become an **AI Engineering & Automation Ecosystem** that helps people inspect, plan, build, test, debug, audit, document, and improve software. Its differentiator is not the number of AI models or agents. It is trustworthy engineering execution: bounded capabilities, independently verified results, strong security boundaries, transparent cost, and human control.

Product promise: every capability reports what it can do, what evidence supports it, what remains unverified, and which approval is required next.

The twelve product pillars are:
1. Unified AI Command Center.
2. Specialist multi-agent collaboration.
3. Evidence-driven engineering lifecycle.
4. Security-first code and configuration review.
5. Verifiable tests and capability status.
6. Provider-neutral model routing.
7. Free-first and quota-aware operation.
8. Mobile-first engineering workspace.
9. Visual automation with dry-run and approval.
10. Digital-product and business workflow modules.
11. Project memory, provenance, and audit history.
12. Modular extension architecture.

These are target capabilities, not claims about the current implementation.

## 2. Verified starting point and constraints

The inspected retry-policy branch contains a Vite/React application, TypeScript build tooling, Node test scripts, and Supabase Edge Function source files. The package manifest inspected on that branch does not by itself prove a live Supabase connection, deployed backend, working authentication, production schema compatibility, or successful end-to-end execution.

Known constraints for implementation:
- Treat current demo/static data as demo data until a live integration is proven.
- Backend selection and schema provenance remain pending verification.
- Use synthetic data and a disposable database for integration tests.
- Keep paid providers disabled unless a human explicitly approves a named provider and budget.
- No production migrations, data writes, secret changes, merges, or deployments are authorized by this document.
- Do not introduce infrastructure or frameworks without a measurable requirement.

## 3. Non-negotiable engineering principles

1. Evidence before claims: status is tied to a commit, environment, method, and artifact.
2. Read-only by default: inspection is the default permission.
3. Human approval for consequential side effects.
4. Least privilege at UI, API, database, CI, and tool boundaries.
5. One canonical backend and one canonical source of truth for each domain.
6. Server-derived identity and workspace authorization.
7. Database tenant isolation reinforced by server authorization.
8. Bounded execution: attempts, duration, concurrency, payload, output, and cost.
9. Idempotency for retried side effects; never retry an unsafe operation blindly.
10. Fail closed when identity, policy, approval, schema, or evidence is missing.
11. Modular monolith first; split services only when operational evidence justifies it.
12. Mobile-first responsive UX and accessible interaction.
13. Free-first does not mean unlimited; quotas and service limits must be visible.
14. Model output is untrusted input and cannot grant itself permissions.

## 4. Target system architecture

Human operator  
→ React + TypeScript + Vite workspace  
→ authenticated, runtime-validated API client  
→ one canonical trusted backend  
→ domain services and workflow coordinator  
→ PostgreSQL / canonical persistence  
→ narrowly scoped external provider and tool adapters

The browser must not contain service-role keys, provider secrets, privileged GitHub credentials, or authorization logic that the server is expected to enforce.

### Canonical backend decision

**Not yet decided.** Supabase Edge Functions and the existing standalone Node API must not become competing authorities for the same business operations. First inventory deployed functions, database schema, RLS, grants, API usage, and environment configuration using read-only inspection. Then create ADR-001 selecting one canonical backend and documenting the migration path. Until that decision is evidence-backed, do not build new cross-cutting business logic into both backends.

## 5. Logical module boundaries

| Module | Responsibility | Default authority |
|---|---|---|
| Command Center | Project health, work queue, approvals, evidence | Read-only presentation |
| Project Intelligence | Repository inventory, dependency and architecture maps | Read-only scanners |
| Task Planner | Goals into bounded tasks, dependencies, acceptance criteria | Suggest; human confirms |
| Agent Registry | Versioned agent roles and capability declarations | Configuration only |
| Orchestrator | Bounded task/step scheduling and result collection | Trusted backend |
| Model Gateway | Provider routing, timeout, fallback, quota | Server-side; disabled by default |
| Tool Gateway | GitHub, test, file, database, deployment adapters | Scoped permissions |
| Build & Test | Reproducible commands and evidence artifacts | Isolated execution |
| Debug & Review | Diagnosis and patch proposals | Advisory until approved |
| Security Center | Code, dependency, RLS, and workflow checks | Read-only audit |
| Automation Studio | Trigger-condition-action workflows | Dry-run first |
| Cost & Quota | Budget, quota, and usage visibility | Server-enforced policy |
| Audit & Memory | Decisions, events, evidence references | Restricted append-only trail |
| Release Control | Readiness, approval, rollback records | Human-controlled |

A screen, prompt, TypeScript interface, or mock response is not proof that a module is implemented.

## 6. Multi-agent operating model

Agents are role-scoped workers, not independent authorities.

| Role | Required output | Default tools |
|---|---|---|
| Architect | ADR, component map, risks, sequence | Repository read, documentation |
| Planner | Task graph and acceptance criteria | Read-only project metadata |
| Developer | Small patch proposal and changed-file manifest | Isolated branch patch |
| Debugger | Reproduction, hypotheses, regression test | Source, logs, test output |
| QA Engineer | Test plan and execution evidence | Disposable test environment |
| Security Auditor | Threat model and evidence-linked findings | Read-only source/config |
| UX Auditor | Accessibility and usability findings | UI/source inspection |
| Independent Reviewer | Diff review and gate recommendation | Read-only diff and CI |
| Release Reviewer | Release checklist and rollback assessment | Read-only evidence |

Every task must carry a task ID, project/workspace scope, correlation ID, objective, allowed paths, allowed tools, denied tools, timeout, step/output limits, cost ceiling, expected output schema, evidence references, and approval requirements.

Agent output is untrusted. A deterministic policy layer validates it before any tool adapter can act. No agent may approve its own consequential action or mark its own unexecuted tests as passed.

## 7. Data domains and ownership

This is a logical data model, not executable SQL and not a verified inventory of the live database. Exact tables, columns, constraints, RLS policies, grants, RPC definitions, and migration order must come from a read-only schema inventory.

| Domain | Example records | Invariants |
|---|---|---|
| Identity | users, sessions | Identity derives from verified auth context |
| Workspace | workspaces, memberships | Membership checked server-side |
| Projects | projects, repository connections | Every project belongs to one workspace |
| Tasks | tasks, dependencies, task_steps | Explicit state machine and actor |
| Agents | agent_profiles, versions, grants | Versioned and least-privilege |
| Executions | runs, attempts, step_runs | Attempt generation fences stale workers |
| Approvals | approval_requests, decisions | Scoped, expiring, action-bound |
| Integrations | provider_connections, tool_grants | Secret references only |
| Audit | audit_events, evidence_refs | Append-only semantics and attribution |
| Usage | usage_events, budget_policies | Server-measured usage where available |
| Artifacts | artifact metadata, hashes | Access checked independently |

Data requirements:
- Enforce tenant ownership in server authorization and database RLS.
- Use foreign keys, unique/check constraints, and transactional state changes.
- Never use production data as an integration-test fixture.
- Do not put raw API keys, cookies, bearer tokens, or service-role credentials in tables, prompts, logs, or artifacts.
- Define retention, export, deletion, backup, and restore policies before production use.
- Do not invent schema from frontend assumptions or stale migration notes.

## 8. API contract standard

Use versioned routes or an equivalent documented function contract, runtime schema validation, stable machine-readable error codes, pagination limits, request timeouts, rate limits, and payload-size limits.

Success response:
- data: validated response payload
- meta: request/correlation ID and pagination cursor where applicable

Error response:
- error.code: stable machine-readable code
- error.message: safe user-facing message
- error.request_id: correlation ID
- error.retryable: explicit boolean

The authenticated principal, workspace membership, role, budget, and approval state must be derived or verified by the backend. Never trust client-supplied owner IDs or role claims. State-changing requests need transactional idempotency keys and optimistic concurrency/version checks. Do not return stack traces, SQL errors, provider raw errors, or secrets.

## 9. Workflow state machine and reliability

Proposed run states:

queued → claimed → running → succeeded  
                     ↘ failed  
                     ↘ cancelled  
                     ↘ awaiting_approval  
                     ↘ retry_scheduled

Reliability invariants:
- Every claim has an attempt/generation token.
- A worker may commit a result only if its generation is still current.
- Parent run state and ownership are checked transactionally before step transitions.
- Stale workers cannot overwrite newer attempts.
- Retries require a retryable classification, remaining attempt/time budget, and idempotent side-effect contract.
- Persist delayed retries; do not sleep in request handlers.
- Check cancellation at safe boundaries.
- Terminal transitions are monotonic and audited.
- Test competing claims, duplicate requests, stale completion, cancellation, and recovery with a disposable database and independent connections.

## 10. Security model

Threats include cross-tenant access, IDOR, prompt injection in repository files and issue text, secret exfiltration, excessive tool privileges, replay, stale workers, race conditions, unbounded loops/cost, supply-chain compromise, and unsafe generated-code execution.

Required controls:
1. Authenticate every protected request and fail closed.
2. Resolve workspace membership and roles server-side.
3. Enforce RLS and least-privilege grants; privileged operations use narrow server-side contracts.
4. Separate read, propose, approve, and execute permissions.
5. Bind approvals to the exact action, target, environment, and diff/content hash; expire them.
6. Treat repository, web, log, issue, and model content as untrusted data.
7. Keep secrets out of model context and redact sensitive data before logs.
8. Run generated code only in an isolated environment without production credentials.
9. Use minimal GitHub Actions token permissions and immutable action references where feasible.
10. Add dependency, lockfile, secret, and artifact-integrity checks.
11. Enforce rate, concurrency, time, payload, and cost ceilings.
12. Test tenant isolation, authorization denial, replay, stale-worker rejection, and secret redaction.

## 11. Human approval matrix

| Operation | Default |
|---|---|
| Read scoped repository metadata/source | Allow when connected and authorized |
| Draft architecture, test plan, or code diff | Allow as proposal |
| Create branch, commit, push, or open PR | Explicit scoped approval |
| Merge PR | Deny until explicit release approval |
| Read production metadata | Read-only and separately scoped |
| Write production data or apply migration | Deny; separate approval and rollback plan |
| Read/reveal secrets | Deny |
| Change secrets or provider configuration | Deny pending secure approval |
| Enable paid provider or incur cost | Deny until provider and budget approved |
| Deploy, publish, or change domain | Deny until release approval |
| Delete resources/data | Deny; exact target and recovery plan required |

A UI checkbox is not authorization. The trusted backend/tool adapter must enforce approval.

## 12. Evidence and maturity statuses

Use these exact statuses:
- VERIFIED — reproducible execution/inspection evidence exists for a named commit and environment.
- PARTIAL — some components exist or pass, but the complete contract is unproven.
- BLOCKED — a concrete prerequisite, failure, quota, or policy prevents progress.
- NOT TESTED — adequate execution evidence is absent.
- NOT IMPLEMENTED — no implementation was found in the inspected scope.

Each status record should include checked_at, commit SHA, environment, method, result, evidence URI, limitations, and reviewer. A source-level unit test does not prove live integration. A successful deployment does not prove authorization. A model response does not prove safe tool execution.

## 13. Observability

Carry correlation IDs across UI, API, worker, provider, and audit trail. Record actor/workspace references, state transitions, policy decisions, approval references, durations, retry counts, safe error codes, provider/model identifiers, measured usage where available, and artifact hashes/source commit SHA.

Never log tokens, cookies, API keys, private key material, or unrestricted request bodies. Define audit retention and access controls before enabling production persistence.

## 14. Testing and release gates

| Layer | Required proof |
|---|---|
| Unit | Pure policies, validators, state transitions, retry calculations |
| Contract | API schemas, errors, pagination, idempotency |
| Integration | Disposable DB, RLS, grants, RPC, transactions |
| Concurrency | Competing claims, duplicate/replay, stale attempts |
| Security | Tenant isolation, IDOR, authz denial, prompt injection, redaction |
| UI | Loading, empty, error, permission, keyboard, touch, accessibility |
| E2E | Authenticated user journey through persisted backend state |
| Build | Locked install, typecheck, lint, tests, production build |
| Release | Exact SHA, artifact integrity, rollback, backup/restore, approval |

Block release for unresolved critical security/data-integrity findings, missing required checks, unknown schema provenance, or absent rollback evidence.

## 15. Phased implementation roadmap

### Phase A — Repository truth
Reconcile open PR dependencies, base branches, workflow triggers, exact-head CI results, current build/test commands, and duplicate docs. Preserve the existing working baseline.

### Phase B — Backend and database truth
Read-only inventory of deployed functions, schema, RLS, grants, RPCs, migration history, auth/session model, and actual frontend API calls. Produce a verified boundary map and ADR-001. No speculative DDL.

### Phase C — Secure vertical slice
Implement one authenticated workspace/project read path with server-derived identity, RLS, negative cross-tenant tests, standard errors, and audit evidence.

### Phase D — Safe mutation slice
Add one task create/status transition with idempotency, optimistic concurrency, transactional audit, and approval enforcement. Test duplicate, replay, race, and denial behavior.

### Phase E — Engineering Intelligence Core
Add repository inventory, task planner, versioned agent registry, and bounded orchestration. Keep model providers disabled until provider, data handling, quota, and budget are approved.

### Phase F — Developer workspace
Add GitHub read-only inventory, patch proposals, isolated test execution, and independent diff review. No autonomous merge.

### Phase G — Security, automation, and cost controls
Add tool gateway, approvals, audit, budgets, quotas, circuit breakers, and dry-run automation. Prove denial and recovery paths.

### Phase H — Mobile-first product completion
Replace demo panels incrementally with verified data. Test Android viewport behavior, accessibility, loading/error states, and performance.

### Phase I — Release readiness
Verify exact-SHA CI, security audit, migration plan, backup/restore, rollback, and human release approval.

## 16. Technology strategy

Prefer the technologies already present before adding dependencies:
- React, TypeScript, and Vite for the web workspace.
- Existing Node test tooling for pure policy/unit tests.
- Supabase components only after the deployed backend and live schema are verified.
- GitHub branches and draft PRs for reviewable changes.
- Provider-neutral interfaces to avoid coupling domain logic to one AI vendor.

Do not add a queue service, vector database, microservice platform, agent framework, paid model, or new hosting provider without a measurable requirement. A PostgreSQL-backed queue/state machine may be simpler at low volume, but only if its locking and transaction behavior are tested.

## 17. Architecture Decision Records required

- ADR-001: Canonical backend — Supabase Edge Functions or standalone Node API.
- ADR-002: Identity, session, and workspace authorization.
- ADR-003: Tenant model, RLS, grants, and privileged data access.
- ADR-004: Workflow state machine, attempt fencing, retry, and idempotency.
- ADR-005: Agent/tool permissions and approval token semantics.
- ADR-006: Provider routing, fallback, quotas, and cost accounting.
- ADR-007: Audit evidence storage, retention, and privacy.
- ADR-008: Isolated code execution and repository patch sandbox.
- ADR-009: Deployment platform, free-tier limits, and release controls.

Every ADR must state context, options, decision, consequences, security/cost implications, migration path, and verification plan.

## 18. Immediate next actions

1. Verify PR #36 workflow runs against its exact head SHA; distinguish GitHub Actions from Vercel preview failures.
2. Inspect the transactional-fencing PR and its test isolation contract.
3. Inventory schema/RLS/RPC/migration provenance read-only.
4. Decide the canonical backend in ADR-001 before implementing new cross-cutting services.
5. Deliver one secure, authenticated, tenant-isolated vertical slice.
6. Expand modules only when the previous gate has reproducible evidence.

## 19. Explicit safety boundary

This document is a design proposal only. It does not authorize production database access beyond separately approved read-only inspection, schema/data writes, migrations, secret access or rotation, provider activation, paid usage, repository settings changes, merges, deployments, publishing, DNS changes, or deletion.

Required lifecycle:

**INSPECT → PLAN → APPROVE → BUILD → TEST → DEBUG → AUDIT → DOCUMENT → RELEASE APPROVAL**

The first milestone is a proven secure vertical slice, not a large set of disconnected feature screens.
