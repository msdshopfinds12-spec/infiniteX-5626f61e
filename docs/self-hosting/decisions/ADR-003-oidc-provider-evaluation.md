# ADR-003: OIDC Provider Evaluation Decision

- Status: EVALUATION IN PROGRESS — no provider selected
- Date: 2026-11-17
- Related: ADR-002, OIDC_PROVIDER_EVALUATION.md, OIDC_INTEGRATION_BLUEPRINT.md

## Context
InfiniteX needs identity for browser and Android clients while retaining workspace authorization in the API. The project is self-hosted-first and free-first, but self-hosting still has infrastructure, maintenance, backup, update and incident-response costs.

## Evidence reviewed
- Keycloak documents OIDC endpoints, Authorization Code flow and PKCE S256 configuration.
- authentik documents OIDC provider support and PKCE; its official pricing page distinguishes Open Source and enterprise offerings.
- ZITADEL documents self-hosting; its repository identifies AGPL-3.0 with directory-specific exceptions.
- Ory separates identity management (Kratos) from OAuth2/OIDC provider responsibilities (Hydra); its documentation describes enterprise licensing for additional features and support.

See OIDC_PROVIDER_EVALUATION.md for official source links and limitations.

## Decision
Do not select a provider yet. Keep the API protocol-neutral and evaluate Keycloak and authentik first using identical synthetic test cases. Keep ZITADEL conditional on license review. Keep Ory conditional on proving that a two-component architecture is justified.

## Consequences
- No provider image, binary or container is added.
- No provider URL, client ID, client secret or redirect URI is configured.
- No DNS, firewall or public ingress change is made.
- No authentication runtime or database migration is implemented.
- No real user credentials or personal data are collected.

## Exit criteria
Provider selection requires measured resource use, successful OIDC protocol tests, Android system-browser flow, backup/restore evidence, upgrade/security maintenance review, license review and explicit project-owner approval.