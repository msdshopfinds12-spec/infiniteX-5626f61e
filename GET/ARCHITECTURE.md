# GET v0.2 Architecture

GET is a dependency-free compiler front-end with a strict separation between source parsing and host effects.

```text
source -> lexer -> parser -> immutable AST
                         -> semantic analysis / symbol table
                         -> static type checker
                         -> typed data-only IR
                         -> validated data-only plan
```

## Module boundaries

- lexer: tokenization, source positions, token budget.
- parser: grammar enforcement and statement budget.
- ast: immutable syntax nodes.
- validator: name resolution, duplicate detection, and type diagnostics.
- typesystem: closed primitive type vocabulary.
- ir: deterministic lowering to a closed opcode set.
- compiler: orchestration and fail-closed result construction.
- runtime: plan contract only; no evaluator is provided.

## Determinism

The compiler uses ordered source traversal, immutable syntax/IR records, a closed type set, and no external services. Identical source and limits produce equivalent compilation results.

## Extension policy

New syntax and opcodes require grammar/spec versioning, negative tests, compatibility review, and a security review. Optimizations must preserve observable output intent and must not introduce host effects.
