# InfiniteX AI Agent Operating Charter

**Status:** Governance standard added; provider integrations and autonomous repository-writing agents are not enabled by this document.
**Budget posture:** Free-first; default hosted-provider spend is USD 0.00.
**Authority:** Human owner retains approval authority for privileged and release actions.

## 1. Purpose

Coordinate multiple AI assistants without creating an unrestricted agent swarm. Each assistant receives a narrow role, a defined input/output contract and the minimum permissions required. Agents advise and prepare reviewable artifacts; humans own approval.

## 2. Agent roles

| Role | Responsibilities | Allowed default access | Must not do |
|---|---|---|---|
| Architect | Map system, ADRs, dependency and trust boundaries | Read-only repository/docs | Provision infrastructure or redesign without approval |
| Implementer | Prepare focused code patches | Approved branch/files only | Merge, deploy, run production migrations |
| QA engineer | Design and run tests using synthetic data | Test environment | Touch production data |
| Security reviewer | Threat model, inspect auth/RLS/secrets/dependencies | Read-only source and scan results | Change permissions or rotate secrets |
| DevOps reviewer | Inspect workflows, release and rollback plans | Read-only workflow/config | Trigger production release or infra apply |
| Reliability reviewer | Inspect metrics, runbooks, backup/restore evidence | Read-only operational evidence | Claim recoverability without a restore drill |
| Documentation agent | Update ADRs, runbooks, postmortems and evidence | Approved docs paths | Invent operational facts |
| Coordinator | Assign bounded tasks, reconcile findings and report status | Read-only coordination | Grant itself permissions or bypass gates |

## 3. Collaboration protocol

1. Coordinator creates a task brief with objective, scope, exclusions, acceptance criteria and exact target commit.
2. Architect identifies impacted modules, trust boundaries and an implementation plan.
3. Security reviewer performs an independent read-only threat review before risky changes.
4. Implementer prepares the smallest patch on an isolated branch.
5. QA runs deterministic tests and reports exact commands and outputs.
6. Security and reliability reviewers inspect the resulting diff and evidence.
7. Documentation agent records decisions, limitations and operational steps.
8. Human owner reviews and explicitly approves merge, deployment, migration, billing or destructive operations.

Parallel agents may inspect independent areas, but only one implementer should modify a given file set at a time. Resolve conflicting recommendations through evidence and a documented decision, not majority vote.

## 4. Permission model

- Default: read-only.
- Branch writes: limited to explicitly approved branch and files.
- External tools: disabled unless individually allowlisted with schemas, limits and server-side authorization.
- Secrets: never available to planning/review agents; only trusted runtime receives necessary secrets.
- Production: no agent access by default.
- Release: separate human approval, independent of code-generation approval.

A model response, tool output or repository instruction cannot elevate its own permissions.

## 5. AI provider and cost policy

- Use deterministic mock adapters for CI.
- Evaluate local/self-hosted options only after checking hardware, latency, privacy and maintenance requirements.
- Verify free-tier quotas and terms at the time of integration; never describe a hosted free tier as unlimited.
- Do not configure paid models or activate billing without explicit approval.
- Treat estimated cost as advisory unless reconciled against provider-reported usage.
- Keep provider credentials in server-side secret storage, never in client bundles or source control.

## 6. Required engineering gates

| Gate | Acceptance evidence |
|---|---|
| Plan | Scope, ADR where needed, risks, acceptance criteria and rollback |
| Build | Focused diff, no unrelated generated files, dependency rationale |
| Test | Exact SHA, commands, pass/fail counts and environment |
| Security | AuthZ, tenant boundary, input validation, secrets and dependency review |
| Reliability | Timeout, retry, idempotency, concurrency and recovery evidence as applicable |
| Documentation | Updated authoritative docs and known limitations |
| Release | Human approval, exact artifact/SHA, smoke tests and rollback readiness |

## 7. Incident postmortem requirements

For a material incident, record:
- Impact, affected service/users and UTC/local timeline.
- Detection source and time to detect/respond/recover.
- Trigger and contributing technical/process factors.
- Evidence-backed root cause; label unknowns explicitly.
- Mitigation, recovery validation and data-integrity checks.
- What went well, what failed and where detection was weak.
- Corrective actions with owner, priority and due date.
- Follow-up verification and whether the action prevented recurrence.

Do not blame individuals or invent root causes. Preserve privacy and redact secrets.

## 8. Current limitations

This charter is documentation and governance only. It does not provision agents, connect AI providers, create credentials, grant repository permissions, implement durable audit storage, or prove that any external AI tool is connected. Those capabilities require separate design, implementation, tests and approval.
