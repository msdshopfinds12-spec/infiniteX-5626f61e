# Approval Reviewer Authentication Boundary

**Status: CODED ON THE HARDENING BRANCH; ROUTE INTEGRATION AND RUNTIME TESTS PENDING.**

## Current trust chain

1. A protected FastAPI route must depend on `get_current_principal`.
2. That dependency verifies the configured identity provider's JWT, issuer, audience, signature, expiry, and exact owner subject.
3. `get_approval_reviewer` maps that verified principal to the only currently supported reviewer role: `owner`.
4. The resulting server-derived `subject` and `role` are the values that a caller may pass as `expected_reviewer_subject` and `expected_reviewer_role` to `verify_ed25519_approval`.
5. The approval payload's own `sub` and `reviewer_role` remain untrusted until they match those server-derived expected values and the signature is valid.

## Explicit limitations

- This is a single-owner authorization adapter, not a multi-reviewer role system.
- `security_reviewer` and `maintainer` must remain unavailable until a server-side role directory, policy evaluation, and tests exist.
- Do not accept expected subject or role from query parameters, request bodies, headers, frontend state, or the signed approval payload itself.
- Do not construct `CurrentPrincipal` from client-controlled data. Only use the dependency-injected value from the authenticated request path.
- The Ed25519 verifier still receives a trusted public key from server-side configuration. No private signing key belongs in this repository or frontend.
- Key IDs, rotation, revocation, and overlap windows are not implemented. Add them only with an explicit trusted issuer/key-registry design; unknown or retired key IDs must fail closed.
- The durable nonce store is still an interface only. A persistent atomic implementation and replay tests are required before approvals can authorize any execution.
- No patch application, generated-code execution, or production write is enabled by this adapter.

## Required next verification

- Add the dependency to the exact protected approval-review route.
- Test anonymous, invalid-token, non-owner, and valid-owner requests through the FastAPI application.
- Verify the route passes only the dependency-produced reviewer context into the approval verifier.
- Implement durable one-time nonce consumption before any future patch-application capability.
