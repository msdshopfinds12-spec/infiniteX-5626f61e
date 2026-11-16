# InfiniteX OIDC Provider Research and Comparison

Research date: 2026-11-17
Status: evidence-backed shortlist; NO provider selected.

## Executive assessment

Keep the API protocol-neutral and test candidates with the same relying-party test suite.

- Keycloak documents OIDC endpoints, Authorization Code flow and a configurable PKCE S256 requirement. Its host resource use and operational complexity must be measured.
- authentik documents OIDC provider behavior and PKCE support. Its official pricing page lists an Open Source tier and separates enterprise features/support.
- ZITADEL documents self-hosting and broad identity features. Its GitHub repository identifies AGPL-3.0 with exceptions for selected directories; obtain license review.
- Ory Kratos manages identities and sessions; Hydra provides OAuth2/OIDC. This is a composable multi-component architecture, not a single drop-in identity service. Ory documents separate enterprise offerings for additional features, security releases and support.

No numeric winner is declared. Resource usage, restore behavior, Android redirects, upgrades and legal suitability have not been tested for this repository.

## Evidence comparison

| Candidate | Documented capabilities | Important caveat | Disposition |
|---|---|---|---|
| Keycloak | OIDC provider endpoints, Authorization Code flow, PKCE S256 configuration | Measure host footprint; review realm/client hardening and upgrade/backup operations | Shortlist |
| authentik | OAuth2/OIDC provider, authorization code and PKCE; Open Source offering | Confirm exact version and enterprise-only feature boundaries | Shortlist |
| ZITADEL | OIDC, SAML, MFA/passkeys, multi-tenancy; self-host option | AGPL-3.0 repository license with directory-specific exceptions requires review | Conditional shortlist |
| Ory Kratos + Hydra | Kratos identity/session management; Hydra OpenID Certified OAuth2/OIDC | Two-service composition and login/consent integration increase operational scope | Conditional alternative |

## Official evidence

### Keycloak
- OIDC endpoints and Authorization Code flow: https://www.keycloak.org/securing-apps/oidc-layers
- OIDC conformance: https://www.keycloak.org/securing-apps/specifications
- PKCE S256 configuration: https://www.keycloak.org/docs/latest/server_admin/
- Require PKCE S256 for public/native clients. Do not enable password/direct-access grant for this application.

### authentik
- OIDC/OAuth2 provider and PKCE: https://docs.goauthentik.io/add-secure-apps/providers/oauth2
- Open Source and Enterprise distinction: https://docs.goauthentik.io/
- Pricing/features: https://goauthentik.io/pricing/
- Release notes: https://docs.goauthentik.io/releases/

### ZITADEL
- Product and self-hosting options: https://zitadel.com/docs
- Repository/license: https://github.com/zitadel/zitadel

### Ory
- Open-source projects: https://www.ory.com/docs/oss/open-source
- Kratos: https://github.com/ory/kratos
- Hydra: https://github.com/ory/hydra

## Weighted decision rubric

| Criterion | Weight | Required proof |
|---|---:|---|
| OIDC code flow + PKCE S256 | 15 | Automated relying-party compatibility tests |
| Security updates and vulnerability response | 15 | Security policy, supported versions and advisories |
| License and intended use | 10 | Exact release license and legal review |
| Resource use on target host | 10 | Repeatable CPU/RAM/storage measurement |
| Backup and restore | 10 | Successful isolated restore rehearsal |
| Android system-browser flow | 10 | Native PKCE redirect test |
| Browser cookie/logout integration | 10 | CSRF, cookie and logout tests |
| Export and portability | 5 | Identity export/import rehearsal |
| Admin controls and auditability | 5 | Admin-role and event review |
| Maintenance effort | 10 | Upgrade, rollback and monitoring procedure |

Score 1–5 only when evidence is attached. Unknown means NOT VERIFIED, not zero and not a guessed score.

## Recommended evaluation order
1. Test authentik and Keycloak first using identical synthetic accounts and protocol cases.
2. Measure both in the same disposable Linux environment.
3. Evaluate ZITADEL only after license review.
4. Evaluate Ory only if the separate Kratos/Hydra architecture is justified.
5. Select only after resource, restore, security-maintenance, Android and license evidence is complete.

## Hard gates and safety
- PKCE S256 for public clients; strict redirect URI allowlist.
- Validate issuer, audience, signature, expiry, state and nonce.
- Supported security update path and restorable backups.
- Clear license; no public database/admin port; no secrets in client bundles.
- No public exposure during evaluation; synthetic users only.
- No provider installation, paid provisioning, firewall change, secrets, migrations or deployment without separate approval.
- No provider is selected by this document.