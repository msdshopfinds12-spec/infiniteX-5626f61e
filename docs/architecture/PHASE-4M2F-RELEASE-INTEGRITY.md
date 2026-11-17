# Phase 4M.2F — Release Artifact Integrity

## Scope

This change adds a dependency-free SHA-256 manifest generator and verifier for the
static production artifact in `dist/`. It is intended to detect accidental or
unexpected artifact changes between packaging and verification.

## Commands

```sh
node --test scripts/release-integrity.test.mjs
node scripts/release-integrity.mjs create dist
node scripts/release-integrity.mjs verify dist
```

The release workflow generates `dist/release-manifest.txt` first, then generates
`dist/SHA256SUMS.txt`, then verifies the complete artifact set before upload.

## Security properties

- Uses Node.js built-in `node:crypto`; no additional package or service is required.
- Hashes every regular file below the artifact root, excluding only the checksum
  manifest itself.
- Rejects symbolic links, special filesystem entries, unsafe paths, duplicate
  records, malformed hashes, missing files, extra files, and content mismatches.
- Sorts file paths to make the manifest deterministic.
- Fails instead of silently overwriting an existing checksum manifest.
- Keeps CI permissions read-only and performs no deployment.

## Important limitation

A checksum manifest is an integrity check, not a digital signature or proof of
publisher identity. An attacker able to replace both the artifact and its manifest
could produce a matching pair. Trust still depends on GitHub Actions access
controls, the exact source commit, protected review, and the artifact service.
Do not treat this manifest alone as signed provenance or deployment authorization.

## Release boundary

This workflow packages a release candidate only. It does not deploy, migrate,
publish, or change production resources. Production release remains a separate
human-approved operation.
