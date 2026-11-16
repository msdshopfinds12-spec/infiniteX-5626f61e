# InfiniteX Identity Architecture Planning Report

**Branch:** feat/provider-neutral-billing-sandbox  
**Phase:** PLAN — identity, sessions and minimal database design  
**Implementation:** Not started  
**Migrations:** Not created or executed  
**Deployment / merge:** Not performed

## Deliverables
- docs/self-hosting/decisions/ADR-002-identity-and-api-stack.md
- docs/self-hosting/IDENTITY_ARCHITECTURE.md
- docs/self-hosting/DATABASE_SCHEMA_PROPOSAL.md
- docs/self-hosting/IDENTITY_THREAT_MODEL_AND_TEST_PLAN.md

## Proposed direction
- Modular monolith with PostgreSQL.
- Fastify + TypeScript is the preferred API candidate for review; the current Node built-in server remains a minimal health-check bootstrap only.
- Opaque server-side sessions with hashed tokens and Secure, HttpOnly, SameSite cookies.
- Server-derived authorization with default-deny resource ownership checks.
- Minimal account/session/role schema; audit events are a later phase.
- Billing remains mock-only.

## Important reconciliation
The earlier architecture document described Fastify + TypeScript as the target. The first runtime foundation intentionally used Node built-ins to avoid adding dependencies before review. ADR-002 makes this distinction explicit: no framework or auth dependency has been installed, and the API stack choice remains proposed.

## Evidence status
| Item | Status |
|---|---|
| Planning documents committed to feature branch | VERIFIED if GitHub commit succeeds |
| API framework installed | NOT DONE |
| Authentication implemented | NOT DONE |
| PostgreSQL schema created | NOT DONE |
| SQL migration created/executed | NOT DONE |
| Password hashing integrated | NOT DONE |
| Session cookies/CSRF enforced | NOT DONE |
| Authorization tests executed | NOT TESTED |
| Security audit | NOT PERFORMED |
| CI result for this commit | PENDING / NOT VERIFIED |
| Merge to main / deployment | NOT PERFORMED |

## Next approval gate
Review ADR-002, identity architecture and schema proposal. After explicit approval, the next implementation plan can add the selected API framework and validation layer on the feature branch, followed by unit/integration tests using synthetic data. Database migrations remain a separate approval gate.
