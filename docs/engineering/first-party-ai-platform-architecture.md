# First-party AI platform architecture

**Status:** implementation foundation, not production release  
**Budget invariant:** USD 0.00; no paid fallback, no automatic upgrade, no credit purchase  
**Default inference:** deterministic mock only; external model adapters disabled  
**Ownership:** original InfiniteX implementation; no third-party model/provider code vendored

## Engineering objective

Build an original, provider-neutral application platform from small, auditable components. Use mature open-source libraries for commodity infrastructure (HTTP, SQL, JWT verification, migrations, testing) while keeping product logic, policy, orchestration, deterministic routing, and domain workflows first-party.

"Free" means no paid inference or service activation by default. It does not mean unlimited compute, unlimited API calls, or zero infrastructure cost under every hosting plan.

## Current first-party implementation

| Component | Source | Purpose | Runtime status |
|---|---|---|---|
| Provider policy | `iq_core/agents/provider_policy.py` | Exact provider/model approval, expiry, account eligibility, data-use approval, known quota, zero-cost gate, no paid fallback | Implemented as policy primitive |
| Provider contracts | `iq_core/providers/contracts.py` | Vendor-neutral request/result data contracts and bounded inputs | Implemented |
| Provider runtime | `iq_core/providers/runtime.py` | Central policy gate and explicit adapter registry | Implemented; mock runtime only |
| Mock adapter | `iq_core/providers/runtime.py` | Deterministic no-network test adapter | Enabled by default |
| Local rules engine | `iq_core/providers/local_rules.py` | Transparent deterministic keyword routing | Implemented; not generative AI |
| Provider tests | `tests/unit/test_provider_policy.py`, `tests/unit/test_provider_runtime.py` | Policy, routing, quota, paid-fallback and input-boundary tests | Added; execution status is determined by CI |
| Agent contract | `iq_core/agents/base_agent.py` | Typed request/response and honest capability status | Implemented |
| Unconfigured agent | `iq_core/agents/provider_agents.py` | Explicitly returns NEEDS_REVIEW when no model provider exists | Implemented |

No external provider is activated by this architecture. A policy approval record is not a credential, and registering an adapter is not proof that a service is free.

## Target architecture

```text
Frontend (TypeScript + React)
  |
  | HTTPS / JSON; never receives provider secrets
  v
FastAPI application (Python)
  |
  +-- Authentication boundary
  |     +-- JWT signature / issuer / audience / expiry
  |     +-- server-derived owner and tenant context
  |
  +-- Application services
  |     +-- task and memory use cases
  |     +-- idempotency and authorization
  |
  +-- IQ Core (first-party domain logic)
  |     +-- agent registry and bounded orchestration
  |     +-- local deterministic rules
  |     +-- provider-neutral contracts
  |     +-- $0 ProviderPolicy (default deny)
  |     +-- ProviderRuntime
  |           +-- mock adapter (default)
  |           +-- future reviewed free adapter (disabled)
  |
  +-- Persistence boundary
        +-- SQLAlchemy repositories
        +-- PostgreSQL transactions and RLS
        +-- durable jobs / leases / outbox (future implementation)
```

## Language responsibilities

- **Python 3.11+:** backend, domain services, policy enforcement, provider contracts, orchestration, worker runtime and tests.
- **TypeScript:** frontend state, API client contracts and UI. No provider API keys or direct paid-provider calls in browser code.
- **SQL:** reviewed schema, indexes, RLS policies, role grants, queue leases and atomic quota accounting. Migrations are not executed without separate approval.
- **YAML:** CI workflows and static-analysis configuration. Pin actions to reviewed immutable revisions before production.
- **Shell:** local developer commands and CI scripts. Scripts must be non-destructive by default and must not print secrets.
- **JSON:** machine-readable API payloads and configuration contracts; reject unknown or unsafe fields at trust boundaries.

Do not add extra languages merely to look advanced. Add a language only when it solves a concrete maintenance or runtime problem.

## $0 policy invariants

1. The default provider registry contains only `mock`.
2. Unknown provider/model pairs are denied.
3. Exact model IDs are required; fuzzy model matching is forbidden.
4. Approval evidence must be timezone-aware and unexpired.
5. Account eligibility and provider data-use approval must be explicit.
6. Quota must be known and positive before an external call.
7. Estimated cost must be exactly USD 0.00.
8. Paid fallback, auto-top-up and automatic plan upgrades are forbidden.
9. A provider timeout, quota response, or billing ambiguity must fail closed.
10. Do not persist prompts by default; never log secrets or full private payloads.
11. No browser-side provider credentials.
12. A CI pass is not proof of free-tier entitlement or production readiness.

## Original implementation rules

- Keep provider adapters behind the first-party `InferenceProvider` contract.
- Do not copy vendor SDK internals, model weights, proprietary prompts, or provider source code.
- Use official SDKs only where necessary and retain their license notices.
- Keep deterministic business logic in our own code; an LLM is optional, not a dependency for core correctness.
- Prefer SQL transactions and explicit invariants over hidden agent autonomy.
- Every agent declares its actual capabilities and returns `NOT_CONFIGURED` or `NEEDS_REVIEW` when blocked.
- Use synthetic data for tests.
- Do not claim "AGI", "unlimited tokens", autonomous completion, or model intelligence for deterministic rules or mocks.

## Next implementation gates

### Gate A — provider runtime integration
- Route every future model request through `ProviderRuntime`.
- Prohibit direct SDK calls from agents, API routes and frontend.
- Add architecture tests that search for forbidden direct provider imports outside adapter modules.
- Keep the external adapter registry empty until a separate provider approval.

### Gate B — tenant and data security
- Use verified identity to derive tenant IDs server-side.
- Set transaction-local PostgreSQL context inside each transaction.
- Keep explicit tenant predicates in repositories.
- Apply RLS to all tenant-owned tables.
- Use separate schema-owner/migrator and runtime roles; runtime must not own tables or have BYPASSRLS.
- Test with real PostgreSQL and separate roles; SQLite tests are not RLS evidence.

### Gate C — durable execution
- PostgreSQL queue with atomic `FOR UPDATE SKIP LOCKED` claims.
- Lease owner, lease expiry, heartbeat and fencing token.
- Recovery of expired jobs, bounded retries, dead-letter handling and idempotent side effects.
- Transactional outbox for event delivery.
- Do not promise exactly-once execution; design at-least-once delivery with idempotent consumers.

### Gate D — operations and audit
- Structured redacted logs, correlation IDs, metrics and health checks.
- No prompt or credential logging by default.
- Rate limits, bounded payloads and per-tenant resource quotas.
- Reproducible dependency locks, vulnerability review and license inventory.
- Recovery runbooks and backup/restore verification.

### Gate E — release
- CI green on the exact release commit.
- PostgreSQL integration/security tests pass.
- Threat model and dependency/license audit complete.
- Human approval before migration, merge, deployment, billing or public release.

## Free-first alternatives

| Need | First-party default | Optional alternative | Constraint |
|---|---|---|---|
| Text classification | LocalRulesEngine | Reviewed local open-weight model | Local model requires suitable hardware, storage and model-license review |
| Inference tests | MockAdapter | Synthetic fixtures | Mock is not generative AI |
| Workflow orchestration | First-party bounded Python services | Activepieces / other OSS workflow engine | Separate deployment, security and service limits |
| Model hosting | Disabled | Exact reviewed free-tier provider model | Quotas, account eligibility, data policy and pricing can change |
| Database | Existing PostgreSQL integration | SQLite for unit tests only | SQLite does not validate PostgreSQL RLS or locking |
| Repository operations | Existing GitHub integration | Official Git tooling in read-only mode | Avoid duplicate GitHub MCP without a missing capability |

## Definition of done

A feature is complete only when:
- its source and configuration are committed to the authorized branch;
- tests are added and pass on the exact commit;
- security and tenant boundaries are tested at the correct integration layer;
- no paid dependency or hidden external call is introduced;
- documentation states limitations and operational requirements;
- release remains blocked until human approval.

## Explicit non-goals

This foundation does not provide an LLM, unlimited tokens, self-training, autonomous code deployment, production-grade durable workers, or a verified free external model. Those are separate engineering projects with evidence and approval gates.
