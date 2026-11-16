# Approval Public-Key Configuration and Rotation

Status: IMPLEMENTED CONFIGURATION PRIMITIVE — NOT CONNECTED TO AN HTTP ENDPOINT OR ISSUER

## Trust boundary

The API verifier receives only Ed25519 public keys. Private signing keys must remain in a separate approval issuer backed by a managed secret store or KMS. Never place private keys in repository files, environment examples, frontend bundles, CI logs, or test fixtures.

The environment setting `INFINITEGX_APPROVAL_PUBLIC_KEYS_JSON` accepts JSON shaped as:

```json
{
  "keys": {
    "2026-01": "<base64-encoded-32-byte-Ed25519-public-key>",
    "2026-02": "<base64-encoded-32-byte-Ed25519-public-key>"
  }
}
```

The keyring rejects malformed JSON, duplicate JSON keys, unknown top-level fields, invalid key IDs, invalid Base64, non-32-byte keys, empty key sets, and more than eight keys. Key IDs are immutable identifiers; never reuse a retired ID for different key material.

## Planned rotation procedure

1. Generate a new Ed25519 key pair inside the trusted issuer/KMS boundary.
2. Publish the new public key under a new unique key ID while retaining the old public key.
3. Deploy verifier configuration containing both public keys.
4. Verify that all verifier instances recognize the new key ID.
5. Switch the issuer to sign new approvals with the new private key.
6. Keep the old public key only for the maximum approval lifetime plus clock-skew and deployment overlap.
7. Remove the old public key from verifier configuration.
8. Record key creation, activation, retirement, and operator identity in an immutable security audit system.

## Fail-closed rules

- Unknown, retired, malformed, or missing key IDs must reject verification.
- No fallback key, default key, or caller-supplied public key is permitted.
- A public-key configuration error must make the approval verification dependency unavailable; it must not silently skip signature verification.
- Key rotation is configuration deployment, not an API caller operation.
- Private-key rotation and signing remain out of scope until a separate issuer service and its access controls are reviewed.

## Current implementation boundary

Implemented in this change:
- bounded keyring parser and immutable key-ID lookup
- strict request-envelope validation for key ID, JSON payload size, and 64-byte Ed25519 signature encoding
- unit tests authored for valid and invalid configuration/envelopes

Not implemented:
- environment setting wiring into a route dependency
- reviewer approval endpoint or issuer
- proposal persistence and immutable scope loading
- durable nonce consumption
- audit-event persistence
- apply worker or sandbox
- executed test evidence
