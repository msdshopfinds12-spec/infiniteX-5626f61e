# InfiniteX Security Boundaries

**Status:** Security design baseline; not a completed security audit.  
**Principle:** authorization is enforced server-side and transactionally, not by UI state or agent intent.

## 1. Trust boundaries

1. Browser/UI: untrusted input and display only.
2. Public API: authenticated but still untrusted payloads.
3. Identity/authorization service: resolves verified subject and tenant membership.
4. Orchestrator: applies workflow policy and approval requirements.
5. Worker: executes only a server-issued, currently valid claim.
6. Adapter: narrow allowlisted access to external providers.
7. Database: authoritative state and atomic transition enforcement.
8. Secrets store: server-only credentials, never exposed to client bundles.

## 2. Identity and ownership

- Never trust client-provided `owner_id`, role, tenant, approval, or run-generation fields.
- Derive the subject from a verified authentication context.
- Check tenant membership and resource ownership on every sensitive operation.
- Enforce ownership in database policies/RPCs as defense in depth.
- Verify foreign-key relationships to prevent cross-workflow and cross-tenant references.
- Do not assume a particular ownership column exists until schema provenance is recovered.

## 3. Database privilege model

- Apply least privilege to anonymous, authenticated, and service roles.
- Keep service credentials exclusively in trusted server environments.
- Restrict service-only RPC execution explicitly.
- For SECURITY DEFINER functions: pin a safe search_path, schema-qualify objects, validate all arguments, and review ownership/grants.
- Avoid broad grants and wildcard policies.
- Test both allowed and denied paths using actual database roles.
- RLS is not a substitute for validating privileged worker operations.

## 4. API and adapter controls

- Validate payloads with strict schemas and reject unknown fields where appropriate.
- Apply request size, rate, timeout, and concurrency limits.
- Use allowlisted provider identifiers and operations.
- Do not accept arbitrary shell commands, SQL fragments, filesystem paths, or user-controlled callback URLs.
- Protect against SSRF with destination allowlists and redirect/DNS/IP validation where outbound URLs are supported.
- Use stable idempotency keys for side-effecting provider calls.
- Redact credentials, authorization headers, lease tokens, and sensitive payloads from logs.
- Set bounded timeouts and cancellation propagation.

## 5. Agent safety

Agents may produce plans, classifications, summaries, and proposed tool calls. They must not:

- grant themselves permissions;
- bypass human approval;
- read secrets outside an explicit capability;
- execute arbitrary code or network destinations;
- alter ownership or authorization records;
- mark a task successful without authoritative settlement evidence.

Tool access must be allowlisted, scoped, audited, and independently authorized by the server.

## 6. Human approval gates

Require explicit approval for destructive operations, external publication, financial actions, credential rotation, database migrations, permission changes, production deployment, and irreversible provider actions.

Approval records should bind the approver, exact action/parameters, target environment, expiry, and one-time approval identifier. Any material change to parameters invalidates approval.

## 7. Logging and audit

Record correlation ID, actor/service identity, resource IDs, operation, generation, policy decision, outcome, and timestamps. Do not log raw secrets or unnecessary personal data. Protect audit storage from ordinary worker mutation.

## 8. Threat-model checklist

- Cross-tenant IDOR
- Forged owner/role claims
- Stale worker settlement
- Duplicate side effects
- Replay of approval tokens
- SSRF and unsafe redirects
- Secret leakage through logs or frontend bundles
- Privilege escalation through RPC grants
- SQL injection and unsafe dynamic SQL
- Denial of service via unbounded retries/concurrency
- Supply-chain compromise and unpinned CI actions
- Misleading UI telemetry

## 9. Verification requirements

A security claim is VERIFIED only when backed by reproducible test evidence, configuration inspection, and reviewed source. A green dashboard badge or passing unit test alone is insufficient.

## 10. Status

This document defines requirements. It does not certify the current application, database, or deployment as secure.
