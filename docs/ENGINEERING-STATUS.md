# Engineering status

Based on committed source and workflow evidence. Infrastructure state is separate.

| Area | Status |
|---|---|
| Isolated API source | Implemented in apps/api |
| Health and readiness endpoints | Implemented; readiness probes PostgreSQL when configured |
| OIDC/JWKS JWT verification | Implemented; provider configuration required |
| Request body and route input validation | Implemented; 128 KiB request-body limit |
| AI provider adapter | Implemented; provider configuration required |
| Process-local rate limiter | Implemented with bounded in-memory bucket capacity; not distributed |
| PostgreSQL pool | Implemented; optional and not connected until configured |
| Tenant context and repositories | Implemented; require provisioned user mapping and active schema |
| Tenant-scoped usage persistence | Implemented; requires provisioned user mapping |
| Agent registry API and repository | Implemented; requires database and tenant provisioning |
| Task CRUD/cancellation API and repository | Implemented; tasks remain queued because no worker exists |
| PostgreSQL schema and RLS migration | Added; NOT applied or database-verified |
| Durable quotas and monetary cost ledger | Not implemented |
| Distributed queue or task worker | Not implemented |
| CI workflow | Added; latest branch CI must be checked for each commit |
| Railway deployment/provisioning | Not performed |
| Production security review | Pending |

A passing CI run proves only the checks in that workflow. It does not prove live Railway, PostgreSQL RLS, identity-provider, or AI-provider integration.
