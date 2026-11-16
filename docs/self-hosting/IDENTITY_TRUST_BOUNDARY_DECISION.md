# InfiniteX Identity Trust Boundary — Engineering Decision Record

**Status:** DESIGN GATE — no runtime identity implementation is approved by this record.
**Target branch:** `feat/provider-neutral-billing-sandbox`
**Scope:** additive documentation only; no schema changes, migrations, credentials, provider provisioning, merge, or deployment.

## 1. Executive finding

The current workspace RLS design reads `app.current_user_id` and `app.current_workspace_id` from PostgreSQL custom settings. The API sets them with parameterized, transaction-local `set_config(..., true)` calls.

Transaction-local settings reduce accidental context leakage across pooled transactions. They do **not** authenticate the values: a database session with the runtime role can set the same custom settings itself. Consequently, the current policy is defense-in-depth against omitted tenant predicates, not a cryptographic boundary against arbitrary SQL executed with the runtime credential.

Do not describe the current GUC values as verified identity.

## 2. Existing baseline inspected

- API runtime: Node.js ES modules, Node >=22.
- PostgreSQL driver: `pg@8.16.3`.
- Existing role policy: owner/admin/member/viewer.
- Existing repository: transaction-local GUC setup, workspace row lock, membership mutation, audit insert.
- Existing RLS migration: forced RLS on app_users, workspaces, workspace_memberships and audit_events.
- Existing CI: PostgreSQL 17 disposable service, npm lockfile install, syntax checks, Node tests and SQL fixture checks.
- Existing CI report records 40 passing tests for commit `44de305e1253429f6c7df191afd9ef2511c59bf3`. This is historical evidence, not a fresh run for this decision record.

## 3. Security objective and threat boundary

Required objective: a caller must not gain another user's or workspace's RLS context merely by choosing arbitrary custom GUC values.

This design is intended to reduce the impact of SQL injection or accidental arbitrary SQL under the restricted application database role. It does not claim to protect against full compromise of the API process, theft of its signing key, database-owner compromise, or a malicious superuser. Those threats require separate controls.

## 4. Candidate designs

### Option A — database-verified, transaction-bound signed context

1. The API authenticates the end user through a separately approved authentication mechanism.
2. After beginning a database transaction, the API obtains the transaction identifier from PostgreSQL.
3. The API constructs a strictly validated, canonical claim set containing issuer, subject/user ID, workspace ID, audience, database role, transaction identifier, issued-at, expiry, key ID and a unique request identifier.
4. The API signs the canonical claims using a dedicated HMAC key held only by the API runtime and the database verification boundary.
5. The API passes the signed assertion as data; it never interpolates claims into SQL.
6. A narrowly scoped PostgreSQL verification function validates the MAC, key ID, expiry, audience, expected role and transaction binding. It uses a fixed safe search path and a non-login owner. The runtime role cannot read the verification key table or alter the verifier.
7. RLS policies fail closed unless the database verifier accepts the assertion for the current transaction and requested tenant scope.
8. Key rotation supports an active key and a bounded verification-only previous key. Revocation and emergency rotation procedures are documented and tested.

The verifier must be designed so callers cannot bypass verification by writing a second custom GUC. RLS must verify the signed assertion itself, or rely on a database-owned verified state that the runtime role cannot forge or modify.

Transaction binding makes an assertion copied into another transaction invalid. A short expiry limits exposure. Replaying an assertion inside its original transaction must not grant any claims beyond the signed user/workspace/role scope.

### Option B — separate database identities or trusted connection proxy

Use database-authenticated identities or a trusted proxy that binds identity to a database session using credentials the application query role cannot forge. Evaluate operational complexity, pool compatibility, connection limits and tenant scale before selection.

### Option C — retain current GUC-only RLS

Accept only as defense-in-depth for accidental query omissions. This option does not satisfy the signed-identity trust objective and must not be represented as a complete mitigation for arbitrary SQL execution.

## 5. Required design decisions before implementation

- Select the authentication issuer and define how the API obtains a validated principal. OIDC provider selection remains open.
- Choose Option A or Option B after a threat-model and operational review.
- Confirm PostgreSQL version, `pgcrypto` availability (if Option A uses it), extension ownership and managed-database compatibility.
- Define canonical serialization and HMAC algorithm; reject unknown algorithms and malformed claims.
- Define key storage, runtime secret delivery, rotation, revocation and recovery.
- Define transaction-pooling compatibility and transaction identifier handling.
- Define verifier ownership, EXECUTE grants, search_path, PUBLIC privileges and table privileges.
- Decide whether request IDs/nonces need persistent one-time consumption. Do not claim replay prevention unless atomic database enforcement and concurrency tests prove it.
- Review policy performance and avoid unsafe SECURITY DEFINER behavior.

## 6. Mandatory adversarial verification

Use disposable PostgreSQL only and synthetic fixtures.

- Missing assertion: deny.
- Malformed or truncated assertion: deny.
- Modified user/workspace/role claim: deny.
- Invalid MAC: deny.
- Expired assertion: deny.
- Future-issued assertion outside allowed clock skew: deny.
- Wrong audience or database role: deny.
- Assertion from a different transaction: deny.
- Unknown or revoked key ID: deny.
- Runtime role cannot read signing/verification key material.
- Runtime role cannot replace, alter or bypass the verifier.
- Cross-workspace SELECT, UPDATE and INSERT remain denied.
- Connection-pool reuse does not carry a prior transaction's identity.
- Concurrent replay/nonce behavior matches the explicitly approved replay policy.
- Audit records contain no assertion, MAC, secret or bearer token.

Every negative test must assert both the denial result and the absence of unauthorized data mutation.

## 7. Implementation sequence

1. Approve threat model and select the trust-boundary option.
2. Add pure Node.js claim validation and signing/verifier-adapter tests.
3. Add database verifier and least-privilege grants only after extension and ownership compatibility are confirmed.
4. Update repository transaction lifecycle to set verified context before tenant queries.
5. Update every RLS policy to use the verified context.
6. Add disposable PostgreSQL adversarial integration tests.
7. Run the complete CI workflow and inspect the exact run, commit and logs.
8. Perform independent security review and publish an evidence-based report.

## 8. Explicitly prohibited in this phase

- Applying migrations to any persistent or production database.
- Creating or rotating real secrets.
- Enabling production authentication or collecting user credentials.
- Installing or exposing an identity provider.
- Changing live payment or billing behavior.
- Merging, deploying, deleting or force-updating branches.

## 9. Acceptance gates

| Gate | Required evidence | Current status |
|---|---|---|
| Existing GUC weakness documented | Source inspection | VERIFIED |
| Trust-boundary option selected | Reviewed decision | BLOCKED |
| Authenticated principal source | Approved issuer and validation contract | BLOCKED |
| Database verifier design | PostgreSQL/extension/privilege review | BLOCKED |
| Runtime implementation | Code review and unit tests | NOT STARTED |
| Adversarial PostgreSQL tests | Actual disposable CI run | NOT STARTED |
| Independent security audit | Findings and remediation evidence | NOT STARTED |
| Release | Separate human approval | BLOCKED |

## 10. Evidence and limitations

This record is an engineering design artifact. It does not implement signed identity, change RLS, execute tests, apply migrations, or certify production security.

The previously recorded 40-test CI pass is historical and must not be reused as evidence that this proposed trust boundary works.

**Next approval required:** select Option A (database-verified signed context) or Option B (trusted database identity/proxy). Do not implement a partial HMAC layer and label it secure.
