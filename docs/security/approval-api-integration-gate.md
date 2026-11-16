# Approval API Integration Gate

**Status: VERIFICATION ADAPTER IMPLEMENTED; NO HTTP APPROVAL ROUTE EXISTS YET.**

The backend currently exposes health, tasks, and memory routers. There is no existing approval-review API route to integrate without designing a new public contract. A route has deliberately not been invented in this hardening step because proposal persistence, trusted public-key configuration, signature transport, nonce consumption, and audit-event storage are not yet implemented.

## Trusted call sequence for a future route

1. FastAPI resolves `get_approval_reviewer`, which depends on the existing JWT-verified `get_current_principal`.
2. The service loads the proposal and its immutable repository/branch/base-commit/file scope from trusted storage.
3. The service loads a verifier public key from server-side configuration or a future key registry. Private signing keys remain outside this API.
4. The service calls `verify_for_authenticated_reviewer`. This adapter derives reviewer subject and role from the authenticated context; callers cannot pass those expectations separately.
5. Only after signature and exact-scope verification may a future service atomically consume the approval nonce and create an immutable apply-intent record in one database transaction.
6. Any future patch executor must remain a separate isolated worker with a strict filesystem/network/tool allowlist and no production credentials.

## Not implemented

- No approval HTTP endpoint or approval issuer.
- No public-key registry, key IDs, rotation, or revocation.
- No durable nonce-store adapter or audit-event table.
- No patch application or generated-code execution.
- No migrations were created or run.

## Release gate

Do not enable approval-driven execution until route-level authentication tests, cryptographic tests, replay tests, authorization tests, isolation tests, and a security audit pass. Production release requires separate human approval.
