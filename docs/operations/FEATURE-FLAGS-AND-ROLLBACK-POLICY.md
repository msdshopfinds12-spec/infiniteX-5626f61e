# Feature Flags & Rollback Policy

**Status:** Policy and implementation requirements. No feature-flag provider or production flag is asserted to be configured.

## When to use a flag
Use flags for staged rollout, controlled beta access, emergency kill switches and gradual exposure. Do not add a flag for every minor code path; flags create state-space and cleanup debt.

## Required metadata
Each flag must have:
- Stable key and human-readable purpose.
- Technical and business owner.
- Default state (safest behavior).
- Targeting rules and allowed environments.
- Creation date and expiry/removal date.
- Security review if it gates sensitive functionality.
- Fallback behavior if flag evaluation fails.

## Security rules
- A flag is never an authorization boundary.
- Server-side authorization must remain enforced even when a UI flag is off.
- Sensitive flags must be evaluated server-side.
- Do not expose internal rollout rules or secrets to clients.
- Unknown flag values must fail to the safest default.
- Audit who changed a production flag and when.

## Rollout procedure
1. Ship backward-compatible code with the feature disabled by default.
2. Test enabled and disabled paths in non-production.
3. Validate metrics, logs, authorization and accessibility.
4. Approve a limited rollout cohort.
5. Increase exposure only when health indicators remain within agreed thresholds.
6. Remove temporary flags after full rollout and a defined observation period.

## Rollback decision
Trigger rollback or disablement for material error/latency regression, data integrity risk, security regression, critical workflow failure or unexpected cost/abuse.

Before action:
- Identify exact flag and safe fallback.
- Identify whether disabling the feature can interrupt in-flight work.
- Check schema/API compatibility.
- Record current state and obtain approval for production changes.

After action:
- Verify the feature is disabled for intended cohort.
- Confirm core workflows and authorization still work.
- Monitor recovery signals.
- Record the incident/change and follow-up actions.

## Code rollback vs data rollback
A code rollback restores a prior application artifact. It does not automatically reverse database changes, external side effects, sent messages or third-party actions. Use expand/contract schema evolution and forward-fix where rollback would corrupt data.

## Flag lifecycle
Every temporary flag must have a removal issue. Expired flags are reviewed; they are not silently left indefinitely.
