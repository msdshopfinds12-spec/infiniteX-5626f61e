# InfiniteX OIDC Research Phase Report

Branch: feat/provider-neutral-billing-sandbox
Phase: PLAN — provider research and integration blueprint
Date: 2026-11-17

## Deliverables
- docs/self-hosting/OIDC_PROVIDER_EVALUATION.md — evidence-backed shortlist and decision rubric.
- docs/self-hosting/OIDC_INTEGRATION_BLUEPRINT.md — browser BFF, Android PKCE, API boundaries, TypeScript contracts, endpoint proposal and test plan.
- docs/self-hosting/decisions/ADR-003-oidc-provider-evaluation.md — records why no provider is selected yet.
- docs/self-hosting/IDENTITY_IMPLEMENTATION_READINESS.md — readiness gate updated with research status.

## Research outcome
- Keycloak and authentik are first candidates for identical synthetic protocol tests.
- ZITADEL remains conditional on license review.
- Ory remains conditional because Kratos and Hydra have separate responsibilities and operational complexity.
- No weighted score or final provider winner is claimed because resource use, Android flow, restore and compatibility tests have not been performed.

## Evidence ledger
| Item | Status |
|---|---|
| Provider comparison document committed | VERIFIED after fetch-back |
| Integration blueprint committed | VERIFIED after fetch-back |
| ADR-003 committed | VERIFIED after fetch-back |
| Provider selected | NOT DECIDED |
| Provider installed or exposed | NO |
| Auth runtime implemented | NO |
| Dependencies installed | NO |
| Database migration | NO |
| Tests executed | NOT TESTED |
| CI status | NOT VERIFIED in this phase |
| Merge/deployment | NOT PERFORMED |

## Next gate
Obtain approval for a disposable, private, synthetic-data proof-of-concept comparing Keycloak and authentik. The test must not expose either service publicly, configure real user credentials, provision paid resources, or alter production data. Provider selection remains a separate approval decision.