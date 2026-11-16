# InfiniteX Identity Readiness Planning Report

**Branch:** feat/provider-neutral-billing-sandbox  
**Phase:** PLAN — provider evaluation, authorization contract and readiness  
**Runtime changes:** None  
**Database changes:** None  
**Deployment / merge:** Not performed

## Deliverables
- docs/self-hosting/OIDC_PROVIDER_EVALUATION.md
- docs/self-hosting/WORKSPACE_AUTHORIZATION_MATRIX.md
- docs/self-hosting/API_AUTHORIZATION_CONTRACT.md
- docs/self-hosting/IDENTITY_IMPLEMENTATION_READINESS.md

## Decisions intentionally not made
- No OIDC provider selected.
- No API framework installed.
- No PostgreSQL driver or ORM installed.
- No database schema or migration created.
- No auth routes or credentials created.
- No public ingress, deployment or merge.

## Design direction
- Self-hosted OIDC provider evaluation; no vendor lock-in in the API contract.
- InfiniteX owns workspace-level authorization.
- Default-deny role policy with owner/admin/member/viewer.
- Tenant scope enforced in data access and background jobs.
- Human approval gates for migrations, production release and privileged operations.
- Billing remains mock-only.

## Evidence ledger
| Item | Status |
|---|---|
| New planning files committed | VERIFIED if GitHub commit succeeds |
| Files fetched back from branch | PENDING verification |
| Provider comparison completed | NOT DONE |
| Provider selected | NOT DONE |
| Permission matrix approved | NOT APPROVED |
| Runtime implementation | NOT STARTED |
| Tests executed | NOT TESTED |
| Security audit | NOT PERFORMED |
| CI result | NOT VERIFIED |
| Merge/deployment | NOT PERFORMED |

## Next gate
Review the provider scorecard, workspace permission matrix and API contract. After approval, complete provider research with current official documentation and record a decision. Runtime implementation remains separately gated.
