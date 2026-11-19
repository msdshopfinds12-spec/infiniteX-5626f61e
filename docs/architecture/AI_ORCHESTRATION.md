# InfiniteX AI Orchestration Architecture

## Status

Provider-neutral orchestration foundation only. This is not a deployed agent service and does not connect a model provider by default.

## Trust boundaries

- All orchestration modules live under `server/ai/` and are server-only.
- Browser bundles must never import these modules.
- No provider credentials are stored in this repository or sent to the browser.
- Provider adapters are injected by trusted server code; the default adapter map is empty.
- The default execution policy allows no providers and sets the estimated-cost ceiling to USD 0.
- This library does not execute arbitrary shell commands, generated code, migrations, deployments, or destructive tools.

## Components

1. **Agent registry** validates IDs, names, statuses, provider identifiers and capabilities. New agents must be explicitly registered. Status is either `disabled` or `ready`.
2. **Execution policy** uses provider/tool allowlists, input/output limits, step limits, a cost ceiling, and a scoped approval verifier. Destructive tools are always denied by this primitive.
3. **Orchestrator** performs one bounded provider call, enforces timeouts and cancellation, normalizes provider failures, and records metadata-only audit events.

## Execution lifecycle

`request -> registry lookup -> enabled provider lookup -> policy evaluation -> bounded provider call -> output validation -> metadata audit event`

Every denied or unavailable path must fail closed. Provider error messages are not returned to callers because they may contain sensitive implementation details.

## Zero-budget policy

- No provider is configured by default.
- No paid API or cloud inference is required for the app shell or deterministic local utilities.
- A provider adapter may only be enabled after its actual pricing, rate limits, privacy terms, and credentials are separately reviewed.
- An estimated cost of zero is a policy assertion supplied by the trusted adapter, not proof that a remote service is free. Remote providers are therefore excluded from the default configuration.

## Limitations and required next steps

- The approval verifier is an injected policy callback, not a complete identity or authorization system.
- Audit events are in-memory and bounded; they are not durable logs.
- There is no HTTP API, authentication, database persistence, multi-tenant storage, or background worker in this phase.
- Production use requires a trusted server runtime, authenticated actor context, durable audit storage, rate limiting, tenant isolation, and independent security review.
- Tests cover the deterministic orchestration primitive only; they do not establish a live AI integration.
