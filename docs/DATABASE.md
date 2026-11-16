# PostgreSQL data model — migration not applied

## Current implementation
- Optional PostgreSQL connection pool using DATABASE_URL.
- Bounded pool size, connection timeout, statement timeout and query timeout.
- When persistence is enabled, the API checks for an issuer/subject tenant mapping before sending an AI request.
- After provider success, usage is written in a transaction with tenant context set transaction-locally.
- Missing tenant mapping is rejected before calling the AI provider.

## Migration
`database/migrations/0001_core.sql` defines tenants, OIDC subject mappings, agents, tasks, AI usage, and audit events. Tenant-owned tables use forced row-level security policies.

## Critical deployment requirements
1. Create a dedicated PostgreSQL runtime role that is NOT table owner and does NOT have BYPASSRLS.
2. Grant only required table and sequence privileges to the runtime role.
3. Apply migrations manually only after review and explicit approval.
4. Provision a tenant and app_users mapping for each verified issuer + subject pair through a trusted administrative workflow.
5. Test RLS using the actual runtime role, including missing tenant context and cross-tenant access attempts.
6. Configure TLS and a managed backup/restore procedure.
7. Set DATABASE_URL as a Railway secret only after separate approval.

The initial model assumes one tenant per OIDC issuer/subject. Multi-tenant membership switching needs a reviewed membership table and explicit active-tenant authorization; do not infer tenant membership from client input.

The app_users identity mapping table is intentionally not covered by tenant RLS in this initial migration. The runtime role must receive only the narrow SELECT permission needed by the repository. Never expose this table through a generic API.

## Limitations
- Migration has not been executed.
- No user/tenant provisioning endpoint exists.
- No retention or deletion worker exists.
- Usage persistence records token counts, not provider invoice cost.
- A provider may complete a request before a database write fails; reconcile usage against provider records.
- No durable quotas or spend caps exist.