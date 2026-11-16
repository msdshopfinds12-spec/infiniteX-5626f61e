# Identity + Database Implementation Manifest

Status: BLOCKED pending design approval.
Branch: feat/provider-neutral-billing-sandbox.

## Approved foundation
- Isolated dependency-free Node.js API.
- Node built-in test runner.
- Development-only loopback PostgreSQL Compose profile.
- Mock-only billing.
- Feature branch only.

## Proposed implementation sequence

### Phase A — identity decision
- Compare self-hosted OIDC options against operational constraints.
- Define redirect URIs, issuer/audience validation, PKCE, state and nonce.
- Define browser cookie and Android native-client session policy.
- Define secret rotation, backup and update ownership.

### Phase B — authorization
- Define owner/admin/member/viewer permissions.
- Define workspace isolation invariants.
- Define resource ownership checks and privileged-action approvals.
- Add negative authorization tests before protected routes.

### Phase C — database schema
- Produce reviewed ERD and SQL proposal.
- Define users, identity links, workspaces, memberships, sessions and audit events.
- Add foreign keys, unique constraints and indexes.
- Define least-privilege roles, retention and backup/restore.

### Phase D — implementation (separate approval required)
- Add selected PostgreSQL client dependency.
- Add validated configuration and connection lifecycle.
- Add repository interfaces and parameterized SQL.
- Add authentication middleware and authorization policy.
- Add synthetic-data integration tests.
- Create migrations only after explicit schema approval.

### Phase E — verification
- Syntax and unit tests.
- Integration tests against disposable local PostgreSQL.
- Cross-tenant access tests.
- Session lifecycle tests.
- Secret/log redaction review.
- Dependency and container image review.
- Backup/restore rehearsal.

## Prohibited without separate approval
- Running migrations or destructive SQL.
- Importing real user/customer data.
- Creating live accounts or collecting credentials.
- Publicly exposing API or identity provider.
- Paid provisioning.
- Merging to main or deploying.
- Enabling live payment processing.

## Evidence ledger

| Item | State |
|---|---|
| Design proposal written | VERIFIED |
| Identity provider selected | NOT DECIDED |
| PostgreSQL schema approved | NOT APPROVED |
| Database driver installed | NOT INSTALLED |
| Authentication implemented | NOT IMPLEMENTED |
| Migrations created/executed | NO |
| Integration tests | NOT RUN |
| Production audit | NOT PERFORMED |
