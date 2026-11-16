# Trusted Proposal Registry Service Contract

## Security boundary

The registry stores server-owned facts. It does not approve, merge, apply, or execute proposed code. No HTTP approval endpoint is introduced by this phase.

## Registration trust requirements

1. Authentication middleware verifies the principal.
2. Tenant and actor identifiers are derived from that verified principal, never copied from request JSON or query parameters.
3. A server-side Git provider adapter resolves repository ID, canonical repository name, target branch and base commit SHA using server credentials.
4. The adapter must fail closed for inaccessible repositories, missing refs, mismatched repository identity, or a commit that is not the resolved ref.
5. The service compares all requested repository bindings with the authoritative snapshot before constructing the registry row.
6. File paths and content are validated; the manifest stores path, SHA-256 and UTF-8 byte length. Raw file content is not persisted in the registry.
7. The fingerprint binds tenant, proposal ID, repository ID and name, branch, base commit, policy version, fingerprint schema version and sorted manifest.
8. Persistence occurs in the caller-owned transaction. The service never commits. The caller must roll back on any exception.

## Transaction and RLS

set_tenant_context sets a PostgreSQL transaction-local setting. Callers must begin the transaction, derive tenant identity from authenticated server-side claims, call the service, and commit or roll back. The repository additionally filters by tenant ID. PostgreSQL RLS is defense in depth, not a substitute for authentication or explicit tenant predicates.

## Deliberate exclusions

- No approval endpoint or approval decision.
- No nonce consumption or outbox write in this service.
- No Git write, branch creation, merge, patch application or code execution.
- No client-supplied actor identity, tenant identity or authority override.
- No claim that the Git provider adapter is implemented until a concrete, authenticated adapter and integration tests exist.

## Next required gates

Implement and test the authenticated Git provider adapter; add PostgreSQL integration tests for RLS and append-only triggers; add transaction rollback and duplicate-ID concurrency tests; then perform a security review. Keep approval API disabled until those gates pass.
