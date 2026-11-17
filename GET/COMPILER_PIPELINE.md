# Compiler Pipeline

1. Validate source type and source character limit.
2. Lex into positioned tokens under a token budget.
3. Parse statements into immutable AST nodes.
4. Validate declaration order and references.
5. Produce a declarative plan only when there are no diagnostics.

A plan is data, not executable code. GET v0.1 deliberately has no run() method. Malformed input is never silently repaired into a different program.
