# GET Language Specification — v0.2

GET (Guarded Expression Toolkit) is a deterministic, declarative compiler front-end for typed values and output intents. It does not execute source or generated code.

## Syntax

Statements are `let name = value;`, `let name: type = value;`, and `emit value;`. Primitive types are `string`, `number`, `boolean`, and `null`. An omitted annotation is inferred from the initializer. An annotation must exactly match the inferred type; there is no implicit coercion or nullable widening.

## Compiler stages

1. Bounded lexical analysis.
2. Parsing into frozen AST nodes.
3. Single-pass semantic analysis and symbol resolution.
4. Static primitive type validation.
5. Lowering into immutable, data-only typed IR.
6. Construction of a data-only plan after all checks succeed.

## Invariants

- UTF-8 source, bounded source characters, tokens, and statements.
- Deterministic compilation without I/O or network access.
- Bindings are immutable and unique; references must target earlier bindings.
- IR opcodes are a closed set: CONST, COPY, EMIT_CONST, EMIT_REF.
- IR operands are primitive values or binding names; no callable, module, path, or host object is representable.
- Any lexical, syntactic, or semantic error prevents plan and IR generation.
- No imports, reflection, dynamic evaluation, shell, filesystem, network, loops, recursion, or arbitrary host execution.

## Diagnostics

Diagnostics expose stable code, severity, message, and 1-based line/column. GET-T001 is a type mismatch; GET-T002 is an unknown type; GET-S001 is an unknown/forward reference; GET-S002 is a duplicate binding.

## Limits and host responsibilities

The API exposes source-character, token, and statement limits. Hosts must additionally enforce transport body limits, deadlines, concurrency limits, tenant authorization, and audit logging. The compiler front-end is not a runtime sandbox. Any future code generator or execution adapter requires a separate threat model, review, and explicit capability policy.
