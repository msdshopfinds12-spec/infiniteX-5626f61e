# InfiniteX Identity Implementation Readiness Gates

**Status:** PLAN ONLY. Runtime implementation is blocked until design approval.

## Gate 0 — Repository baseline
- Confirm branch and current files.
- Confirm current API entry point and package scripts.
- Inspect existing dependency and lockfile policy.
- Confirm CI status from an actual workflow run.
- Record baseline commit and working-tree state.

Exit evidence: fetched source, commit comparison, CI run URL/result if available.

## Gate 1 — Provider selection
- Complete OIDC scorecard using official docs and current license/security information.
- Confirm Authorization Code + PKCE for browser and Android.
- Confirm update, backup, restore and recovery ownership.
- Confirm small-host resource requirements and no mandatory paid feature.
- Select provider in an ADR.

Exit evidence: completed scorecard, official-source links, selected version and reviewer approval.

## Gate 2 — Authorization and tenant model
- Approve owner/admin/member/viewer permission matrix.
- Define workspace bootstrap, last-owner protection and ownership transfer.
- Define support/platform operator boundary.
- Define all route permissions and resource ownership checks.

Exit evidence: signed-off matrix and endpoint inventory.

## Gate 3 — Data and operations
- Approve users, identity_links, workspaces, memberships and optional sessions schema.
- Define retention, deletion, export and backup policies.
- Define runtime and migration database roles.
- Define local development and disposable integration test environment.

Exit evidence: reviewed ERD/schema, migration plan and restore test plan.

## Gate 4 — Implementation approval
Only after Gates 0–3:
- Approve API framework and exact dependencies.
- Approve provider installation and network exposure plan.
- Approve database client and connection lifecycle.
- Approve auth callback and session implementation.
- Approve migrations as a separate action.

No implementation may silently expand scope into production deployment.

## Gate 5 — Verification
- Unit tests for identity mapping and authorization policy.
- OIDC protocol integration tests, including invalid state/nonce/PKCE/issuer/audience/signature.
- Cross-tenant negative tests for every resource operation.
- Database constraints and transaction tests.
- Secret/log redaction tests.
- Dependency and container image review.
- Backup/restore rehearsal.
- CI result inspected and linked.

Exit evidence: test logs, CI run, audit report and unresolved findings list.

## Gate 6 — Release readiness
Requires separate explicit approval:
- production host and firewall review
- TLS, domain and redirect URI review
- monitoring, backup and incident response
- data-protection and retention review
- rollback plan
- human approval to publish

## Current status
| Gate | Status |
|---|---|
| 0 Repository baseline | PARTIAL — prior baseline exists; refresh before code changes |
| 1 Provider selection | BLOCKED — no provider selected |
| 2 Authorization model | PROPOSED — matrix needs review |
| 3 Data and operations | PROPOSED — schema needs review |
| 4 Implementation approval | BLOCKED |
| 5 Verification | NOT STARTED |
| 6 Release | BLOCKED |
