# InfiniteX OIDC Provider Evaluation

**Status:** EVALUATION TEMPLATE — no provider selected, installed or configured.  
**Constraint:** self-hosted-first, free-tier-conscious, portable, Android-compatible client flow.  
**Decision owner:** repository owner after reviewing operational responsibilities.

## 1. Objective

Select an identity provider that implements standard OpenID Connect without making InfiniteX dependent on a specific vendor's proprietary user model. The provider authenticates the person; InfiniteX owns workspace membership, authorization, business rules and audit policy.

## 2. Candidate shortlist

The following are candidates for research, not endorsements or verified compatibility claims:

- Keycloak
- authentik
- ZITADEL
- Ory (Kratos/Hydra stack)

A candidate must be checked against its current documentation, release cadence, license, supported deployment topology, resource requirements, backup/restore process and any paid feature boundary before selection. Do not infer that self-hosting automatically means zero operational cost.

## 3. Weighted scorecard

Score each criterion from 1 (poor) to 5 (strong). Mark unknown items as NOT VERIFIED rather than guessing.

| Criterion | Weight | Evidence required |
|---|---:|---|
| OIDC standards and Authorization Code + PKCE | 15 | Official protocol documentation and interoperability test |
| Security maintenance and release cadence | 15 | Security policy, advisories, supported versions |
| Self-hosting and no mandatory managed service | 10 | Deployment docs and license |
| Resource footprint for a small Linux host | 10 | Official sizing guidance and controlled test |
| Backup, restore and upgrade process | 10 | Official operational docs and restore rehearsal |
| Browser flow and secure session integration | 10 | Cookie, logout and CSRF integration design |
| Android native system-browser flow | 10 | PKCE and redirect URI documentation |
| User/identity export and portability | 5 | Export APIs and documented formats |
| Admin RBAC and auditability | 5 | Admin access and audit documentation |
| Total cost and paid-feature boundaries | 10 | Current license/pricing pages and deployment cost estimate |

Weighted score = sum(score / 5 × weight). Do not score an item until evidence is attached.

## 4. Mandatory pass/fail gates

A provider is rejected if any of these cannot be demonstrated:
- Standard OIDC Authorization Code flow with PKCE for public clients.
- Exact issuer, audience, signature, expiry, state and nonce validation support.
- Secure redirect URI configuration and logout behavior.
- No client secret embedded in Android application binaries.
- Supported security updates and a documented upgrade process.
- Export/backup and restore procedure.
- No requirement to expose PostgreSQL or administrative interfaces publicly.
- Clear license and commercial-use terms for the intended deployment.
- No mandatory paid feature for baseline authentication.

## 5. Integration boundary

InfiniteX should depend on OIDC protocol behavior, not provider-specific database tables. Store a local identity key using the exact validated issuer + subject pair. Avoid automatic account linking based only on matching email addresses.

Required configuration values must be supplied through server-side secret configuration after approval:
- issuer URL
- client ID
- server-side client secret only for confidential backend clients, if the chosen flow requires one
- exact redirect URI
- allowed post-logout redirect URI
- trusted audience/resource identifier where applicable

Never commit actual values. Never put a confidential client secret in Vite environment variables or Android app code.

## 6. Local development alternative

Use a fake OIDC test issuer or isolated test fixtures only if they accurately exercise state, nonce, PKCE, issuer and signature validation. A development mock must be impossible to enable in production configuration. It must not be presented as real authentication.

## 7. Decision record template

- Candidate:
- Version/release:
- License:
- Official docs reviewed:
- Security policy reviewed:
- OIDC PKCE evidence:
- Android flow evidence:
- Resource footprint:
- Backup/restore evidence:
- Paid-feature boundary:
- Known limitations:
- Test environment:
- Decision: ACCEPT / REJECT / NEEDS EVIDENCE
- Reviewer and date:

## 8. Current result

**NOT SELECTED.** No provider was installed, configured, exposed or connected. Next action is evidence collection and a controlled compatibility test after provider selection is explicitly approved.
