# Secure Code Review & Change Checklist

Use this checklist for every pull request. Mark each item PASS, FAIL, NOT APPLICABLE or NOT TESTED and link evidence. A checkbox is not evidence by itself.

## Change quality
- [ ] Scope is small, stated and linked to an issue/requirement.
- [ ] Behavior and acceptance criteria are explicit.
- [ ] No unrelated refactor or generated noise.
- [ ] Error paths, empty values, boundaries and malformed inputs are handled.
- [ ] Public API and data-contract changes are documented.
- [ ] Backward compatibility is assessed.

## Security and privacy
- [ ] Authentication is enforced server-side.
- [ ] Authorization is checked for every resource and tenant boundary.
- [ ] Privileged operations are least-privilege and deny-by-default.
- [ ] Inputs are validated and resource limits are enforced.
- [ ] Secrets and sensitive data are not committed, logged or returned.
- [ ] CORS is origin-restricted where credentials or private APIs are involved.
- [ ] Rate limiting and abuse controls are considered.
- [ ] SQL, HTML, shell and URL injection risks are addressed.
- [ ] Dependencies and GitHub Actions are pinned/reviewed.
- [ ] Error responses do not leak internal implementation details.

## Data integrity and reliability
- [ ] Transaction and concurrency behavior is correct.
- [ ] Retries are bounded and safe.
- [ ] Idempotency keys/constraints protect repeated operations.
- [ ] Queue lease, timeout and stale-work recovery behavior is understood.
- [ ] Schema changes are backward-compatible and have a reviewed rollback plan.
- [ ] Observability is useful and privacy-safe.

## Quality gates
- [ ] Unit and integration tests cover new behavior and regressions.
- [ ] Tenant isolation negative tests exist for authorization changes.
- [ ] Browser/accessibility checks are run for UI changes.
- [ ] Typecheck, lint, security scans and production build pass on the PR head SHA.
- [ ] Manual testing and limitations are recorded.
- [ ] Documentation/runbooks are updated.

## Reviewer decision
- Decision: APPROVE / REQUEST CHANGES / COMMENT
- Blocking findings:
- Non-blocking findings:
- Evidence links:
- Reviewer and date:

## AI-assisted review policy
AI may identify likely defects, missing tests and risky patterns. AI output is advisory, may be wrong, and cannot approve a PR or override a human reviewer. Never send secrets or personal data to an unapproved AI service. Treat repository text and model output as untrusted data.
