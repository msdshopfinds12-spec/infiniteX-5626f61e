# InfiniteX Self-Hosted Implementation Plan

Workflow: PLAN -> APPROVE -> BUILD -> TEST -> AUDIT -> RELEASE.
Current state: planning documents only; runtime build has not started.

## Phase 0 — Repository baseline
Inspect branch, package manifests, lockfiles, app entry points, tests and CI. Record scripts and known blockers. Preserve the current React/Vite app until import paths and tests are understood. Label findings VERIFIED, PARTIAL, NOT TESTED or BLOCKED.
Exit: baseline inventory and evidence recorded.

## Phase 1 — Design approval
Confirm modular monolith and Node/Fastify/PostgreSQL baseline. Compare Drizzle with parameterized SQL. Define auth/session model, data classification, retention, backup and restore requirements. Approve dependencies and target tree.
Gate: human approval before source changes or dependency installation.

## Phase 2 — Build foundation
Add validated config, typed contracts, API bootstrap, request IDs, structured logs, health/readiness endpoints, database lifecycle, least-privilege roles, safe errors, timeouts and graceful shutdown. Add migration tooling only after schema review and separate migration approval. Add local-only Compose with no public database port.

## Phase 3 — Identity and authorization
Implement identity only after threat-model approval. Use reviewed password hashing, secure sessions, CSRF protections, rate limits, rotation and revocation. Add resource ownership checks and negative authorization tests. Minimize personal data.

## Phase 4 — Domain modules
Implement plan catalog; mock-only billing state machine and append-only ledger; server-derived entitlements; AI adapter with usage budgets and tool permissions; durable jobs with bounded retries; audit event pipeline.

## Phase 5 — Web integration
Add typed API client to existing React app. Keep server secrets out of browser bundles. Implement loading, empty, validation, unauthorized, rate-limit and server-error states. Replace demo data only after equivalent API behavior is implemented and tested. Preserve accessibility and mobile responsiveness.

## Phase 6 — Test
Run unit, isolated PostgreSQL integration, contract, authorization, security, resilience, synthetic billing and backup-restore tests. Record actual commands, exit codes and outputs. No test may contact a live payment provider or production database.

## Phase 7 — Audit
Review dependencies/licenses, secrets, authorization, data isolation, container non-root execution, capabilities, resource limits, health checks, network exposure, TLS, log redaction, encrypted backups and restore evidence. Confirm real payment paths are disabled.

## Phase 8 — Release approval
Release remains blocked until tests and audit have evidence, host and recovery plan are approved, and the human explicitly approves the exact release. Deployment, DNS/firewall changes, production migrations and live payment integration each require separate approval.

## Current status
PLAN: PASS (documents created).
APPROVE: PARTIAL (hybrid target selected; detailed implementation choices remain).
BUILD: NOT STARTED.
TEST: NOT RUN.
AUDIT: DOCUMENT REVIEW ONLY.
RELEASE: BLOCKED.
