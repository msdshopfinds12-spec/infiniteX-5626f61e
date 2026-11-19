# Repository AI Integration Map

## Decision

InfiniteX is the host application. Other repositories are independent candidate modules, not dependencies to bulk-merge. Integrations must use narrow adapters and explicit capability contracts.

## Current verified scope

| Candidate repository | Reviewed architecture | Integration decision | Status |
|---|---|---|---|
| `eve-software-factory-template` | Four-stage classifier/analyst/implementer/reviewer workflow; approval and branch/sandbox concepts | Reuse workflow concepts only after license/runtime review; avoid importing its Vercel-hosted sandbox/storage requirements into the ₱0 core | REVIEW REQUIRED |
| `ai-master-controller` | Next.js foundation/scaffold | No code import; assess only as a future UI/coordination reference | NOT INTEGRATED |
| `bagsikai-agent` | Next.js/React, Better Auth, Eve and AI SDK dependencies | Optional agent adapter candidate; no provider execution or zero-cost runtime proven | NOT INTEGRATED |
| `personal-agent` | Nuxt/Vue, Better Auth, database and sandbox-oriented dependencies | Separate runtime; do not combine framework or auth stack with InfiniteX frontend | NOT INTEGRATED |
| `jev-and-ai-sdk` | Confidence-based routing/fallback concepts and model provenance | Potential provider-neutral routing design reference; remote AI Gateway/provider costs must remain optional | NOT INTEGRATED |
| `msdshopfinds12-spec-infiniteGX.7-IQ-Core` | Python standard-library plugin manager, typed event bus and permission-oriented plugin concepts | Strong candidate for a later isolated local worker/adapter; validate tests, license and API contract before copying | REVIEW REQUIRED |
| `eve-content-agent-template` | Content-agent template | No import until dependencies, execution path, tests and license are independently verified | NOT INTEGRATED |
| `eve-chat-template` | Chat UI/persistence-oriented template | Reuse only specific UI patterns after review; avoid adopting another auth/database/cache stack | NOT INTEGRATED |

## License and provenance gate

These candidate repositories are private. A verified license grant and file-level provenance have not been established in this integration pass. Private repository access is not, by itself, evidence that code can be copied, redistributed, or combined. Before importing code from another repository:

1. Inspect its LICENSE and notices, if present.
2. Confirm the owner has authorized cross-repository reuse.
3. Record the source repository, branch, source commit and source paths.
4. Check runtime, framework, dependency and Node/Python version compatibility.
5. Run the source repository's tests and security checks.
6. Port only a small adapter or module with a documented interface.

No external candidate code has been copied into this branch in this phase. The provider-neutral orchestration code was sourced from another development branch in the same InfiniteX repository.

## Adapter contract (future implementation)

A repository adapter should expose only metadata and explicit operations:

- Stable adapter ID and semantic version.
- Runtime and compatibility declaration.
- Capability allowlist.
- Input/output JSON schema.
- Declared data classification and network requirements.
- Estimated cost and resource bounds.
- Abort/timeout support.
- Permission scope and approval requirements.
- Health/readiness result.
- Test fixture and provenance record.

An adapter must be disabled until a human enables it. The host must deny unknown capabilities, undeclared network access, writes, shell execution, destructive actions and paid provider calls.

## ₱0 integration strategy

- Keep the InfiniteX frontend and deterministic local utilities usable with no provider.
- Prefer the IQ Core standard-library concepts for a future local Python worker if license and tests permit.
- Keep Eve workflow patterns as design references; avoid dependencies on paid hosted sandbox, blob storage or inference.
- Treat model APIs and cloud AI gateways as optional and disabled by default.
- Do not claim a third-party provider is free based on a free trial, a free tier, or an estimated cost field.
- Never place provider keys in browser code or repository files.

## Current result

Only the InfiniteX application shell, PWA foundation, browser/server boundary scanner and provider-neutral server orchestration primitive are in scope. No external AI repository is integrated, no live model is connected, and no background agent is running.
