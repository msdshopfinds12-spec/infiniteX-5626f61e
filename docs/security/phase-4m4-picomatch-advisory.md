# Phase 4M.4 — picomatch dependency advisory

**Status: UNRESOLVED / RELEASE BLOCKING**

## Evidence at the recovery-branch starting commit

- Affected dependency path: `vite@8.3.7 -> tinyglobby@0.2.17 -> fdir@6.5.0 -> picomatch@4.0.7`.
- Advisory identifier recorded by the CI investigation: `GHSA-fc5q-39xc-vjpf` / `CVE-2026-112366`.
- The existing dependency audit reports this transitive dependency at high severity.
- The affected package is currently in the development toolchain through Vite. This fact alone does **not** prove that vulnerable matching is reachable from the production bundle or that untrusted patterns reach the package.

## Safe remediation decision

Do not claim the advisory is fixed until all of the following are true:

1. An upstream patched release is published and its advisory status is confirmed.
2. The patched version is selected through a compatible, supported dependency path.
3. `package-lock.json` is regenerated from the approved manifest with a reproducible install.
4. `npm ls vite tinyglobby fdir picomatch`, `npm audit --audit-level=moderate`, typecheck, unit tests, browser tests and production build pass on the exact candidate commit.
5. The resulting dependency graph and build output are reviewed for unexpected changes.

Do not use `npm audit fix --force`, an unverified Vite downgrade, an arbitrary fork, a random package override, or an audit suppression as a substitute for remediation. A workaround that makes CI green while leaving the vulnerable package unresolved is not an acceptable security fix.

## Interim controls

- Keep dependency auditing as a blocking CI gate.
- Keep Vite and glob-matching inputs within the trusted build/development boundary.
- Do not pass attacker-controlled patterns into build-time glob APIs.
- Keep production deployment blocked while the high-severity audit finding remains unresolved.
- Reassess reachability and exposure from actual application and build usage; do not infer exploitability solely from the dependency tree.

## CI trigger coverage

The recovery branch is included in the frontend, security-regression and Vite verification push filters. The Vite workflow also includes the tenant-isolation branch as a pull-request **base** filter. Workflow regression tests assert these exact trigger contracts.

## Scope and limitations

This change repairs CI trigger coverage and records the current advisory decision. It does not upgrade or remove picomatch, prove runtime exploitability or non-exploitability, run a live database test, merge a pull request, or deploy the application.

Re-check the upstream advisory and package release metadata before selecting a dependency remediation. Record the exact package versions and test evidence in a follow-up change.
