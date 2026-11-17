# GET-01 Architecture

Pipeline: source -> lexer -> parser -> immutable AST -> semantic validator -> data-only plan.

- Lexer: positioned tokens; rejects unknown characters, malformed strings, and non-finite numbers.
- Parser: recursive-descent parser for the small grammar; rejects malformed or trailing input.
- AST: immutable typed dataclasses with no executable callbacks.
- Validator: rejects duplicate bindings and undeclared/forward references.
- Compiler: creates a plan only when all stages succeed.
- Runtime contract: documents a future host boundary; v0.1 does not execute plans.

The compiler is dependency-free and isolated from API/database layers. API integration must be a separate reviewed change with tenant authorization, request limits, audit logging, and output policy.
