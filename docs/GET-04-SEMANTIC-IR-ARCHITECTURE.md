# GET-04 — Semantic Analysis and Intermediate Representation

## Objective

Extend the bounded arithmetic language from GET-03 with a validated semantic-analysis stage, deterministic stack-based Intermediate Representation (IR), an IR verifier, a safe interpreter, and conservative constant folding.

## Pipeline

`Source → Lexer → Parser → AST → Semantic Analysis → IR Lowering → IR Verification → Optimization → IR Verification → Interpreter`

The AST evaluator remains available as an independent reference path. The pipeline returns both AST and IR results so tests can compare them.

## IR v1

Versioned postfix stack instructions:
- `constant`: push a canonical decimal string.
- `positive`: unary plus; stack effect 1 → 1.
- `negative`: unary minus; stack effect 1 → 1.
- `add`, `subtract`, `multiply`, `divide`: binary operation; stack effect 2 → 1.

IR is data, not executable source code. There is no bytecode JIT, eval, Function constructor, code generation, host I/O, or plugin execution.

## Semantic analysis

Validates the AST node discriminant, operator allowlist, decimal literal grammar, source spans, and complexity. Returns node count, maximum depth, literal count, and operator count.

## IR verification

Checks the version header, instruction allowlist, decimal constants, stack underflow, maximum instruction count, maximum stack depth, and exactly one final stack value. Runtime verifies the IR again before execution; callers must not treat TypeScript types as runtime validation.

## Optimization

The optimizer performs local constant folding on postfix stack fragments and removes no side effects because the language has no side effects. It re-verifies its output. Division folding uses the same explicit precision and half-even rounding policy as runtime.

## Resource limits

- AST: 4,000 nodes; depth 256.
- IR: 8,000 instructions; stack depth 4,000.
- Source/token/parser limits remain inherited from GET-03.
- Division precision remains integer 0..1,000.

## Correctness contract

For supported expressions and identical division precision, AST evaluation and IR execution must produce the same exact DecimalValue. Constant folding must preserve this result. Division is finite-precision decimal arithmetic, not arbitrary-precision rational arithmetic.

## Explicitly out of scope

General-purpose language features, variables, functions, type inference, control flow, imports, user-defined operators, native code generation, JIT, WASM, filesystem/network access, and security certification.

## Release gates

Branch-only implementation. CI must pass type checks, all numeric/compiler/IR tests, and production build. No PR, merge, deployment, or dashboard integration in this stage.
