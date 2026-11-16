# InfiniteX Identity Architecture Planning Report

**Branch:** feat/provider-neutral-billing-sandbox  
**Phase:** PLAN — identity, workspace authorization and database design  
**Implementation:** Not started  
**Migrations:** Not created or executed  
**Deployment / merge:** Not performed

## Deliverables added in this phase
- docs/self-hosting/decisions/ADR-002-identity-and-api-stack.md
- docs/self-hosting/IDENTITY_ARCHITECTURE.md
- docs/self-hosting/DATABASE_SCHEMA_PROPOSAL.md
- docs/self-hosting/IDENTITY_THREAT_MODEL_AND_TEST_PLAN.md

## Existing planning artifacts inspected
- docs/self-hosting/IDENTITY_AND_DATABASE_DESIGN.md
- docs/self-hosting/IDENTITY_DATABASE_IMPLEMENTATION_MANIFEST.md

The existing design recommends evaluating OIDC rather than custom password authentication and defines workspace roles owner/admin/member/viewer. The new documents have been aligned to that direction. They are complementary planning artifacts, not evidence of implementation.

## Proposed direction
- Modular monolith with private PostgreSQL.
- Fastify + TypeScript is the preferred API candidate for review; current Node built-in server remains a health-check bootstrap.
- Evaluate self-hosted OIDC first; InfiniteX remains responsible for local authorization.
- Workspace-scoped role and ownership checks.
- Minimal users, identity_links, workspaces, workspace_memberships, optional sessions and later audit_events.
- Billing remains mock-only.

## Evidence status
| Item | Status |
|---|---|
| New planning documents committed and fetched from branch | VERIFIED |
| Existing identity planning inspected | VERIFIED |
| OIDC provider selected/installed | NOT DONE |
| API framework installed | NOT DONE |
| Authentication implemented | NOT DONE |
| PostgreSQL schema created | NOT DONE |
| SQL migration created/executed | NOT DONE |
| Authorization tests executed | NOT TESTED |
| Security audit | NOT PERFORMED |
| CI result for latest commit | PENDING / NOT VERIFIED |
| Merge to main / deployment | NOT PERFORMED |

## Next approval gate
Review ADR-002, the OIDC/session architecture, workspace authorization model and schema proposal. After explicit approval, prepare a provider comparison and implementation plan. Provider installation, dependencies, database connection and migrations remain separate approval gates.
