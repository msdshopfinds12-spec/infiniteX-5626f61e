# GET-02G — Security Review

## Scope and trust boundaries

This module accepts numeric text and performs bounded integer/decimal operations. It does not evaluate source code, execute expressions, access files, make network requests, or process secrets.

## Implemented controls

- Strict decimal and integer grammar; no implicit locale parsing, exponent parsing, or whitespace trimming.
- Runtime type guards at public parsing boundaries.
- Exact integer conversion uses BigInt; Number conversion is rejected outside the safe-integer range.
- Literal length is capped at 10,000 characters.
- Decimal scale and division precision are capped at 1,000.
- Unsupported rounding modes and division by zero fail with typed errors.
- Exact numeric JSON values are represented as strings.
- GitHub Actions uses read-only repository permissions for CI.

## Dependency audit — VERIFIED FINDINGS

The successful CI audit step reported two dependency advisories in the existing dependency graph:

| Package | Severity | Range reported | Direct dependency | Suggested fix |
|---|---|---|---|---|
| vite | High | <= 6.4.3 | Yes | Vite 8.3.8 (major upgrade) |
| esbuild | Moderate | <= 0.24.2 | No | Resolved through Vite 8.3.8 (major upgrade) |

The repository already declared Vite 5 before this numeric-engine work. These findings are therefore treated as pre-existing project dependency risk, not a vulnerability introduced by the numeric module.

## Remediation decision

Do not run `npm audit fix --force` automatically. The suggested remediation is a major Vite upgrade and may require coordinated upgrades to Vite plugins, Node.js support, configuration, and build validation.

Recommended separate work item: plan a Vite 8 migration on an isolated branch, inspect plugin peer dependencies and release notes, update the lockfile with npm, then run the complete test/build suite. Do not merge or deploy until compatibility and security checks pass.

## Remaining limitations

- This is an engineering-level review, not a formal security certification.
- Decimal division is finite-precision and rounded; it is not arbitrary-precision rational arithmetic.
- Applications must validate and authorize API requests independently; this library is not an authorization layer.
- Do not use the general-purpose default rounding configuration as a substitute for domain-specific financial or legal requirements.
