# InfiniteX Self-Hosted Test Strategy

Status: planned; no runtime tests executed in this documentation phase.

## Test layers
1. Static: typecheck, lint, formatting and dependency audit.
2. Unit: domain rules, validators, policies, state transitions and quota calculations.
3. Integration: API with isolated disposable PostgreSQL; transaction and repository behavior.
4. Contract: OpenAPI request/response conformance and error envelopes.
5. Security: unauthenticated access, cross-user access, CSRF, injection, rate limits, secret exposure and unsafe file access.
6. Resilience: database outage, worker restart, bounded retries, duplicate delivery and graceful shutdown.
7. Operations: encrypted backup, restore verification, disk-full behavior and log redaction.
8. Mock billing: synthetic state transitions, idempotency, replay rejection, invalid amount/currency and entitlement gating. No real payment calls.

## Quality gates
Tests are deterministic and use synthetic fixtures. No test contacts a live payment provider or production database. Every authorization rule has positive and negative tests. Every financial state transition has duplicate and invalid-transition tests. Retain CI output and command exit codes. Failed tests remain blockers until fixed or explicitly accepted.

## Baseline
Inspect package.json before running commands. Exact commands depend on the final package layout and scripts. Do not claim build, lint or test success without actual command output.
