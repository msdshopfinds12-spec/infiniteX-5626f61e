# GET Language Specification — v0.1

GET (Guarded Expression Toolkit) is a small, deterministic, declarative language for typed values and output intents. v0.1 is a compiler front-end, not a general-purpose programming language or execution engine.

## Invariants
- UTF-8 source; bounded character and token counts.
- Deterministic lexing and parsing without I/O or network access.
- Values are strings, finite numbers, booleans, null, or references to earlier bindings.
- Bindings are immutable and unique.
- emit declares output intent; it performs no I/O.
- No imports, reflection, dynamic evaluation, shell, filesystem, network, loops, recursion, or arbitrary host execution.
- Successful compilation returns a validated AST and data-only plan. A host must separately authorize future effects.

## Syntax
Statements: let name = value; or emit value;. Identifiers begin with an ASCII letter or underscore. Strings use double quotes and JSON-compatible escapes. Numbers are finite decimals with optional exponent. Comments begin with # and continue to end of line.

## Types
Primitive types are string, number, boolean, and null. References inherit the type of their earlier binding. No implicit coercion exists.

## Diagnostics
Diagnostics include stable code, severity, message, and 1-based line/column. Any lexical, syntactic, or semantic error prevents plan generation.

## Limits and compatibility
The API exposes max_source_chars and max_tokens. Hosts must also enforce transport body limits, deadlines, concurrency limits, and tenant authorization. Incompatible grammar changes require a language-version increment and fixture updates.
