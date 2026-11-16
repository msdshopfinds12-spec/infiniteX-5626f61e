# Approval API Integration Gate

**Status: INTERNAL VERIFICATION SERVICE IMPLEMENTED; NO HTTP APPROVAL ROUTE EXISTS.**

The backend exposes health, tasks, and memory routers. The approval security path is being built as an internal service before any public HTTP endpoint is exposed.

## Internal verification sequence

1. FastAPI resolves `get_approval_reviewer`, which depends on JWT-verified `get_current_principal`.
2. A future proposal repository loads immutable repository, branch, base-commit, digest, policy-version, and file-path scope from trusted server-side storage.
3. `load_approval_keyring` loads only the configured `INFINITEGX_APPROVAL_PUBLIC_KEYS_JSON` public keys. Missing or malformed configuration fails closed.
4. `verify_approval_request` validates the typed request, resolves the key ID, and calls the reviewer-bound Ed25519 verifier.
5. The verifier checks signature, issuer, audience, authenticated reviewer, role, repository, branch, base commit, proposal digest, policy version, exact file set, and time bounds.
6. A future approval service may atomically consume the nonce and create an immutable apply-intent record in one database transaction.
7. Any patch executor must be a separate isolated worker with a strict filesystem, network, tool, and resource allowlist and no production credentials.

## Implemented in the current hardening branch

- authenticated reviewer adapter
- strict bounded approval request schema
- immutable trusted Ed25519 keyring and key-ID rotation primitive
- server-settings keyring loader with fail-closed behavior
- internal orchestration service joining request, keyring, reviewer, and trusted scope
- unit tests authored for valid signature, wrong key, unknown key ID, reviewer mismatch, proposal-scope mismatch, and invalid request object

## Not implemented

- HTTP approval endpoint or approval issuer
- proposal persistence and immutable scope repository
- durable nonce-store adapter and atomic apply-intent transaction
- immutable audit-event persistence
- isolated patch execution worker
- migration files or database changes
- executed test evidence

## Release gate

Do not enable approval-driven execution until route-level authentication tests, cryptographic tests, replay tests, authorization tests, transaction tests, isolation tests, and a security audit pass. Production release requires separate human approval.
