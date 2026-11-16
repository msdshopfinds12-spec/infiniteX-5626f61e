# InfiniteX — Disposable OIDC Provider Evaluation Plan

**Status:** DOCUMENTATION ONLY — no provider selected, installed, provisioned, or exposed.
**Repository:** `msdshopfinds12-spec/infiniteX-5626f61e`
**Branch:** `feat/provider-neutral-billing-sandbox`
**Decision:** Evaluate Keycloak, authentik, ZITADEL, and Ory side by side using the same synthetic-identity test contract before selecting any provider.
**Cost policy:** Free-first; no paid plan, trial requiring payment details, cloud resource, domain, SMS, or email service is authorized.

## 1. Objective

Determine which of Keycloak, authentik, ZITADEL, or Ory is the safest and most maintainable disposable OIDC issuer for validating the existing provider-neutral InfiniteX authentication contract. This evaluation is not production authentication and must not use real user accounts or production secrets.

## 2. Current verified boundary

- The repository's authentication build manifest is the governing design contract.
- The existing database-verified, transaction-bound HMAC assertion is not an end-user authentication mechanism.
- The application must resolve a validated OIDC identity by exact `(issuer, subject)`; email is never sufficient to auto-link accounts.
- No OIDC provider, version, deployment host, or runtime dependency has been approved.
- No production migration, public ingress, provider admin console exposure, merge, or deployment is included.

## 3. Candidate evaluation

Evaluate all four candidates against the same protocol contract and test harness. Record exact release versions and source URLs at evaluation time; do not silently use `latest`.

| Dimension | Keycloak | authentik | ZITADEL | Ory | Evidence required |
|---|---|---|---|---|---|
| OIDC Authorization Code + PKCE S256 | Verify | Verify | Verify | Verify | Successful and negative protocol tests |
| Discovery and JWKS rotation | Verify | Verify | Verify | Verify | Metadata/JWKS behavior and rotation test |
| Issuer/audience/nonce validation | Verify | Verify | Verify | Verify | Wrong-issuer, audience and nonce rejection |
| Logout and session behavior | Verify | Verify | Verify | Verify | RP-initiated logout and local-session revocation |
| Admin hardening | Verify | Verify | Verify | Verify | Admin interface isolated from public ingress |
| Resource footprint | Measure | Measure | Measure | Measure | Actual idle/peak RAM, CPU and disk |
| Backup/restore | Verify | Verify | Verify | Verify | Successful disposable restore test |
| Security maintenance | Review | Review | Review | Review | Release cadence, advisories and supported version |
| License | Review | Review | Review | Review | Exact release license and notices |
| Zero-cost feasibility | Verify | Verify | Verify | Verify | Existing compute only; no paid resources |

Do not assign a winner based on feature claims alone. Missing evidence is **UNVERIFIED**, not a pass.

## 4. Disposable test environment requirements

- Use an isolated local or otherwise explicitly approved disposable environment.
- Use synthetic users such as `oidc-test-user-001`; never import production users.
- Use reserved test-only callback URLs and a non-production client ID.
- Bind provider administration and database ports to loopback or a private isolated network; never expose them publicly.
- Do not store provider bootstrap passwords, client secrets, signing keys, or tokens in Git, logs, screenshots, or issue comments.
- Do not use a production issuer, production database, real email/SMS delivery, or live payment flow.
- Destroy the disposable environment and synthetic data after evidence capture, but only after confirming no shared resources are attached.

If no existing computer/host is available, stop at documentation and static review. Do not create a cloud resource or start a paid trial to work around the limitation.

## 5. Common protocol test suite

Run the same relying-party test suite against all four candidates:

1. Discovery document issuer exactly matches the configured HTTPS issuer.
2. Authorization Code flow succeeds with PKCE S256.
3. Missing, incorrect, expired, and replayed state are rejected.
4. Missing or mismatched nonce is rejected.
5. Wrong issuer, audience, authorized party (when applicable), expiry, or disallowed signing algorithm is rejected.
6. Invalid signature and unknown signing key fail closed.
7. JWKS key rotation succeeds without disabling signature verification.
8. Redirect URI mismatch and open-redirect attempts are rejected.
9. A same-email/different-subject identity is not auto-linked.
10. Exact issuer+subject maps to one stable local identity under concurrent requests.
11. Provider logout does not replace local server-side session revocation.
12. Provider outage does not grant access to protected routes.
13. Logs contain no authorization code, state, nonce, verifier, cookie, access token, refresh token, ID token, or client secret.

## 6. Scoring and decision rule

Score each dimension from 0 to 5 only when evidence exists:

- 0 = failed or unsafe
- 1 = major gaps
- 2 = partial / significant manual work
- 3 = meets baseline
- 4 = strong evidence and manageable operations
- 5 = independently verified and repeatable

Weight protocol/security 35%, maintenance/license 20%, operational simplicity 15%, measured resource footprint 15%, backup/restore 10%, and free-tier feasibility 5%.

A candidate is ineligible regardless of total score if it fails issuer/signature/nonce/PKCE validation, exposes administration publicly, requires paid infrastructure contrary to the zero-cost constraint, or cannot be backed up and restored safely. If evidence is incomplete for any candidate, record **NO SELECTION**.

## 7. Evidence record template

For each candidate, record:

- Product and exact version:
- Release and license source:
- Test date and environment:
- Host resource limits and measured idle/peak use:
- OIDC discovery issuer:
- Test-suite commit and run URL:
- Passed / failed / skipped test counts:
- Security advisories reviewed:
- Backup and restore evidence:
- Cost evidence (including compute, storage, bandwidth, domain, email/SMS):
- Open risks:
- Reviewer and decision:

Never paste secrets, raw tokens, private keys, or personal data into this record.

## 8. Approval gates

**Allowed now:** documentation, static source/license review, test design, and synthetic test fixture design.

**Requires separate explicit approval:** installing either provider, adding dependencies, provisioning compute/storage/network, changing DNS, opening ingress, creating persistent data, applying migrations, configuring real identity providers, using paid services, merging, or deploying.

## 9. Recommendation

Keep the application provider-neutral. First complete a static comparison of exact supported releases and license/security-maintenance evidence. Only then request approval for a disposable side-by-side test on already-available compute. Select no provider until all shortlisted candidates have comparable evidence; document any evidence-based reduction in shortlist before hands-on testing.