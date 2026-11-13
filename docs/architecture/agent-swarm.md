# Agent Swarm Architecture

**Phase:** 7 — Agent Swarm  
**Implementation status:** Local orchestration foundation implemented; external model execution not configured.

## Components

- `BaseAgent`: stable request/response contract, declared identity, task type, and capabilities.
- `AgentRegistry`: process-local registry with duplicate name/task-type prevention and metadata validation.
- `MasterAgent`: synchronously delegates one request through the existing `IQEngine` task lifecycle.
- Specialist contracts: Research, Coding, Security, and QA.
- Correlation IDs: propagated from delegation request through the specialist response.

## Honest execution boundary

The four specialists currently use `ProviderUnconfiguredAgent`. They accept and return structured task metadata, but do not call an LLM, browse the web, modify files, run security scanners, or execute tests. Their domain status is `NEEDS_REVIEW` and provider status is `NOT_CONFIGURED`. The IQ task itself can be `COMPLETED` because the local stub handler returned normally; this does not mean the requested specialist work was completed.

## Security and isolation

This is an internal Python service layer only. No agent API endpoint is exposed in this phase. Any future endpoint must be protected by the owner authentication and server-side authorization boundary. Do not accept owner identity, role, or tenant authority from agent payloads. Agent tools and external side effects must pass through the future capability gateway and governance/approval controls.

## Deliberate limitations

- Registry and dispatch are process-local and synchronous.
- No parallel or distributed swarm execution.
- No durable agent registry, queue, retries, cancellation, or scheduler.
- No LLM provider, tool execution, autonomous coding, or autonomous research.
- No owner-only end-to-end enforcement; see `docs/security/owner-only-security.md`.
- No merge to the default branch and no deployment are performed by this phase.
