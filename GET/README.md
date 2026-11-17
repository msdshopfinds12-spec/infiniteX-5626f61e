# GET-01 — Guarded Expression Toolkit

GET v0.1 is a dependency-free compiler front-end for safe declarative values. It provides a lexer, recursive-descent parser, immutable AST, semantic validator, structured diagnostics, and a data-only plan. It does not execute source or plans.

Example:

    let greeting = "hello";
    emit greeting;

From the repository root, run: python -m pytest GET/tests -q

The compiler tests require no database, paid API, or network access. API integration, frontend UI, runtime execution, persistence, production hardening, and deployment are out of scope for GET-01.
