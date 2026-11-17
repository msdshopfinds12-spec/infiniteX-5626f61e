# Phase 3B — Multi-Repository Agent Adapter Foundation

**Status:** Foundation implementation; external agents remain disconnected.  
**Branch:** `feat/infiniteX-phase-3b-agent-adapters`  
**Base:** Phase 3A commit `68c76336e5618a93d4848504f6c2e839600ed9f7`

## Scope delivered

- Shared typed adapter contracts.
- Registry of seven repository candidates with explicit `not-connected` state.
- One deterministic mock adapter for offline contract testing.
- Capability-checked router with strict operation ID and input-size validation.
- Tests for mock execution, disconnected candidates, malformed identifiers, and input limits.
- No provider SDK, API key, external network call, repository write, SQL execution, or deployment integration.

## Security invariants

1. The browser must never hold provider or GitHub credentials.
2. A repository name in the registry is inventory metadata, not proof of a live connection.
3. External adapters fail closed until a separately reviewed runtime is implemented and verified.
4. The mock adapter never calls a model or external service.
5. This router is an internal foundation, not a complete authenticated public API.
6. A future privileged operation requires server-side identity, explicit action scope, approval expiry, audit evidence, and a separate authorization check.
7. Model-generated text is untrusted input. Never execute generated shell, SQL, code, or Git commands without isolated validation and human approval.

## Adapter activation checklist

- [ ] Verify repository implementation, runtime and dependency compatibility.
- [ ] Define a versioned HTTP or queue contract.
- [ ] Establish a server-to-server identity boundary.
- [ ] Add per-agent capability and resource allowlists.
- [ ] Add request timeout, retry budget, circuit breaker and concurrency cap.
- [ ] Add structured audit events and safe redaction.
- [ ] Add contract, integration, failure-mode and security tests.
- [ ] Review free-tier limits and data handling before provider activation.
- [ ] Obtain separate approval before enabling external credentials or write scopes.

## Not included

- Live AI model calls.
- Live IQ Core or EVE runtime connections.
- Durable audit storage.
- Distributed rate limiting.
- Production authentication and authorization.
- Repository writes, pull requests, merges, database migrations, secrets, billing, or deployment.

## CI validation

The repository CI must type-check both gateway and adapter server code, run all Vitest tests, run the high/critical dependency audit, and build the production front-end. A green run is evidence only for the exact commit tested.
