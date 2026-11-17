# GET-01 Security Model

Treat source text as untrusted input. This compiler is a parser, not a Python/JavaScript sandbox. Never pass source text to eval, exec, a shell, dynamic imports, or a code-capable template engine.

## v0.1 controls
- Bounded source length and token count.
- Strict grammar and JSON-compatible string decoding.
- Finite numeric literals only.
- Immutable AST and plan records.
- No file, network, process, environment, database, or model access.
- Fail-closed compilation: diagnostics suppress the plan.

## Host requirements
Authenticate and authorize tenant access before compiling tenant-owned source. Apply HTTP body limits, rate limits, deadlines, concurrency limits, and observability. Do not trust client-supplied tenant identifiers without server-side authorization. Any future executor needs a separate threat model, capability allowlist, resource quotas, approval model, and security review.

## Limitations
This foundation has not been independently penetration-tested. It is not a runtime sandbox, API endpoint, or production-readiness guarantee.
