# Phase 3D-4H — CI Governance and Release Safety

Status: **POLICY SCANNER ADDED; WORKFLOW EXECUTION REQUIRED FOR VERIFICATION**

## Scope

This phase adds a dependency-free Node.js policy scanner for tracked GitHub Actions workflow files. It checks:

- Workflow-level permissions are explicitly declared.
- No permission is granted write access by default.
- External actions are pinned to full 40-character commit SHAs.
- `actions/checkout` disables persisted Git credentials.
- Every workflow job has a finite timeout.

The scanner is a guardrail, not a complete YAML parser, GitHub policy engine, or substitute for reviewing workflow semantics. It intentionally does not parse arbitrary YAML anchors or evaluate expressions.

## CI integration

The frontend CI runs the policy scanner before dependency installation. The scanner uses only Node.js built-ins and introduces no package dependency or paid service.

## Release safety model

- CI verification and deployment are separate concerns.
- A green build does not authorize production deployment.
- Required status checks and branch protection must be configured in repository settings; workflow files alone cannot guarantee enforcement.
- Human approval remains required before merge or production release.
- No production secrets, database credentials, or deployment permissions are added by this phase.

## Known limitations / next gates

1. Verify the scanner against the current workflow set in GitHub Actions.
2. Configure repository rulesets/branch protection only after reviewing existing settings and obtaining approval.
3. Add protected-environment deployment approvals only when a deployment workflow is intentionally introduced.
4. Add PostgreSQL integration tests only after the real schema is verified; never connect CI to production data.
5. Review AI-assisted PR automation separately. AI may propose patches and review diffs, but must not receive production secrets or merge/deploy authority.

## Free-first alternative

Use GitHub-hosted CI with read-only permissions, Node.js built-ins, and synthetic test data. Do not add third-party AI agents or paid scanners as required checks. Optional AI review remains advisory and must be independently validated by deterministic tests and human review.
