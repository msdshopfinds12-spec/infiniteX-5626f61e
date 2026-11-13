# Capability Mesh Architecture

**Phase:** 9 — Capability Mesh
**Status:** Guarded local capability foundation; external providers are not configured.

## Components

- ToolRegistry: process-local registry for explicitly declared tool definitions.
- ToolGateway: fail-closed invocation boundary requiring trusted server-created context and an injected authorization hook.
- Risk levels: READ_ONLY, WRITE, and DESTRUCTIVE.
- Write and destructive tools require an explicit approval hook and an affirmative approval decision.
- Input validators run before handler invocation.
- Provider adapter base contract reports readiness without exposing credentials.

## Safety boundary

A registered tool is not automatically authorized. Missing context, authorization, or required approval denies execution. Tool handler errors return only the exception class, not raw provider messages. Context must be created by trusted backend code; never build it from client-supplied owner IDs, tenant IDs, or role claims.

## Limitations

- Registry and invocation are in-process only.
- No external provider adapters are configured or connected.
- No network, shell, repository, or filesystem tools are included.
- No persistence, distributed tool discovery, quotas, rate limits, or telemetry.
- Governance and approval persistence remain future work in Phase 10.
- Owner-only authentication and tenant binding are not end-to-end verified.
