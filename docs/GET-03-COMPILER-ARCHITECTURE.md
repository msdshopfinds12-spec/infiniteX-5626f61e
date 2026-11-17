# GET-03 — Compiler Core Architecture Plan

## Goal

Add a small, deterministic, safe arithmetic-expression compiler/evaluator as an isolated TypeScript module. Reuse GET-02G exact decimal arithmetic; do not use JavaScript floating-point arithmetic for language calculations.

## Supported language (v1)

- Decimal literals: `0`, `42`, `12.50`, `0.001`
- Binary operators: `+`, `-`, `*`, `/`
- Unary signs: `+`, `-`
- Grouping: parentheses
- Whitespace between tokens
- Precedence: unary > multiplication/division > addition/subtraction
- Left associativity for binary operators
- Division precision is explicit and bounded (default 18 decimal places).

## Explicitly unsupported

Identifiers, variables, assignment, function calls, property access, arrays, objects, strings, comments, exponent notation, implicit multiplication, loops, imports, network access, filesystem access, eval, and dynamic code execution.

## Pipeline

1. Lexer: source text → position-aware token stream.
2. Parser: tokens → typed AST using precedence climbing / recursive descent.
3. AST: immutable discriminated union with source spans.
4. Evaluator: interpret only known AST node kinds using GET-02G DecimalValue operations.
5. Diagnostics: typed compiler errors with stable codes and source offsets.

## Resource and safety limits

- Source length: 10,000 UTF-16 code units.
- Token count: 2,000 maximum.
- Parenthesis / recursive parser depth: 128 maximum.
- Division precision: integer 0..1,000.
- No eval, Function constructor, generated JavaScript, I/O, or implicit network operations.
- No user-provided identifiers or executable statements in v1.

## Error handling

Syntax errors include a stable error code, message, and zero-based source offset. Arithmetic errors from GET-02G remain typed numeric engine errors (for example division by zero or precision overflow).

## Verification plan

- Lexer token and invalid-character tests.
- Parser precedence, associativity, unary and grouping tests.
- Evaluator exact-decimal tests, including 0.1 + 0.2.
- Division precision and divide-by-zero tests.
- Resource-limit and malformed-input tests.
- Run existing GET-02G numeric tests unchanged.
- Run TypeScript lint and production build.

## Scope boundary

This stage is a bounded arithmetic expression language, not a general-purpose programming language, optimizing compiler, sandbox, or production financial engine. Future phases (variables, types, IR, code generation) require separate design and security review.

## Approval gates

Branch-only changes. No PR, merge, dashboard changes, migrations, or deployment in this stage.
