# InfiniteX Dependency Governance

## Status

This change adds a repeatable dependency-audit report and a blocking policy for high and critical npm audit findings. It does not patch any third-party package and does not claim that a reported dependency is exploitable in the application.

## Policy

- Install only from the committed lockfile with `npm ci`.
- Preserve the npm audit JSON evidence.
- Block CI when npm reports one or more high or critical vulnerabilities.
- Do not use `npm audit fix --force`, arbitrary package overrides, unreviewed forks, or unmerged upstream pull requests as production remediations.
- Do not suppress findings solely to obtain a green CI result.
- Review direct and transitive dependency paths, affected version ranges, available vendor fixes, and whether untrusted input reaches the vulnerable functionality.
- Generate a CycloneDX SBOM as a build artifact when the installed npm version supports `npm sbom`.
- Keep artifacts for 14 days; do not include secrets or environment files.

## Local verification

```sh
npm ci
node --test scripts/dependency-policy.test.mjs
npm sbom --sbom-format=cyclonedx > sbom.cdx.json
node scripts/dependency-policy.mjs --output dependency-audit-report.json
```

The audit command intentionally exits non-zero for high or critical findings. This is expected while a blocking advisory remains unresolved.

## Remediation acceptance criteria

A dependency remediation is acceptable only when:

1. The vendor publishes a fixed release or a security patch is independently validated.
2. The selected version satisfies the project's declared dependency constraints.
3. The lockfile resolves to the intended version and integrity metadata.
4. `npm ci`, the dependency policy tests, the full test suite, type checks, browser/accessibility tests, and production build pass.
5. The resulting audit report no longer contains the resolved advisory.
6. A reviewer checks the complete diff and release evidence.

## Scope and limitations

This workflow has read-only repository permissions. It does not publish packages, create releases, modify secrets, deploy applications, or merge pull requests. SBOM generation records dependency inventory; it is not proof that dependencies are safe.
