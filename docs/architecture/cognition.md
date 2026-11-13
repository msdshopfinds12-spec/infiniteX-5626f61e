# Phase 6 — Cognition Architecture

## Components
- Planner: validates an objective and explicit step list, then creates a sequential dependency graph.
- ContextBuilder: combines caller-supplied facts with an injected Company Brain search function.
- ReasoningLoop: executes a plan through an injected step executor, stops on the first failure, and blocks unmet dependencies.
- DecisionEvaluator: computes transparent completion metrics and issues.
- ReflectionEngine: creates a structured summary and next action from observed execution results.

## Boundaries
This is deterministic orchestration scaffolding. It does not provide LLM reasoning, autonomous goal discovery, model-based self-reflection, or a configured external AI provider. Company Brain integration is dependency-injected; callers must supply an already authorized tenant-scoped retrieval function. No new public API route is exposed in this phase.

## Security
Cognition must execute only behind authenticated backend boundaries. Memory retrieval must be scoped to the authenticated owner/tenant context; never accept a tenant identity from untrusted task payloads. Tool execution and external side effects require governance and explicit approval in later phases.
