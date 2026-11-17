# GET-02G — Numeric Precision Architecture

## Scope

An isolated TypeScript numeric utility module. It does not replace the dashboard, execute user-supplied code, or introduce a compiler runtime.

## Design

- **Input boundary:** numeric literals enter as strings; whitespace, separators, exponent notation, and malformed forms are rejected by strict parsers.
- **Integer domain:** `bigint` is the exact integer representation. Conversion to JavaScript `number` is allowed only inside the safe-integer range.
- **Decimal domain:** a decimal is represented as a signed BigInt coefficient plus a non-negative decimal scale. Arithmetic avoids binary floating-point.
- **Division:** callers must choose a target precision; default is 18 decimal places with half-even rounding.
- **Serialization:** exact integers and decimals are serialized as JSON strings. Native JSON does not serialize BigInt.
- **Resource limits:** literal length is capped at 10,000 characters and scale/precision at 1,000 to reduce accidental resource exhaustion.

## Non-goals

- No implicit conversion from arbitrary strings to numbers.
- No implicit currency semantics, locale parsing, exponent notation, or floating-point fallback.
- No claims of cryptographic constant-time behavior.
- No compiler lexer/parser/AST/IR or code generation in this increment.

## Integration contract

Import from `src/engine/numeric/index.ts`. Keep UI components and application state independent from this module until tests and integration review pass.

## Known limitations

- Division is finite-precision and rounded; it is not an exact rational-number representation.
- Decimal multiplication may exceed the configured maximum scale and intentionally fails closed.
- JSON numeric values may already have lost precision before this module receives them. Send exact values as strings at API boundaries.
