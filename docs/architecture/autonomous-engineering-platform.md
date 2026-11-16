# InfiniteX Autonomous Engineering Platform

**Status: FOUNDATION SPECIFICATION + DETERMINISTIC GUARDRAIL IMPLEMENTATION. Runtime integration and CI verification remain pending.**

## 1. Design objective

Build a repository-aware engineering assistant that can inspect, explain, propose, and verify changes while preserving human control over all protected operations. The system is not an unrestricted self-modifying agent.

## 2. Logical architecture

| Plane | Responsibility | Trust boundary |
|---|---|---|
| Experience | React/TypeScript workspace and review UI | Untrusted client |
| API | FastAPI endpoints, authentication, request validation | Server-side identity |
| Orchestration | Task lifecycle, bounded agent coordination | Policy-mediated |
| Repository intelligence | File inventory, dependency graph, change impact | Read-only by default |
| Proposal engine | Structured file-change proposals | No execution authority |
| Policy engine | Path, size, operation, base-SHA and approval rules | Deterministic |
| Verification workers | Tests, type checks, static analysis | Ephemeral sandbox |
| Evidence store | Proposal, test and approval records | Append-only intent |
| Release control | Merge, migration and deployment authorization | Separate human gate |

## 3. Proposal lifecycle

1. Capture repository identity, target branch and exact base commit SHA.
2. Inspect the relevant files and dependency edges without modifying the checkout.
3. Produce a structured proposal with bounded file operations.
4. Validate schema, base SHA, paths, extensions, file count and byte limits.
5. Reject protected paths, deletions and unapproved operations.
6. Present the exact diff and risk summary to a human reviewer.
7. After approval, apply the patch in a disposable workspace.
8. Run allowlisted checks with network disabled by default, resource limits and a fixed timeout.
9. Record commit SHA, tool versions, test commands, exit codes and artifact digests.
10. Require a separate approval for any PR, merge, migration or deployment.

A generated proposal cannot create or satisfy its own approval. An approval is bound to the proposal digest, base commit, target branch and permitted operation set. Any change invalidates that approval.

## 4. Repository intelligence

The read-only analyzer should emit:
- file inventory and language counts;
- import/package dependency edges;
- entry points and API route inventory;
- workflow and test coverage inventory;
- changed-file impact sets;
- unresolved imports and dependency cycles;
- confidence and provenance for every inferred edge.

Do not infer runtime reachability from imports alone. Mark heuristic relationships as inferred, not verified.

## 5. Patch engine constraints

The initial guardrail implementation in `iq_core/engineering_guardrails` is intentionally narrow:
- exact 40-character base commit SHA;
- bounded proposal identifier;
- maximum 20 files;
- maximum 256 KiB per file and 1 MiB total;
- allowlisted roots and text extensions;
- no deletions;
- no workflow, migration, secret, credential, lockfile or environment-file changes;
- no shell execution or patch application.

This is a first safety boundary, not a complete sandbox or a substitute for code review.

## 6. Verification workers

Workers must use disposable checkouts pinned to the proposal's exact base SHA. They must not receive production credentials, repository write tokens, deployment credentials or unrestricted network access. Resource limits and timeouts are mandatory. A worker's output is evidence only; it cannot approve or publish a change.

## 7. Evidence and audit model

Record proposal ID and digest, repository, branch, base SHA, changed paths, policy version, validation result, reviewer identity, approval timestamp, sandbox image/toolchain, command allowlist, test outcomes, artifact digests and final disposition. Never record raw secrets or bearer tokens.

## 8. Release gates

- CI green on the exact candidate commit.
- Security and dependency review complete.
- Human review of the final diff.
- Separate explicit authorization for PR creation, merge, database migration and deployment.
- Rollback and recovery plan documented.

Passing CI is necessary but does not establish production readiness.
