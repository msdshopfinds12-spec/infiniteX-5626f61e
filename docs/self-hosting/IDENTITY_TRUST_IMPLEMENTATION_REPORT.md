# InfiniteX — Database-Verified Identity Implementation Report

**Status:** FEATURE-BRANCH IMPLEMENTATION — disposable PostgreSQL CI passed; authentication-provider gate remains open.
**Branch:** `feat/provider-neutral-billing-sandbox`
**Scope:** API assertion primitive, PostgreSQL verifier, RLS policy replacement, transaction integration, disposable CI tests.
**Not included:** end-user authentication provider, production secrets, persistent-database migration, merge, deployment.

## 1. Implementation summary

Option A has been implemented as a database-verifiable, transaction-bound HMAC assertion.

The API signs a canonical JSON claim payload encoded as lowercase hexadecimal. The token format is:

`<payload-hex>.<hmac-sha256-hex>`

The PostgreSQL verifier recomputes HMAC over the exact payload-hex bytes using `pgcrypto`, validates claims, checks the connected `session_user`, checks `txid_current()`, enforces a maximum 20-second lifetime and five-second future clock skew, and confirms that the subject still has an active account and active membership in the asserted workspace.

RLS reads only the verified identity returned by `app_private.current_identity()`. The legacy caller-writable `app.current_user_id` and `app.current_workspace_id` values are no longer trusted by the replacement policies.

## 2. Changed files

- `apps/api/src/identity/assertion-signer.mjs` — Node.js HMAC-SHA256 assertion signer and strict claim validation.
- `apps/api/src/workspaces/membership-repository.mjs` — obtains transaction ID, signs the authenticated principal/workspace context, sets the assertion transaction-locally, then performs existing membership operations.
- `apps/api/test/identity-assertion-signer.test.mjs` — claim shape, HMAC verification, tampering and input validation tests.
- `apps/api/test/membership-repository.test.mjs` — signer dependency, transaction ordering and rollback tests.
- `apps/api/test/membership-repository.integration.test.mjs` — disposable PostgreSQL adversarial tests.
- `apps/api/package.json` — syntax checks include identity modules and tests.
- `infra/db/migrations/0003_verified_identity_assertions.sql` — private key table, verifier function, grants and replacement RLS policies.
- `infra/db/ci/0003_seed_identity_test_key.sql` — synthetic CI-only HMAC key.
- `.github/workflows/self-hosted-api.yml` — applies migrations only to disposable PostgreSQL and runs adversarial tests.

## 3. Database trust boundary

### Signing key and verifier

- The runtime role has no SELECT/INSERT/UPDATE/DELETE privileges on the verifier key table.
- The verifier function is owned by `infinite_x_identity_verifier_owner`, a NOLOGIN, non-superuser role.
- The verifier owner has BYPASSRLS solely so its fixed SECURITY DEFINER function can check the signed subject's active membership without recursively invoking membership RLS.
- The verifier owner is granted SELECT only on `app_users` and `workspace_memberships` for that check.
- The runtime role can EXECUTE the verifier but cannot replace it or assume its owner role.
- The SECURITY DEFINER function uses a fixed `search_path` and schema-qualified extension/table references.
- HMAC comparison checks all 32 bytes before deciding equality.
- The verifier returns NULL on malformed claims or verifier errors; RLS therefore fails closed.

### Assertion claims

- Version, issuer and audience.
- Subject user UUID and workspace UUID.
- Expected PostgreSQL login role.
- PostgreSQL transaction ID.
- Issued-at and expiry timestamps.
- Unique assertion ID and key ID.

### Replay semantics

An assertion copied into a different transaction is rejected because its signed transaction ID no longer matches. Reuse within the same transaction is allowed and remains restricted to the same signed user/workspace/role claims. This implementation does not claim globally one-time nonce consumption.

### Key rotation

The key table separates `can_sign` and `can_verify`, and supports validity windows and revocation. The API signer receives one key ID and secret through runtime configuration. Operational rotation automation and production secret provisioning are not included.

## 4. Critical authentication limitation

**The repository does not yet contain a production OIDC/JWT authentication middleware.**

The membership repository now accepts an `authenticatedPrincipal` object and its documentation explicitly requires that object to come from a separately validated authentication boundary. The assertion signer is not an authentication provider and does not prove that a caller-supplied user ID belongs to a real end user.

Therefore:
- Do not expose the signer directly to untrusted clients.
- Do not pass request-body user IDs as `authenticatedPrincipal.userId`.
- Do not claim end-to-end user authentication is complete.
- Before production use, integrate and test a trusted OIDC/JWT verifier, issuer/audience/algorithm/key-rotation validation, account mapping through `identity_links`, and authorization before signing the workspace assertion.

## 5. CI and test plan

The workflow provisions PostgreSQL 17 as an ephemeral GitHub Actions service, applies migrations 0001–0003 to that disposable database, seeds only the fixed synthetic CI key, and runs Node unit and PostgreSQL integration tests. Verified run #54 passed all 53 tests (53 passed, 0 failed), including PostgreSQL adversarial integration tests and the schema fixture step. Run: https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/43965363006

Adversarial coverage includes:
- Legacy GUC impersonation attempt.
- Missing assertion.
- Modified MAC.
- Wrong transaction ID.
- Wrong database role.
- Unknown key ID.
- Expired assertion.
- Future-issued assertion outside clock skew.
- Runtime role cannot read key material or replace verifier.
- Cross-workspace reads, writes and audit inserts are denied.
- Transaction-local assertion is cleared on pooled connection reuse.
- Existing membership mutation, owner invariant, audit atomicity and disabled-account tests.

Every denial case also checks that protected rows are not returned or changed.

## 6. Acceptance status

| Gate | Status | Evidence |
|---|---|---|
| HMAC signer and claim validation | IMPLEMENTED | Source + unit tests committed |
| Transaction binding | IMPLEMENTED | Repository integration + SQL verifier |
| Database-side signature verification | IMPLEMENTED | Migration 0003 |
| Active membership/account binding | IMPLEMENTED | Verifier function |
| RLS uses verified identity | IMPLEMENTED | Replacement policies in migration 0003 |
| Runtime cannot read verifier keys | TEST ADDED | PostgreSQL adversarial test |
| Invalid/expired/replayed-across-tx assertion rejection | TEST ADDED | PostgreSQL adversarial test |
| Node unit test execution | VERIFIED — 53 passed, 0 failed | GitHub Actions run #54 |
| PostgreSQL integration execution | VERIFIED — adversarial suite passed | GitHub Actions run #54, PostgreSQL 17 |
| Independent security review | PENDING | Required before release |
| Trusted OIDC/JWT authentication | BLOCKED | Provider and issuer configuration not selected |
| Production key provisioning | NOT STARTED | Explicitly out of scope |
| Production migration | NOT AUTHORIZED | No persistent database touched |
| Merge/deployment | NOT AUTHORIZED | No release action taken |

## 7. Known review points before release

1. Confirm PostgreSQL 17 and pgcrypto availability in the eventual hosting environment; migration 0003 intentionally requires pgcrypto in schema `public`.
2. Review the narrowly scoped BYPASSRLS verifier-owner role and SECURITY DEFINER function independently.
3. Add OIDC/JWT principal verification and trusted identity-link resolution before any user-facing endpoint calls the signer.
4. Add operational key rotation, secret manager integration, revocation drills and monitoring.
5. Run the complete workflow and resolve every failure before treating this implementation as validated.
6. Review performance of repeated verifier calls in RLS policies under realistic query plans.

## 8. Release statement

This is a feature-branch implementation with a disposable CI test path. It is not a production-ready authentication system and is not approved for production migration or deployment.
