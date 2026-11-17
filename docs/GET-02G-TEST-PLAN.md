# GET-02G — Verification Plan

## Required commands

1. `npm ci`
2. `npm run lint`
3. `npm test` — Node's built-in test runner with Vite's existing build API; no additional package is required.
4. `npm run build`

The test harness bundles the TypeScript numeric entry point in memory with the project's existing Vite dependency, then executes regression tests using `node:test`.

## Required test vectors

| Area | Input | Expected |
|---|---|---|
| Safe integer | `9007199254740991` | Accepted as number |
| Unsafe integer | `9007199254740992` | Rejected as number; accepted as BigInt |
| Big integer | `123456789012345678901234567890` | Exact round-trip string |
| Decimal parse | `0.1` | coefficient 1, scale 1 |
| Decimal add | `0.1 + 0.2` | `0.3` |
| Decimal multiply | `1.25 * 2` | `2.5` |
| Decimal divide | `1 / 8`, precision 3 | `0.125` |
| Half-even tie | `1 / 8`, precision 2 | `0.12` |
| Half-up tie | `1 / 8`, precision 2 | `0.13` |
| Divide by zero | `1 / 0` | DIVISION_BY_ZERO |
| Exponent syntax | `1e3` | Rejected |
| Leading zero | `01.2` | Rejected |
| Excess scale | over 1,000 fractional digits | Rejected |

## Regression and security checks

- Verify negative values and negative rounding boundaries.
- Verify zero normalization and trailing-zero normalization.
- Verify max input length and max precision boundaries.
- Verify no conversion through JavaScript Number occurs in exact arithmetic paths.
- Verify API/JSON contract stores exact values as strings.
- Verify all error paths fail closed and do not silently coerce.

## Evidence policy

A plan or test vector is not an executed test. Record actual command output, tool version, commit SHA, and pass/fail counts before marking TEST complete.
