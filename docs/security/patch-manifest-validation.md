# Patch Manifest and Policy Validation Boundary

## Status

- CODED: immutable manifest/file-entry contracts, canonical SHA-256 digest, exact approval-scope matching, protected-path checks, size/count limits, branch allowlist, and validation report.
- NOT IMPLEMENTED: Git tree inspection, blob-content verification, symlink detection from repository objects, patch parsing, filesystem writes, GitHub commit creation, or patch application.
- NOT TESTED: tests are authored but have not been executed in this change.
- NOT AUTHORIZED: branch writes outside the existing hardening-branch scope, PR, merge, migration, deployment, or release.

## Trust model

The validator accepts an ApprovalApplyIntent loaded by a trusted service from durable storage after cryptographic approval verification and atomic nonce consumption. The caller must not construct this intent from request JSON. The manifest digest must equal the proposal digest in that intent, and the exact set of paths must equal the approved path set.

## Canonical digest

The digest is SHA-256 over UTF-8 canonical JSON with sorted object keys, compact separators, and sorted file entries. It covers proposal ID, repository ID, target branch, base commit SHA, and each file's path, action, content digest, and byte size. The digest field itself and the symlink flag are excluded; symlinks are independently rejected.

The approval service must sign this exact canonical digest. Any change to file metadata changes the digest and invalidates approval.

## Fail-closed policy

- Exact allowlisted branch: `fix/infiniteX-foundation-hardening`.
- Reject `main` and `master`.
- Reject absolute paths, traversal, empty/dot components, Windows drive paths, backslashes, control characters, and non-portable separators.
- Reject protected files/directories including environment files, key/certificate files, VCS metadata, dependency directories, and CI workflow/action definitions.
- Reject symlinks and case-insensitive path collisions.
- Default maximum 50 files, 1 MB per file, 5 MB aggregate.
- Require exact match with the approval's file path set.
- Validate SHA-256 formatting and compare both manifest digest and approved proposal digest.

## Critical limitations

A manifest's `is_symlink` field is only a declaration. A future Git adapter must inspect Git tree modes and reject symlink entries independently; it must also reject submodules, verify blob bytes against content digests, and pin the exact base commit. This pure validator cannot prove that the filesystem or Git tree matches the manifest.

The validator returns policy findings only. It does not apply files, write commits, call GitHub, or authorize a merge or deployment. A passing report is necessary but not sufficient for patch application.
