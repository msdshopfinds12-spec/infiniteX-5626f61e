# Phase 87.3 — Shared Transactional Worker Completion Contract

## Scope

Consolidate the duplicated successful-step completion RPC boundary used by the authenticated and cron workflow workers. Preserve each worker's independent authentication, queue-claim, and orchestration boundary.

## Implementation

- Add `supabase/functions/_shared/workflow-completion.ts`.
- Validate owner/run/step identifiers, positive safe-integer attempt generation, and object output before any RPC call.
- Invoke only the fixed `simula_complete_step_with_outbox` RPC.
- Normalize the supported object-or-single-row-array response shape.
- Require a non-empty `step_run_id`.
- Sanitize transport and database errors; never disclose raw database details.
- Keep direct database success-update fallback prohibited.
- Route both worker implementations through the shared helper.

## Verification requirements

- Deno tests for input validation, exact RPC name/arguments, successful normalization, RPC rejection, thrown transport errors, malformed RPC envelopes, and missing completion identity.
- Existing authenticated and cron worker happy-path tests must still verify the RPC is used for every step.
- Existing fail-closed tests must still prove no direct-success fallback.
- Run type safety, worker runtime, HTTP/PostgREST/PostgreSQL integration, and regression workflows on the exact resulting head SHA.

## Explicit non-goals

- No outbox event production is enabled by this refactor; workers continue to pass null event metadata.
- No dispatcher/provider delivery, network egress, provider credentials, secrets, production migration, or deployment.
- No merge or release approval is implied.

## Acceptance criteria

1. Both workers call the same shared completion helper.
2. Worker-specific authentication and authorization remain unchanged.
3. The helper validates input and response shape and fails closed.
4. Tests pass on the exact candidate commit.
5. Security review confirms no direct-success fallback or external side effects.
