# GET Security Model — Proposed GET-02F Update

Treat source text and every externally constructed AST/IR object as untrusted input. GET is a deterministic compiler front-end, not a Python/JavaScript sandbox. Never pass source text to `eval`, `exec`, a shell, dynamic imports, or a code-capable template engine.

## Compiler controls

- Bounded source length, token count, and statement count.
- Strict ASCII identifiers and grammar-defined syntax.
- JSON-compatible string decoding with rejection of unpaired Unicode surrogate code points.
- Finite numeric literals only; numeric IR constants accept finite floats and safe integers (absolute value no greater than 2^53 - 1), but never booleans as numbers.
- Positive, 1-based source-span coordinates.
- Closed IR opcode set: `CONST`, `COPY`, `EMIT_CONST`, and `EMIT_REF`.
- IR binding names and reference operands must satisfy the language identifier grammar.
- IR operands are primitive values or validated binding names; no callable, module, path, or host object is representable.
- Any lexical, syntactic, semantic, or defensive compiler-structure error suppresses plan and IR output.
- Immutable AST, IR, and plan records.
- No file, network, process, environment, database, or model access.

## Host requirements

Authenticate and authorize tenant access before compiling tenant-owned source. Apply HTTP body limits, rate limits, deadlines, concurrency limits, and observability. Do not trust client-supplied tenant identifiers without server-side authorization. Any future executor needs a separate threat model, capability allowlist, resource quotas, approval model, and security review.

## Limitations

These controls are source-level hardening, not an independent penetration test or production-readiness guarantee. GET is not a runtime sandbox, API endpoint, or arbitrary-code execution environment. CI success must be demonstrated by an actual workflow run on the target branch.
