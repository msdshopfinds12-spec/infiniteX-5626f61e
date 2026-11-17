# GET-04 — Semantic and IR Test Plan

## Acceptance criteria

1. Semantic analysis validates all known AST node variants and source spans.
2. Unknown node kinds, operators, and malformed literals fail with stable typed diagnostics.
3. AST node/depth limits are enforced.
4. Lowering emits deterministic postfix IR.
5. IR verifier rejects invalid headers, unknown instructions, malformed constants, underflow, excess instructions, excess stack, and invalid final stack depth.
6. Runtime re-verifies IR and enforces division precision.
7. Constant folding preserves exact results and uses configured division precision.
8. AST and IR execution agree for supported expressions.
9. Existing GET-02G and GET-03 tests remain green.
10. Production build and TypeScript checks pass.

## Required test groups

- Semantic node counts and malformed ASTs.
- IR stack effects and instruction allowlist.
- Resource limits and hostile/malformed IR.
- Exact arithmetic and negative values.
- Constant-folding correctness.
- Division precision parity and divide-by-zero.
- Determinism and full regression suite.
