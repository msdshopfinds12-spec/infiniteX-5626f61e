# Phase 3D-3 — InfiniteX AI Orchestration Foundation

**Status:** Foundation scaffold implemented; no live provider is configured.  
**Branch:** \`feat/phase-3d3-ai-orchestration-foundation\`  
**Base:** Phase 3D-2 security branch.

## 1. Objective

Introduce a small, provider-neutral orchestration core that can be extended after a trusted backend exists. This phase intentionally does not connect an external AI provider, store credentials, execute generated code, or invoke repository tools.

## 2. Current implementation

- \`src/lib/ai/agent-registry.mjs\`: validated, immutable agent metadata registry.
- \`src/lib/ai/policy.mjs\`: deny-by-default provider/tool allowlists, bounded input/output/steps, zero-dollar default budget, and scoped approval verification hook.
- \`src/lib/ai/orchestrator.mjs\`: single-step provider adapter contract, timeout/cancellation, normalized errors, and metadata-only in-memory audit events.
- \`tests/ai-orchestration.test.mjs\`: policy, registry, provider gating, timeout, cancellation, output bound, and error-redaction regression tests.

## 3. Trust boundaries

The existing InfiniteX project is a React/Vite frontend. These modules are reusable primitives, not a production backend or a secure authorization boundary when run in a browser.

Production requirements:
1. Move orchestration and all provider calls to a server-only runtime.
2. Store provider credentials in server-side secret management; never expose them to Vite/browser bundles.
3. Authenticate the user on the server and derive identity from the verified session, never from request body fields.
4. Enforce workspace ownership and role authorization for every run and tool request.
5. Replace the approval verifier hook with cryptographically verifiable, short-lived, action-scoped approvals issued by the trusted server.
6. Persist audit events server-side with retention, redaction, and access controls.
7. Add per-user/workspace rate limits, concurrency limits, quotas, and budget reservations.
8. Validate provider responses and tool inputs against runtime schemas.

## 4. Execution policy

Default policy is intentionally restrictive:

| Control | Default |
|---|---|
| Allowed providers | none |
| Allowed tools | none |
| Estimated cost ceiling | USD 0.00 |
| Max input | 8,000 characters |
| Max output | 12,000 characters |
| Max steps | 4 |
| Read-only tool | allow only when explicitly allowlisted |
| Write/external tool | requires trusted approval verifier |
| Destructive tool | blocked in this phase |
| Automatic retries | none |
| Generated-code execution | not implemented |

A provider adapter must explicitly declare \`enabled: true\`, implement \`generate()\`, and provide a finite estimated cost accepted by the configured policy. The default policy still denies every provider until an allowlist is explicitly configured.

## 5. Multi-agent design path

Do not start with an unconstrained swarm. Expand in this order:

1. **Single agent / single provider adapter** — bounded input, output, timeout, and cost.
2. **Planner + reviewer** — separate read-only planning and review responsibilities.
3. **Typed tool registry** — each tool has a schema, risk class, owner, and explicit allowlist.
4. **Approval service** — server-issued, short-lived, one-action approvals for writes.
5. **Task queue** — idempotency, concurrency caps, cancellation, and durable run state.
6. **Evaluation harness** — deterministic test fixtures, quality rubrics, regression corpus.
7. **Provider routing** — only after cost, privacy, latency, and reliability evaluation.
8. **Code-change workflow** — generate patch artifacts in an isolated workspace; tests and security review; human approval before branch/commit/PR.
9. **Release workflow** — human approval before merge, migration, or deployment.

## 6. Provider options

The adapter interface allows different backends without binding the domain layer to one vendor. Options to evaluate later:
- Local/self-hosted models: potentially no per-token provider charge, but require compatible hardware, hosting, and operational maintenance.
- Free-tier hosted models: quotas and terms can change; do not assume unlimited usage.
- Paid hosted APIs: disabled by default; require explicit budget approval.

No model is selected in this phase. Do not hardcode model IDs or provider keys. Provider/model availability and pricing must be checked when a real adapter is implemented.

## 7. Security and reliability constraints

- Never execute model-generated JavaScript, shell, SQL, or deployment commands directly.
- Tool calls must be structured, schema-validated, allowlisted, and authorized server-side.
- A model response is untrusted input, not an instruction to override policy.
- Use least privilege; read-only tools first.
- Do not expose raw provider errors, prompts, outputs, secrets, or personal data in audit logs.
- Use a hard timeout race as well as AbortSignal; a provider adapter may ignore cancellation.
- No automatic retry for provider calls or mutations in this foundation.
- Browser-side checks do not replace server-side controls.
- This in-memory audit event list is diagnostic only; it is not durable audit storage.

## 8. Verification

The Node test suite covers:
- Deny-by-default provider policy and zero-dollar cost ceiling.
- Provider allowlist, input length, step count, and estimated budget.
- Tool allowlisting, approval verification, and destructive-tool denial.
- Agent metadata validation, immutability, and duplicate rejection.
- Disabled/missing provider handling.
- Single-step orchestration, metadata-only audit events, output bounds.
- Timeout even when an adapter ignores AbortSignal.
- Caller cancellation and provider error redaction.

CI must run on the exact branch head. A passing unit suite does not establish live provider connectivity, backend authorization, production readiness, or end-to-end AI execution.

## 9. Explicit non-goals

- No autonomous self-modification of the production repository.
- No unrestricted shell, GitHub, deployment, database, or filesystem tools.
- No live AI provider credentials or network calls.
- No paid service activation.
- No database migration, authentication rollout, merge, or deployment.
